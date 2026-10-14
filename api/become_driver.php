<?php
// Rider converts their profile to a driver by adding vehicle details.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();

if (!empty($u['has_car'])) fail('You are already registered as a driver.', 409);

$vehicle = trim($b['vehicle'] ?? '');
$plate = trim($b['plate'] ?? '');

$st = $pdo->prepare('UPDATE users SET has_car = 1, car_details = ? WHERE id = ?');
$st->execute([$vehicle !== '' ? $vehicle . ($plate !== '' ? ' · Plate ending ' . $plate : '') : null, $u['id']]);

notify((int)$u['id'], 'driver_activated', 'You can now offer rides',
  'Your driver profile is active. Go to the Drive tab to go online.');

respond(['ok' => true]);
