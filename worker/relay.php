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

function send_mail(array $d): void
{
    require AUTOLOAD;

    $dsn = sprintf(
        'smtp://%s:%s@%s:%s',
        rawurlencode(envv('MAIL_USERNAME')),
        rawurlencode(envv('MAIL_PASSWORD')),
        envv('MAIL_HOST'),
        envv('MAIL_PORT') ?: '587',
    );
    $mailer = new Symfony\Component\Mailer\Mailer(
        Symfony\Component\Mailer\Transport::fromDsn($dsn)
    );

    $esc  = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    $rows = '';
    foreach (['purpose', 'name', 'organisation', 'country', 'email', 'page', 'sent_at'] as $k) {
        if (!empty($d[$k])) {
            $rows .= '<tr><td style="padding:3px 14px 3px 0;color:#777">' . $esc($k)
                   . '</td><td>' . $esc($d[$k]) . '</td></tr>';
        }
    }

    $email = (new Symfony\Component\Mime\Email())
        ->from(new Symfony\Component\Mime\Address(
            envv('MAIL_FROM_ADDRESS') ?: 'no-reply@phaza.io',
            'Phaza Connect'
        ))
        ->to(...RECIPIENTS)
        ->replyTo((string) $d['email'])
        ->subject('Phaza Connect — ' . (($d['purpose'] ?? '') ?: 'Enquiry') . ' — ' . ($d['organisation'] ?? ''))
        ->html(
            '<h2 style="font:600 15px system-ui">New enquiry from phaza.io</h2>'
            . '<table style="font:14px system-ui;border-collapse:collapse">' . $rows . '</table>'
            . '<p style="font:14px system-ui;white-space:pre-wrap">' . $esc($d['message'] ?? '') . '</p>'
        );

    $mailer->send($email);
}

/* ---- CLI self-test ----------------------------------------------------- */
if (PHP_SAPI === 'cli') {
    if (($argv[1] ?? '') !== '--test') {
        fwrite(STDERR, "usage: php relay.php --test\n");
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

header('Content-Type: application/json');
echo '{"ok":true}';
