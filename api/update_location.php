<?php
// Driver's live position ping during a trip. POST { lat, lng }
// Called every ~10s by the app while the driver has an active trip.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
if (!$u['has_car']) fail('Drivers only.', 403);
$b = body();
$lat = (float)($b['lat'] ?? 0);
$lng = (float)($b['lng'] ?? 0);
if ($lat == 0 && $lng == 0) fail('No position.');
db()->prepare('UPDATE driver_status SET lat = ?, lng = ? WHERE user_id = ?')
   ->execute([$lat, $lng, $u['id']]);
respond(['ok' => true]);
