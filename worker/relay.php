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
const AUTOLOAD   = '/var/www/phaza-portal-staging/current/vendor/autoload.php';
const RECIPIENTS = ['attarawneh@phaza.io', 'znasser@phaza.io'];
const ORIGIN     = 'https://phaza.io';
const RATE_DIR   = '/tmp/phaza-connect-rate';
const RATE_MAX   = 20;               // submissions per IP per hour
const AUTOREPLY  = __DIR__ . '/autoreply.html';

function envv(string $key): string
{
    static $env = null;
    if ($env === null) {
        $env = [];
        foreach (file(ENV_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $env[trim($k)] = trim(trim($v), "\"'");
        }
    }
    return $env[$key] ?? '';
}

function mailer(): Symfony\Component\Mailer\Mailer
{
    static $m = null;
    if ($m === null) {
        require_once AUTOLOAD;
        $dsn = sprintf(
            'smtp://%s:%s@%s:%s',
            rawurlencode(envv('MAIL_USERNAME')),
            rawurlencode(envv('MAIL_PASSWORD')),
            envv('MAIL_HOST'),
            envv('MAIL_PORT') ?: '587',
        );
        $m = new Symfony\Component\Mailer\Mailer(
            Symfony\Component\Mailer\Transport::fromDsn($dsn)
        );
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

    /* One message per recipient. Exchange Online throttles multi-recipient
       transactions from an unfamiliar IP with "452 4.5.3 Too many recipients",
       which would defer half the team's copy on every submission. */
    $failed = [];
    foreach (RECIPIENTS as $to) {
        $email = (new Symfony\Component\Mime\Email())
            ->from(new Symfony\Component\Mime\Address(
                envv('MAIL_FROM_ADDRESS') ?: 'no-reply@phaza.io',
                'Phaza Connect'
            ))
            ->to($to)
            ->replyTo((string) $d['email'])
            ->subject('Phaza Connect — ' . (($d['purpose'] ?? '') ?: 'Enquiry') . ' — ' . ($d['organisation'] ?? ''))
            ->html(
                '<h2 style="font:600 15px system-ui">New enquiry from phaza.io</h2>'
                . '<table style="font:14px system-ui;border-collapse:collapse">' . $rows . '</table>'
                . '<p style="font:14px system-ui;white-space:pre-wrap">' . $esc($d['message'] ?? '') . '</p>'
            );

        try {
            mailer()->send($email);
        } catch (Throwable $e) {
            $failed[] = $to . ': ' . $e->getMessage();
        }
    }

    /* Only a total failure is an error: if one address bounces the enquiry
       still reached the team, and the visitor should not be told to retry. */
    if (count($failed) === count(RECIPIENTS)) {
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
        ->from(new Symfony\Component\Mime\Address('no-reply@phaza.io', 'Phaza'))
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
    if ($mode !== '--test') {
        fwrite(STDERR, "usage: php relay.php --test | --test-autoreply you@example.com\n");
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

foreach (['name', 'organisation', 'country', 'email'] as $req) {
    if (trim((string) ($d[$req] ?? '')) === '') { http_response_code(422); exit; }
}
if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) { http_response_code(422); exit; }
foreach ($d as $k => $v) { $d[$k] = mb_substr(trim((string) $v), 0, 2000); }

try {
    send_mail($d);
} catch (Throwable $e) {
    error_log('phaza-connect: ' . $e->getMessage());
    http_response_code(502);
    exit;
}

/* The visitor's confirmation is best-effort: the enquiry is already with the
   team, so a bounce or a bad address must not turn a delivered message into
   an error the visitor sees. */
try {
    send_autoreply($d);
} catch (Throwable $e) {
    error_log('phaza-connect autoreply: ' . $e->getMessage());
}

header('Content-Type: application/json');
echo '{"ok":true}';
