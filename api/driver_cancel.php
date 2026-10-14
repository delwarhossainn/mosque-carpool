<?php
// Driver cancels an accepted trip before pickup. The request goes back to pending
// so another driver can accept it, and the rider is notified.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();
$id = (int)($b['request_id'] ?? 0);

$st = $pdo->prepare(
  "SELECT id, rider_id, mosque_id FROM ride_requests
   WHERE id = ? AND driver_id = ? AND status = 'accepted' LIMIT 1"
);
$st->execute([$id, $u['id']]);
$req = $st->fetch();
if (!$req) fail('Trip not found or already started.', 404);

$pdo->prepare("UPDATE ride_requests SET status = 'pending', driver_id = NULL WHERE id = ?")
    ->execute([$id]);

// Take driver offline so they don't immediately get it back.
$pdo->prepare('UPDATE driver_status SET is_online = 0 WHERE user_id = ?')->execute([$u['id']]);

notify((int)$req['rider_id'], 'driver_cancelled',
  'Driver cancelled',
  'Your driver had to cancel. Your request is back in the queue — another driver can accept it.');

respond(['ok' => true]);
