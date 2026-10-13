<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$rows = db()->prepare(
  'SELECT id, type, title, body, is_read, created_at FROM notifications
   WHERE user_id = ? ORDER BY id DESC LIMIT 30'
);
$rows->execute([$u['id']]);
$unread = db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
$unread->execute([$u['id']]);
respond(['ok' => true, 'unread' => (int)$unread->fetchColumn(), 'notifications' => $rows->fetchAll()]);
