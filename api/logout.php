<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$pdo = db();
$pdo->prepare('DELETE FROM sessions WHERE token = ?')->execute([$u['token']]);
// Going offline on logout so no ghost drivers linger.
$pdo->prepare('UPDATE driver_status SET is_online = 0 WHERE user_id = ?')->execute([$u['id']]);
respond(['ok' => true]);
