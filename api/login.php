<?php
require_once __DIR__ . '/_bootstrap.php';
$b = body();

$email = strtolower(trim($b['email'] ?? ''));
$pass  = $b['password'] ?? '';
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $pass === '') fail('Email and password are required.');

$st = db()->prepare('SELECT * FROM users WHERE email = ?');
$st->execute([$email]);
$u = $st->fetch();
if (!$u || !password_verify($pass, $u['password_hash'])) fail('Email or password is incorrect.', 401);

$token = bin2hex(random_bytes(32));
db()->prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)')->execute([$token, $u['id']]);
unset($u['password_hash']);

respond(['ok' => true, 'token' => $token, 'user' => $u]);
