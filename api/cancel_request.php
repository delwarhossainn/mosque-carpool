<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$id = (int)($b['request_id'] ?? 0);

$st = db()->prepare(
  "UPDATE ride_requests SET status = 'cancelled'
   WHERE id = ? AND rider_id = ? AND status = 'pending'"
);
$st->execute([$id, $u['id']]);
if ($st->rowCount() === 0) fail('Request not found or no longer pending.', 404);
respond(['ok' => true]);
