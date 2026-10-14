<?php
// Minimal Web Push sender (RFC 8291 + RFC 8292 VAPID).
// Uses PHP openssl for ECDH P-256 and AES-128-GCM.

function b64url_decode(string $s): string {
  $s = strtr($s, '-_', '+/');
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  return base64_decode($s);
}

function b64url_encode(string $data): string {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function hkdf(string $ikm, string $salt, string $info, int $len): string {
  $prk = hash_hmac('sha256', $ikm, $salt, true);
  $okm = '';
  $t = '';
  for ($i = 1; strlen($okm) < $len; $i++) {
    $t = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
    $okm .= $t;
  }
  return substr($okm, 0, $len);
}

function send_web_push(string $endpoint, string $p256dh, string $auth,
                       string $vapid_pub, string $vapid_priv,
                       string $title, string $body): bool {
  $payload = json_encode(['title' => $title, 'body' => $body, 'url' => '/']);
  if ($payload === false) return false;

  // 1. Ephemeral ECDH keypair
  $ephemeral = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
  if (!$ephemeral) return false;
  $details = openssl_pkey_get_details($ephemeral);
  $ephem_pub_raw = $details['ec']['x'] . $details['ec']['y']; // 64 bytes, need 0x04 prefix
  $ephem_pub = "\x04" . $ephem_pub_raw;

  // 2. Shared secret via ECDH with subscriber's public key
  $sub_pub_raw = b64url_decode($p256dh); // 65 bytes uncompressed
  // Convert to PEM for openssl
  $sub_pub_pem = "-----BEGIN PUBLIC KEY-----\n" .
    chunk_split(base64_encode("\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $sub_pub_raw), 64, "\n") .
    "-----END PUBLIC KEY-----\n";
  $sub_pubkey = openssl_pkey_get_public($sub_pub_pem);
  if (!$sub_pubkey) return false;

  // Derive shared secret: use openssl_pkey_derive (PHP 8+ supports ECDH)
  $shared_secret = openssl_pkey_derive($sub_pubkey, $ephemeral, 32);
  if ($shared_secret === false || strlen($shared_secret) !== 32) return false;

  // 3. HKDF key derivation (RFC 8291)
  $auth_secret = b64url_decode($auth);
  $salt = random_bytes(16);

  $key_info = "WebPush: info\x00" . $sub_pub_raw . $ephem_pub;
  $ikm = hkdf($shared_secret, $auth_secret, $key_info, 32);

  $cek_info = "Content-Encoding: aes128gcm\x00";
  $cek = hkdf($ikm, $salt, $cek_info, 16);

  $nonce_info = "Content-Encoding: nonce\x00";
  $nonce = hkdf($ikm, $salt, $nonce_info, 12);

  // 4. Encrypt payload (pad to avoid leaking length)
  $plaintext = $payload . "\x02"; // 0x02 delimiter
  $pad_len = 0; // no extra padding for simplicity
  $tag = '';
  $ciphertext = openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
  if ($ciphertext === false) return false;

  // 5. Build encrypted message: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext+tag
  $rs = pack('N', 4096);
  $idlen = chr(65);
  $encrypted = $salt . $rs . $idlen . $ephem_pub . $ciphertext . $tag;

  // 6. VAPID JWT
  $url_parts = parse_url($endpoint);
  $aud = $url_parts['scheme'] . '://' . $url_parts['host'];
  $header = b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
  $claims = b64url_encode(json_encode([
    'aud' => $aud,
    'exp' => time() + 43200, // 12 hours
    'sub' => 'mailto:admin@mosque-carpool.app',
  ]));
  $unsigned = $header . '.' . $claims;

  // Sign with ES256 (ECDSA P-256 + SHA256)
  $priv_raw = b64url_decode($vapid_priv);
  // Build PEM from raw private key
  $priv_pem = "-----BEGIN EC PRIVATE KEY-----\n" .
    chunk_split(base64_encode(
      "\x30\x77\x02\x01\x01\x04\x20" . $priv_raw .
      "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"
    ), 64, "\n") .
    "-----END EC PRIVATE KEY-----\n";
  $privkey = openssl_pkey_get_private($priv_pem);
  if (!$privkey) return false;

  $sig_der = '';
  if (!openssl_sign($unsigned, $sig_der, $privkey, OPENSSL_ALGO_SHA256)) return false;
  // Convert DER to raw R||S
  $sig_raw = der_to_raw($sig_der);
  if ($sig_raw === false) return false;

  $jwt = $unsigned . '.' . b64url_encode($sig_raw);

  // 7. VAPID public key for header
  $vapid_pub_raw = b64url_decode($vapid_pub);

  // 8. Send POST
  $ch = curl_init($endpoint);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $encrypted,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
      'Content-Type: application/octet-stream',
      'Content-Encoding: aes128gcm',
      'TTL: 86400',
      'Authorization: vapid t=' . $jwt . ', k=' . b64url_encode($vapid_pub_raw),
    ],
  ]);
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  // 410 Gone = subscription expired, 404 = not found
  return $code >= 200 && $code < 300;
}

function der_to_raw(string $der) {
  // Parse DER ECDSA signature to 64-byte raw R||S
  $pos = 0;
  if (ord($der[$pos++]) !== 0x30) return false;
  $len = ord($der[$pos++]);
  if ($len & 0x80) {
    $n = $len & 0x7F;
    $len = 0;
    for ($i = 0; $i < $n; $i++) $len = ($len << 8) | ord($der[$pos++]);
  }
  if (ord($der[$pos++]) !== 0x02) return false;
  $rlen = ord($der[$pos++]);
  $r = substr($der, $pos, $rlen); $pos += $rlen;
  if (ord($der[$pos++]) !== 0x02) return false;
  $slen = ord($der[$pos++]);
  $s = substr($der, $pos, $slen);

  // Strip leading zeros and pad to 32 bytes
  $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
  $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);
  if (strlen($r) !== 32 || strlen($s) !== 32) return false;
  return $r . $s;
}
