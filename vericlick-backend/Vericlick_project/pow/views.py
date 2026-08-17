import hashlib
import hmac
import json
import os
import time

from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

HMAC_SECRET = os.environ.get('POW_HMAC_SECRET', os.environ.get('SECRET_KEY', 'pow-change-me'))


def _get_client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def _generate_challenge(ip, difficulty=4):
    challenge_id = os.urandom(16).hex()
    challenge_bytes = os.urandom(16)
    challenge_hex = challenge_bytes.hex()
    server_nonce = os.urandom(16).hex()

    cache.set(f'pow:{challenge_id}', json.dumps({
        'challenge_hex': challenge_hex,
        'difficulty': difficulty,
        'ip': ip,
        'server_nonce': server_nonce,
        'created_at': time.time(),
        'used': False,
    }), timeout=300)

    sig = hmac.new(HMAC_SECRET.encode(), challenge_id.encode(), 'sha256').hexdigest()

    return {
        'challengeId': challenge_id,
        'challengeHex': challenge_hex,
        'difficulty': difficulty,
        'minAgeMs': 1500,
        'nonce': server_nonce,
        'sig': sig,
    }


def _leading_zero_bits(hex_str):
    binary = bin(int(hex_str, 16))[2:]
    count = 0
    for bit in binary:
        if bit == '0':
            count += 1
        else:
            break
    return count


def _verify_solution(data, ip):
    challenge_id = data.get('challengeId')
    nonce = data.get('nonce')
    submitted_hash = data.get('hash')
    server_nonce = data.get('challengeNonce')

    if not challenge_id or nonce is None or not submitted_hash or not server_nonce:
        return False, 'Missing required fields'

    stored = cache.get(f'pow:{challenge_id}')
    if not stored:
        return False, 'Challenge expired or not found'

    challenge = json.loads(stored)

    if challenge['used']:
        return False, 'Challenge already used'
    if challenge['ip'] != ip:
        return False, 'IP mismatch'
    if challenge['server_nonce'] != server_nonce:
        return False, 'Server nonce mismatch'

    challenge_bytes = bytes.fromhex(challenge['challenge_hex'])
    nonce_bytes = nonce.to_bytes(4, 'little')
    computed_hash = hashlib.sha256(challenge_bytes + nonce_bytes).hexdigest()

    if computed_hash != submitted_hash:
        return False, 'Invalid hash'

    required_bits = challenge['difficulty']
    if _leading_zero_bits(computed_hash) < required_bits:
        return False, 'Insufficient difficulty'

    solve_time = time.time() - challenge['created_at']
    if solve_time < 0.5:
        return False, 'Solved too fast'

    challenge['used'] = True
    cache.set(f'pow:{challenge_id}', json.dumps(challenge), timeout=300)

    clearance = {
        'ip': ip,
        'issued_at': time.time(),
        'expires_at': time.time() + 86400,
    }
    clearance_json = json.dumps(clearance)
    clearance_sig = hmac.new(
        HMAC_SECRET.encode(), clearance_json.encode(), 'sha256'
    ).hexdigest()

    return True, f'{clearance_json}|{clearance_sig}'


def verify_pow_cookie(request):
    """Verify a PoW clearance token from the request cookie. Returns True if valid."""
    token = request.COOKIES.get('_vc_pow')
    if not token:
        return False
    try:
        parts = token.rsplit('|', 1)
        if len(parts) != 2:
            return False
        payload_json, sig = parts
        expected_sig = hmac.new(
            HMAC_SECRET.encode(), payload_json.encode(), 'sha256'
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return False
        payload = json.loads(payload_json)
        if payload['expires_at'] < time.time():
            return False
        ip = _get_client_ip(request)
        if payload['ip'] != ip:
            return False
        return True
    except Exception:
        return False


@require_GET
def challenge_view(request):
    ip = _get_client_ip(request)
    difficulty = 4
    return JsonResponse(_generate_challenge(ip, difficulty))


@require_POST
def verify_view(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    ip = _get_client_ip(request)
    ok, result = _verify_solution(data, ip)

    if ok:
        response = JsonResponse({'token': result})
        response.set_cookie(
            '_vc_pow', result,
            max_age=86400, httponly=True, samesite='Lax',
        )
        return response
    else:
        return JsonResponse({'error': result}, status=403)
