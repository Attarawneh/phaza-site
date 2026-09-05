<?php
/**
 * Phaza Connect relay — runs on the Phaza portal droplet.
 *
 * Receives the enquiry form POST from https://phaza.io and emails it to the
 * team via Phaza's own SMTP (mail.phaza.io), using the staging portal's mail
 * configuration read from its .env at runtime. Secrets stay on the server;
 * the recipient addresses are never present in the public website.
 *
 * Deployed to /var/www/phaza-connect/relay.php, exposed by an nginx location
 * on portal.phaza.io. CLI self-test:  php relay.php --test
 */

declare(strict_types=1);

const ENV_FILE   = '/var/www/phaza-portal-staging/shared/.env';
const MAIL_ENV   = __DIR__ . '/mail.env';   // relay-only overrides, optional
const AUTOLOAD   = '/var/www/phaza-portal-staging/current/vendor/autoload.php';
const RECIPIENTS = ['attarawneh@phaza.io', 'znasser@phaza.io'];
const ORIGIN     = 'https://phaza.io';
const RATE_DIR   = '/tmp/phaza-connect-rate';
const RATE_MAX   = 20;               // submissions per IP per hour
const SPOOL_DIR  = __DIR__ . '/spool';
const SEEN_DIR   = '/tmp/phaza-connect-seen';
const SEEN_TTL   = 86400;            // remember a message for a day
const AUTOREPLY  = __DIR__ . '/autoreply.html';

function envv(string $key): string
{
    static $env = null;
    if ($env === null) {
        $env = [];
        /* The portal's .env first, then relay-only overrides. The portal
           application shares that file for its own mail, so anything specific
           to Phaza Connect belongs in mail.env where it cannot reconfigure
           the portal by accident. */
        foreach ([ENV_FILE, MAIL_ENV] as $file) {
            if (!is_readable($file)) {
                continue;
            }
            foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $env[trim($k)] = trim(trim($v), "\"'");
            }
        }
    }
    return $env[$key] ?? '';
}

function mailer(): Symfony\Component\Mailer\Mailer
{
    static $m = null;
    if ($m === null) {
        require_once AUTOLOAD;
        /* Two supported shapes: a mailbox credential, or an unauthenticated
           relay where the mail host trusts this machine by address. Blank
           MAIL_USERNAME selects the second — Symfony must not be handed an
           empty user:pass pair, it will try to authenticate with it. */
        $host = envv('MAIL_HOST') ?: 'mail.phaza.io';
        $port = envv('MAIL_PORT') ?: '587';
        $user = envv('MAIL_USERNAME');
        $dsn  = $user === ''
            ? sprintf('smtp://%s:%s', $host, $port)
            : sprintf(
                'smtp://%s:%s@%s:%s',
                rawurlencode($user),
                rawurlencode(envv('MAIL_PASSWORD')),
                $host,
                $port,
            );
        $transport = Symfony\Component\Mailer\Transport::fromDsn($dsn);
        /* Fail fast. A visitor must never sit on a spinner because the mail
           host is unreachable — a short timeout drops us into the spool. */
        if ($transport instanceof Symfony\Component\Mailer\Transport\Smtp\SmtpTransport) {
            $transport->getStream()->setTimeout(6);
        }
        /* Introduce ourselves properly. Left alone, Symfony greets with the
           local hostname, which resolves to 127.0.0.1 here — rspamd scores
           that as a forged HELO and rejects the message. */
        if ($transport instanceof Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport) {
            $transport->setLocalDomain(envv('MAIL_HELO') ?: 'portal.phaza.io');
        }
        $m = new Symfony\Component\Mailer\Mailer($transport);
    }
    return $m;
}

function send_mail(array $d): void
{
    require_once AUTOLOAD;

    $esc  = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    $rows = '';
    foreach (['purpose', 'name', 'organisation', 'country', 'email', 'page', 'sent_at'] as $k) {
        if (!empty($d[$k])) {
            $rows .= '<tr><td style="padding:3px 14px 3px 0;color:#777">' . $esc($k)
                   . '</td><td>' . $esc($d[$k]) . '</td></tr>';
        }
    }

    $text = "New enquiry from phaza.io\n\n";
    foreach (['purpose', 'name', 'organisation', 'country', 'email', 'page', 'sent_at'] as $k) {
        if (!empty($d[$k])) {
            $text .= '  ' . str_pad($k . ':', 15) . $d[$k] . "\n";
        }
    }
    $text .= "\n" . trim((string) ($d['message'] ?? '')) . "\n";

    /* One message per recipient. Exchange Online throttles multi-recipient
       transactions from an unfamiliar IP with "452 4.5.3 Too many recipients",
       which would defer half the team's copy on every submission. */
    $failed = [];
    $sentAny = false;
    foreach (RECIPIENTS as $to) {
        $email = (new Symfony\Component\Mime\Email())
            ->from(new Symfony\Component\Mime\Address(
                envv('MAIL_FROM_ADDRESS') ?: 'no-reply@phaza.io',
                'Phaza Connect'
            ))
            ->to($to)
            ->replyTo((string) $d['email'])
            ->subject('Phaza Connect — ' . (($d['purpose'] ?? '') ?: 'Enquiry') . ' — ' . ($d['organisation'] ?? ''))
            ->text($text)
            ->html(
                '<h2 style="font:600 15px system-ui">New enquiry from phaza.io</h2>'
                . '<table style="font:14px system-ui;border-collapse:collapse">' . $rows . '</table>'
                . '<p style="font:14px system-ui;white-space:pre-wrap">' . $esc($d['message'] ?? '') . '</p>'
            );

        try {
            mailer()->send($email);
            $sentAny = true;
        } catch (Throwable $e) {
            $failed[] = $to . ': ' . $e->getMessage();
            /* All recipients share one transport, so if the first attempt
               fails before anything has gone out the rest will fail the same
               way. Stop rather than making the visitor wait out one timeout
               per recipient. */
            if (!$sentAny) {
                break;
            }
        }
    }

    /* Only a total failure is an error: if one address bounces the enquiry
       still reached the team, and the visitor should not be told to retry. */
    if (!$sentAny) {
        throw new RuntimeException(implode(' | ', $failed));
    }
    foreach ($failed as $f) {
        error_log('phaza-connect partial: ' . $f);
    }
}

/** Plain-text twin of the <!--STEPS:x--> block chosen for the HTML part. */
function steps_text(string $variant): string
{
    $steps = [
        'tech' => [
            ['NOW', 'Your question is with the team - not a ticket queue. It goes to the engineer who can answer it.'],
            ['WITHIN A DAY', 'A written answer from someone who builds Salam: architecture, parameters, training data, deployment, sovereignty. Specifics, not a brochure.'],
            ['IF IT HELPS', 'Where something is easier shown than written, we will offer to put Salam in front of you and walk through it.'],
        ],
        'demo' => [
            ['NOW', 'Your request is with the team - not a ticket queue. It goes to the person who will run the session.'],
            ['WITHIN A DAY', 'We propose times that suit your timezone and confirm what you want to see, so the session is built around your questions.'],
            ['AT THE SESSION', "Salam answering from your institution's own records, in your own language. A working system, not a scripted demo."],
        ],
        'both' => [
            ['NOW', 'Your message is with the team - not a ticket queue. It goes to the person who can answer it.'],
            ['WITHIN A DAY', 'A written answer to your technical questions, and times for a session that suit your timezone.'],
            ['AT THE SESSION', "Salam answering from your institution's own records, in your own language. A working system, not a scripted demo."],
        ],
    ][$variant];

    $out = '';
    foreach ($steps as [$when, $what]) {
        $body = wordwrap($what, 58, "\n" . str_repeat(' ', 18));
        $out .= '  ' . str_pad($when, 16) . $body . "\n";
    }
    return $out;
}

/**
 * Hold an enquiry that could not be sent.
 *
 * Mail can be down for reasons that have nothing to do with the visitor — a
 * rotated credential, a dead transport. Losing a ministry's enquiry to that
 * is far worse than delivering it late, so the payload is written to disk and
 * replayed later with `php relay.php --replay`.
 */
function spool(array $d): string|false
{
    if (!is_dir(SPOOL_DIR) && !@mkdir(SPOOL_DIR, 0700, true)) {
        return false;
    }
    $path = SPOOL_DIR . '/' . sprintf('%s-%s.json', date('Ymd-His'), substr(md5(json_encode($d)), 0, 8));
    return @file_put_contents($path, json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))
        ? $path : false;
}

/**
 * Does this read as something a person wrote?
 *
 * Deliberately script-agnostic: the vowel and consonant tests only run on
 * Latin and Cyrillic, because Arabic does not write short vowels and CJK does
 * not use spaces, so applying them everywhere would reject perfectly good
 * Arabic or Chinese. Everything else (character runs, symbol density, code
 * markers, self-repetition) holds in any script.
 *
 * Mirrored in assets/phaza-connect.js so the visitor hears about it before
 * sending. This copy is the authority.
 *
 * Returns a reason key, or null when the text is fine.
 */
function sense_reason(string $t, bool $short = false): ?string
{
    $t = trim($t);
    if ($t === '') {
        return null;                              // emptiness is handled elsewhere
    }

    /* Code, markup, SQL, shell — things aimed at a machine, not at us. */
    if (preg_match('#<\?php|</?[a-z][a-z0-9]*[\s/>]|\bfunction\s*[\w$]*\s*\(|=>|\b(?:var|let|const)\s+\w+\s*=|\bimport\s+[\w{]|\bdef\s+\w+\s*\(|\#include|\bSELECT\b.*\bFROM\b|\bDROP\s+TABLE\b|\bUNION\s+SELECT\b|\$_(?:GET|POST|SERVER|REQUEST)|\bcurl\s+-|\brm\s+-rf\b|\{\s*"[^"]+"\s*:#is', $t)) {
        return 'code';
    }

    /* The same character six times over: aaaaaaa, ......., ٧٧٧٧٧٧٧. */
    if (preg_match('/(.)\1{5,}/u', $t)) {
        return 'gibberish';
    }

    /* One unbroken run longer than any real word in any language. */
    if (preg_match('/\S{31,}/u', $t) && !preg_match('/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}\p{Thai}]/u', $t)) {
        return 'gibberish';
    }

    /* Mostly punctuation and digits rather than letters. */
    $letters = preg_match_all('/\p{L}/u', $t);
    $len     = mb_strlen(preg_replace('/\s+/u', '', $t));
    if ($len >= 8 && $letters / max($len, 1) < 0.45) {
        return 'gibberish';
    }

    /* Latin and Cyrillic only: unpronounceable runs and voweless words. */
    $latinish = preg_match('/[\p{Latin}\p{Cyrillic}]/u', $t)
             && !preg_match('/[\p{Arabic}\p{Han}\p{Hebrew}\p{Hangul}\p{Devanagari}\p{Thai}]/u', $t);
    if ($latinish) {
        if (preg_match('/[bcdfghjklmnpqrstvwxz]{6,}/i', $t)) {
            return 'gibberish';
        }
        foreach (preg_split('/\s+/u', $t) as $w) {
            $w = preg_replace('/[^\p{L}]/u', '', $w);
            if (mb_strlen($w) >= 6 && preg_match('/^[\p{Latin}]+$/u', $w)
                && !preg_match('/[aeiouyàáâäãåèéêëìíîïòóôöõùúûüæøœыаеиоуэюя]/iu', $w)) {
                return 'gibberish';
            }
        }
    }

    if ($short) {
        return null;                              // the rest only makes sense on prose
    }

    /* Link farms. One link is a reference; several is a pitch. */
    if (preg_match_all('#https?://|www\.#i', $t) >= 3) {
        return 'links';
    }

    /* The same line or sentence pasted over and over. */
    $units = preg_split('/[\r\n]+|(?<=[.!?؟。])\s+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
    $units = array_filter(array_map(fn ($u) => mb_strtolower(trim($u)), $units), fn ($u) => $u !== '');
    if ($units) {
        $counts = array_count_values($units);
        if (max($counts) >= 3) {
            return 'repeat';
        }
    }

    /* Padding: many words, almost none of them different. */
    $words = preg_split('/\s+/u', mb_strtolower($t), -1, PREG_SPLIT_NO_EMPTY);
    if (count($words) >= 12 && count(array_unique($words)) / count($words) < 0.35) {
        return 'repeat';
    }

    return null;
}

/** What we say back. Salam is the reason the bar exists, so it does the asking. */
function sense_message(string $reason): string
{
    return match ($reason) {
        'code'      => 'Please write in plain language rather than code. Salam reads every message that reaches us — give it something to read.',
        'links'     => 'That is a lot of links. Please describe your enquiry in your own words.',
        'repeat'    => 'This message repeats itself. Please say it once, in your own words — Salam reads it all.',
        'duplicate' => 'You have already sent this. Salam read it the first time; add only what is new.',
        default     => 'That does not read as language. Salam reads every message that reaches us — please write a sentence, in whichever language you prefer.',
    };
}

/**
 * Confirmation sent to the visitor from no-reply@phaza.io.
 *
 * Best-effort: a failure here must never fail the submission, because the
 * team notification has already gone out and the visitor's message is safe.
 */
function send_autoreply(array $d): void
{
    require_once AUTOLOAD;

    $esc  = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    $html = file_get_contents(AUTOREPLY);
    if ($html === false) {
        throw new RuntimeException('autoreply template missing');
    }

    $first   = trim(explode(' ', trim((string) $d['name']))[0]) ?: 'there';
    $message = trim((string) ($d['message'] ?? ''));
    $purpose = (string) (($d['purpose'] ?? '') ?: 'Enquiry');

    /* The form offers three reasons; anything unrecognised is treated as a
       question, which is the safest thing to promise an answer to. */
    $variant = match (strtolower(trim($purpose))) {
        'demo request'      => 'demo',
        'both'              => 'both',
        default             => 'tech',
    };

    /* Keep the matching <!--STEPS:x--> block, drop the others. */
    foreach (['tech', 'demo', 'both'] as $k) {
        $html = $k === $variant
            ? str_replace(["<!--STEPS:{$k}-->", "<!--/STEPS:{$k}-->"], '', $html)
            : preg_replace('#<!--STEPS:' . $k . '-->.*?<!--/STEPS:' . $k . '-->#s', '', $html);
    }

    $html = strtr($html, [
        '{{NAME}}'         => $esc($first),
        '{{EMAIL}}'        => $esc($d['email']),
        '{{PURPOSE}}'      => $esc($purpose),
        '{{ORGANISATION}}' => $esc($d['organisation']),
        '{{COUNTRY}}'      => $esc($d['country']),
        '{{MESSAGE}}'      => nl2br($esc($message)),
    ]);

    /* Drop the quoted-message block entirely when they left it blank. */
    if ($message === '') {
        $html = preg_replace('#<div style="margin-top:16px;padding:15px 17px;background:rgba\(255,255,255,0\.03\).*?</div>#s', '', $html, 1);
    }

    $text = "Thank you, {$first}.\n\n"
          . "Your message is with the Phaza team. A person — not an autoresponder — will read it "
          . "and reply to you directly at {$d['email']}, usually within one working day.\n\n"
          . "What we received\n"
          . "  Reason:       " . (($d['purpose'] ?? '') ?: 'Enquiry') . "\n"
          . "  Organisation: {$d['organisation']}\n"
          . "  Country:      {$d['country']}\n"
          . ($message !== '' ? "\n  \"{$message}\"\n" : '')
          . "\nWhat happens next\n" . steps_text($variant)
          . "\nSalam is a sovereign large language model: trained from scratch in the languages "
          . "your nation actually works in, and owned outright by the institution that deploys it.\n\n"
          . "Jordan · United Arab Emirates\nhttps://phaza.io\n\n"
          . "This confirmation was sent automatically from an unmonitored address — please don't "
          . "reply to it. Your actual reply will come from a member of the team.\n";

    $email = (new Symfony\Component\Mime\Email())
        ->from(new Symfony\Component\Mime\Address(
            envv('MAIL_FROM_ADDRESS') ?: 'no-reply@phaza.io',
            'Phaza'
        ))
        ->to(new Symfony\Component\Mime\Address((string) $d['email'], (string) $d['name']))
        ->subject('We received your message — Phaza')
        ->text($text)
        ->html($html);
    $email->getHeaders()->addTextHeader('Auto-Submitted', 'auto-replied');
    $email->getHeaders()->addTextHeader('X-Auto-Response-Suppress', 'All');

    mailer()->send($email);
}

/* ---- CLI self-test ----------------------------------------------------- */
if (PHP_SAPI === 'cli') {
    $mode = $argv[1] ?? '';
    if ($mode === '--test-autoreply') {
        $to = $argv[2] ?? '';
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            fwrite(STDERR, "usage: php relay.php --test-autoreply you@example.com\n");
            exit(1);
        }
        send_autoreply([
            'purpose'      => 'Demo request',
            'name'         => 'Aisha Rahman',
            'organisation' => 'Ministry of Digital Economy',
            'country'      => 'Jordan',
            'email'        => $to,
            'message'      => 'We are evaluating sovereign options for a national language model '
                            . 'and would like to see Salam working against our own records.',
        ]);
        echo "autoreply sent to {$to}\n";
        exit(0);
    }
    if ($mode === '--replay') {
        $files = glob(SPOOL_DIR . '/*.json') ?: [];
        if (!$files) { echo "spool empty\n"; exit(0); }
        $ok = 0;
        foreach ($files as $f) {
            $d = json_decode((string) file_get_contents($f), true);
            if (!is_array($d)) { echo "skip (unreadable): $f\n"; continue; }
            try {
                send_mail($d);
                try { send_autoreply($d); } catch (Throwable $e) {
                    echo "  note: autoreply failed for " . ($d['email'] ?? '?') . ": " . $e->getMessage() . "\n";
                }
                unlink($f);
                $ok++;
                echo "sent   " . basename($f) . "  " . ($d['email'] ?? '?') . "\n";
            } catch (Throwable $e) {
                /* One shared transport: if this failed, so will the rest.
                   Leave them for the next run rather than paying a timeout
                   per file. */
                echo "FAILED " . basename($f) . ": " . $e->getMessage() . "\n";
                echo "stopping; " . (count($files) - $ok) . " left for the next run\n";
                break;
            }
        }
        echo "replayed {$ok} of " . count($files) . "\n";
        exit($ok === count($files) ? 0 : 1);
    }
    if ($mode !== '--test') {
        fwrite(STDERR, "usage: php relay.php --test | --test-autoreply you@example.com | --replay\n");
        exit(1);
    }
    send_mail([
        'purpose'      => 'Technical inquiry',
        'name'         => 'Relay self-test',
        'organisation' => 'Phaza infrastructure',
        'country'      => 'UAE',
        'email'        => 'support@phaza.io',
        'message'      => 'Sent from the Phaza Connect relay on the portal droplet via mail.phaza.io. '
                        . 'If you can read this, the sovereign pipeline works.',
        'page'         => 'cli',
        'sent_at'      => date('c'),
    ]);
    echo "sent\n";
    exit(0);
}

/* ---- HTTP handling ------------------------------------------------------ */
header('Access-Control-Allow-Origin: ' . ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); exit; }

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== ORIGIN)     { http_response_code(403); exit; }

/* Rate limit: RATE_MAX submissions per IP per hour. */
@mkdir(RATE_DIR, 0700, true);
$bucket = RATE_DIR . '/' . md5(($_SERVER['REMOTE_ADDR'] ?? '') . date('YmdH'));
$n = (int) @file_get_contents($bucket);
if ($n >= RATE_MAX) { http_response_code(429); exit; }
file_put_contents($bucket, (string) ($n + 1));

$d = json_decode(file_get_contents('php://input'), true);
if (!is_array($d)) { http_response_code(400); exit; }

/* Honeypot: bots fill it; accept silently so they learn nothing. */
if (!empty($d['company_website'])) {
    header('Content-Type: application/json');
    echo '{"ok":true}';
    exit;
}

/** Refuse with a reason the form can show against the right field. */
function reject(int $code, string $field, string $message): never
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message, 'field' => $field]);
    exit;
}

foreach (['name', 'organisation', 'country', 'email'] as $req) {
    if (trim((string) ($d[$req] ?? '')) === '') {
        reject(422, $req, 'This field is required.');
    }
}
if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
    reject(422, 'email', 'That email address is not valid.');
}
foreach ($d as $k => $v) { $d[$k] = mb_substr(trim((string) $v), 0, 2000); }

/* Every free-text field has to read as something a person wrote. The three
   short fields are checked with the prose rules switched off. */
foreach (['name' => true, 'organisation' => true, 'country' => true, 'message' => false] as $field => $short) {
    $reason = sense_reason((string) ($d[$field] ?? ''), $short);
    if ($reason !== null) {
        reject(422, $field, sense_message($reason));
    }
}

/* The same message sent twice by the same person is not a second enquiry. */
$norm = mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) ($d['message'] ?? ''))));
if (mb_strlen($norm) >= 12) {
    @mkdir(SEEN_DIR, 0700, true);
    foreach (glob(SEEN_DIR . '/*') ?: [] as $old) {          // prune as we go
        if (time() - filemtime($old) > SEEN_TTL) { @unlink($old); }
    }
    foreach ([mb_strtolower((string) $d['email']), (string) ($_SERVER['REMOTE_ADDR'] ?? '')] as $who) {
        $mark = SEEN_DIR . '/' . md5($who . '|' . $norm);
        if (is_file($mark) && time() - filemtime($mark) < SEEN_TTL) {
            reject(429, 'message', sense_message('duplicate'));
        }
        touch($mark);
    }
}

/* Take the enquiry to disk first. It is the only step that must not fail, and
   it costs a millisecond — everything after this is delivery, which the
   visitor should never have to wait for. */
$held = spool($d);

header('Content-Type: application/json');
echo '{"ok":true}';

/* Answer now and hang up. Under PHP-FPM the visitor's browser is released
   here; the mail below runs on our own time, so an unreachable mail host
   costs them nothing. */
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

try {
    send_mail($d);
    try {
        send_autoreply($d);
    } catch (Throwable $e) {
        error_log('phaza-connect autoreply: ' . $e->getMessage());
    }
    if ($held !== false) {
        @unlink($held);                       // delivered, nothing left to replay
    }
} catch (Throwable $e) {
    error_log('phaza-connect send failed, held for replay: ' . $e->getMessage());
    if ($held === false) {
        error_log('phaza-connect ENQUIRY LOST (spool unavailable): ' . json_encode($d));
    }
}
