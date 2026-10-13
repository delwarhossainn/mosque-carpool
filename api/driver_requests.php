<?php
// Online driver's incoming queue: pending requests for THEIR mosque,
// from riders of the SAME gender, nearest first.
// Drivers the rider pool: riders never appear here, only drivers poll this.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$pdo = db();

$st = $pdo->prepare('SELECT is_online, mosque_id, lat, lng FROM driver_status WHERE user_id = ?');
$st->execute([$u['id']]);
$d = $st->fetch();
if (!$d || !$d['is_online']) fail('Go online first.', 403);

$sql = "
  SELECT r.id, r.pickup_lat, r.pickup_lng, r.note, r.created_at,
         u.name AS rider_name,
         (6371 * ACOS(
            COS(RADIANS(:lat)) * COS(RADIANS(r.pickup_lat)) *
            COS(RADIANS(r.pickup_lng) - RADIANS(:lng)) +
            SIN(RADIANS(:lat)) * SIN(RADIANS(r.pickup_lat))
         )) AS dist_km
  FROM ride_requests r
  JOIN users u ON u.id = r.rider_id
  WHERE r.status = 'pending'
    AND r.mosque_id = :mosque_id
    AND u.gender = :gender
    AND u.id <> :me
    AND NOT EXISTS (
      SELECT 1 FROM ride_declines d
      WHERE d.request_id = r.id AND d.driver_id = :me2
    )
  ORDER BY dist_km ASC
  LIMIT 20";
$q = $pdo->prepare($sql);
$q->execute([
  ':lat' => $d['lat'], ':lng' => $d['lng'],
  ':mosque_id' => $d['mosque_id'], ':gender' => $u['gender'],
  ':me' => $u['id'], ':me2' => $u['id'],
]);
$rows = $q->fetchAll();
foreach ($rows as &$r) { $r['dist_km'] = round((float)$r['dist_km'], 1); }
respond(['ok' => true, 'requests' => $rows]);
