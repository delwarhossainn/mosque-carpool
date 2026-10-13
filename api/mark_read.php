<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
db()->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')->execute([$u['id']]);
respond(['ok' => true]);
