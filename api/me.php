<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$st = db()->prepare(
  'SELECT d.is_online, d.mosque_id, m.name AS mosque_name
   FROM driver_status d LEFT JOIN mosques m ON m.id = d.mosque_id
   WHERE d.user_id = ?'
);
$st->execute([$u['id']]);
$u['driver'] = $st->fetch() ?: ['is_online'=>0,'mosque_id'=>null,'mosque_name'=>null];
$unread = db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
$unread->execute([$u['id']]);
$u['unread_notifications'] = (int)$unread->fetchColumn();
respond(['ok' => true, 'user' => $u]);
