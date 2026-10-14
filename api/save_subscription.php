<?php
// Save a Web Push subscription for the current user.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();

$endpoint = trim($b['endpoint'] ?? '');
$p256dh = trim($b['p256dh'] ?? '');
$auth = trim($b['auth'] ?? '');

if (!$endpoint || !$p256dh || !$auth) fail('Invalid subscription.', 400);

$st = $pdo->prepare(
  'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
   VALUES (?,?,?,?)
   ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), created_at = CURRENT_TIMESTAMP'
);
$st->execute([$u['id'], $endpoint, $p256dh, $auth]);

respond(['ok' => true]);
