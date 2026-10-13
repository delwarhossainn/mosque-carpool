<?php
// ============================================================
// Mosque Carpool — configuration
//
// cPanel: fill in your MySQL values below.
// Railway: leave the defaults — the app reads MYSQL* variables
//          from the environment automatically.
// ============================================================

function envv(string $k, string $d = ''): string {
    $v = getenv($k);
    return ($v === false || $v === '') ? $d : $v;
}

define('DB_HOST', envv('MYSQLHOST', 'localhost'));
define('DB_PORT', envv('MYSQLPORT', '3306'));
define('DB_NAME', envv('MYSQLDATABASE', 'yourcpaneluser_carpool')); // <-- cPanel: change
define('DB_USER', envv('MYSQLUSER',     'yourcpaneluser_carpool')); // <-- cPanel: change
define('DB_PASS', envv('MYSQLPASSWORD', 'YOUR_DB_PASSWORD_HERE'));  // <-- cPanel: change

// Any random long string — used to sign session tokens.
define('APP_SECRET', envv('APP_SECRET', 'CHANGE_ME_TO_A_LONG_RANDOM_STRING'));
