<?php
// Shared bootstrap for every API endpoint.
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../config.php';

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (is_array($data)) return $data;
    return $_POST;
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void {
    respond(['ok' => false, 'error' => $msg], $code);
}

/** Returns the authenticated user row, or null. */
function auth_user(): ?array {
    $token = null;
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        $ah = getallheaders();
        $h = $ah['Authorization'] ?? $ah['authorization'] ?? '';
    }
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) $token = $m[1];
    if (!$token) $token = body()['token'] ?? $_GET['token'] ?? null;
    if (!$token || strlen($token) !== 64) return null;
    $st = db()->prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?');
    $st->execute([$token]);
    $u = $st->fetch();
    if ($u) { $u['token'] = $token; unset($u['password_hash']); }
    return $u ?: null;
}

function require_auth(): array {
    $u = auth_user();
    if (!$u) fail('Not signed in.', 401);
    return $u;
}

function notify(int $user_id, string $type, string $title, string $body): void {
    $st = db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)');
    $st->execute([$user_id, $type, $title, $body]);

    // Also send Web Push (real phone banner) if the user has subscribed.
    try {
        require_once __DIR__ . '/_webpush.php';
        $vapid_pub = getenv('VAPID_PUBLIC_KEY');
        $vapid_priv = getenv('VAPID_PRIVATE_KEY');
        if (!$vapid_pub || !$vapid_priv) return;

        $subs = db()->prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
        $subs->execute([$user_id]);
        foreach ($subs->fetchAll() as $sub) {
            $ok = send_web_push($sub['endpoint'], $sub['p256dh'], $sub['auth'],
                                $vapid_pub, $vapid_priv, $title, $body);
            // Clean up dead subscriptions.
            if (!$ok) {
                db()->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
                   ->execute([$user_id, $sub['endpoint']]);
            }
        }
    } catch (Throwable $e) {
        // Push is best-effort; the in-app notification is already saved.
        error_log('Web push failed: ' . $e->getMessage());
    }
}

/** Great-circle distance in km. */
function km(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $r = 6371;
    $dLat = deg2rad($lat2 - $lat1); $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat/2)**2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2)**2;
    return 2 * $r * asin(sqrt($a));
}
