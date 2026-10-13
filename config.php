<?php
// ============================================================
// Mosque Carpool — configuration
//
// cPanel: fill in the placeholder values below.
// Railway: leave everything — the app builds its connection
//          from whatever Railway provides (MYSQLHOST etc.,
//          MYSQL_URL, or the root credentials), automatically.
// ============================================================

function envv(string $k, string $d = ''): string {
    $v = getenv($k);
    return ($v === false || $v === '') ? $d : $v;
}

// ---- Railway: assemble connection from any available source ----
$rwHost = envv('MYSQLHOST');
$rwPort = envv('MYSQLPORT', '3306');
$rwName = envv('MYSQLDATABASE');
$rwUser = envv('MYSQLUSER');
$rwPass = envv('MYSQLPASSWORD');

// Fall back to MYSQL_URL (mysql://user:pass@host:port/db).
$urlParts = parse_url(envv('MYSQL_URL'));
if (!is_array($urlParts)) $urlParts = [];
if ($rwHost === '' && !empty($urlParts['host'])) $rwHost = $urlParts['host'];
if (!empty($urlParts['port']))                     $rwPort = (string)$urlParts['port'];
if ($rwName === '' && !empty($urlParts['path']))   $rwName = ltrim($urlParts['path'], '/');
if ($rwUser === '' && !empty($urlParts['user']))   $rwUser = $urlParts['user'];
if ($rwPass === '' && !empty($urlParts['pass']))   $rwPass = $urlParts['pass'];

// Last resort: Railway's root credentials.
if ($rwUser === '' && envv('MYSQL_ROOT_PASSWORD') !== '') {
    $rwUser = 'root';
    $rwPass = envv('MYSQL_ROOT_PASSWORD');
    if ($rwName === '') $rwName = envv('MYSQL_DATABASE', 'railway');
    if ($rwHost === '') $rwHost = 'mysql.railway.internal';
}

$onRailway = ($rwHost !== '' && $rwUser !== '');

define('DB_HOST', $onRailway ? $rwHost : 'localhost');
define('DB_PORT', $onRailway ? $rwPort : '3306');
define('DB_NAME', $onRailway ? $rwName : 'yourcpaneluser_carpool'); // <-- cPanel: change
define('DB_USER', $onRailway ? $rwUser : 'yourcpaneluser_carpool'); // <-- cPanel: change
define('DB_PASS', $onRailway ? $rwPass : 'YOUR_DB_PASSWORD_HERE');  // <-- cPanel: change

// Any random long string — used to sign session tokens.
define('APP_SECRET', envv('APP_SECRET', 'CHANGE_ME_TO_A_LONG_RANDOM_STRING'));
