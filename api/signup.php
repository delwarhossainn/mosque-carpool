<?php
require_once __DIR__ . '/_bootstrap.php';
$b = body();

$name   = trim($b['name'] ?? '');
$email  = strtolower(trim($b['email'] ?? ''));
$pass   = $b['password'] ?? '';
$gender = $b['gender'] ?? '';
$hasCar = !empty($b['has_car']) ? 1 : 0;
$car    = trim($b['car_details'] ?? '');

if (strlen($name) < 2) fail('Please enter your name.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email.');
if (strlen($pass) < 6) fail('Password must be at least 6 characters.');
if (!in_array($gender, ['male','female'], true)) fail('Please select brother or sister.');

$pdo = db();
$exists = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$exists->execute([$email]);
if ($exists->fetch()) fail('An account with this email already exists.', 409);

$st = $pdo->prepare(
  'INSERT INTO users (name, email, password_hash, gender, has_car, car_details)
   VALUES (?,?,?,?,?,?)'
);
$st->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT), $gender, $hasCar, $car ?: null]);
$uid = (int)$pdo->lastInsertId();

$token = bin2hex(random_bytes(32));
$pdo->prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)')->execute([$token, $uid]);
$pdo->prepare('INSERT INTO driver_status (user_id, is_online) VALUES (?,0)')->execute([$uid]);

respond(['ok' => true, 'token' => $token,
  'user' => ['id'=>$uid,'name'=>$name,'email'=>$email,'gender'=>$gender,'has_car'=>$hasCar,'car_details'=>$car]]);
