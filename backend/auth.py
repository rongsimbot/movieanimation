"""
MovieAnimation.ai - Authentication Extensions
Phase 9: User Authentication

Provides:
- Password reset token generation & validation
- Email verification token management
- CSRF token generation & validation
- OAuth helper stubs (Google/GitHub)
- Session management utilities
- Login tracking (count, last_login_at)
"""

import os
import uuid
import json
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple

import bcrypt
import jwt
import psycopg2.extras

logger = logging.getLogger("movieanimation.auth")

# ─── Configuration ─────────────────────────────────────────────────────────────

JWT_SECRET = os.getenv("JWT_SECRET", "movieanimation-beta-secret-key-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
RESET_TOKEN_EXPIRY_HOURS = 1  # Password reset links expire in 1 hour
VERIFY_TOKEN_EXPIRY_HOURS = 24  # Email verification links expire in 24 hours
CSRF_TOKEN_LENGTH = 32

# OAuth config (loaded from env, optional)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
OAUTH_REDIRECT_BASE = os.getenv("OAUTH_REDIRECT_BASE", "http://localhost:3000")


# ─── Token Generation ──────────────────────────────────────────────────────────

def generate_reset_token() -> str:
    """Generate a secure password reset token."""
    return secrets.token_urlsafe(32)


def generate_verify_token() -> str:
    """Generate a secure email verification token."""
    return secrets.token_urlsafe(32)


def generate_csrf_token() -> str:
    """Generate a CSRF token for form protection."""
    return secrets.token_hex(CSRF_TOKEN_LENGTH)


def generate_session_id() -> str:
    """Generate a unique session identifier."""
    return uuid.uuid4().hex


# ─── JWT Utilities ─────────────────────────────────────────────────────────────

def create_jwt_token(user_id: str, email: str, extra_claims: Optional[dict] = None) -> str:
    """Create a signed JWT access token."""
    expiry = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": expiry,
        "jti": uuid.uuid4().hex,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


def create_magic_token(user_id: str, purpose: str, expiry_hours: int = 1) -> str:
    """Create a short-lived token for email verification or password reset."""
    expiry = datetime.now(timezone.utc) + timedelta(hours=expiry_hours)
    payload = {
        "sub": str(user_id),
        "purpose": purpose,
        "iat": datetime.now(timezone.utc),
        "exp": expiry,
        "jti": uuid.uuid4().hex,
        "type": "action",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_magic_token(token: str, expected_purpose: str) -> str:
    """
    Decode a magic link token and validate its purpose.
    Returns the user_id on success, raises ValueError on failure.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "action":
            raise ValueError("Not an action token")
        if payload.get("purpose") != expected_purpose:
            raise ValueError(f"Token purpose mismatch: expected {expected_purpose}")
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


# ─── Password Hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ─── CSRF Protection ───────────────────────────────────────────────────────────

def sign_csrf_token(token: str) -> str:
    """Sign a CSRF token with HMAC to prevent tampering."""
    sig = hmac.new(
        JWT_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{token}.{sig}"


def verify_csrf_token(signed_token: str) -> bool:
    """Verify a signed CSRF token."""
    try:
        token, sig = signed_token.rsplit(".", 1)
        expected_sig = hmac.new(
            JWT_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(sig, expected_sig)
    except (ValueError, AttributeError):
        return False


def get_csrf_token() -> Dict[str, str]:
    """Generate a new CSRF token and return both raw and signed versions."""
    raw = generate_csrf_token()
    signed = sign_csrf_token(raw)
    return {"token": signed, "raw": raw}


# ─── Database Operations ───────────────────────────────────────────────────────

def store_reset_token(conn, user_id: str, token: str) -> bool:
    """Store a password reset token in the database."""
    try:
        with conn.cursor() as cur:
            expires = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS)
            cur.execute(
                """UPDATE users SET password_reset_token = %s, password_reset_expires = %s
                   WHERE id = %s""",
                (token, expires, user_id),
            )
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to store reset token: {e}")
        conn.rollback()
        return False


def validate_reset_token(conn, token: str) -> Optional[str]:
    """Validate a password reset token and return the user_id if valid."""
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, password_reset_expires FROM users
                   WHERE password_reset_token = %s""",
                (token,),
            )
            user = cur.fetchone()
            if not user:
                return None
            if user["password_reset_expires"] and user["password_reset_expires"] < datetime.now(timezone.utc):
                return None  # Expired
            return str(user["id"])
    except Exception as e:
        logger.error(f"Failed to validate reset token: {e}")
        return None


def clear_reset_token(conn, user_id: str) -> bool:
    """Clear the password reset token after use."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL
                   WHERE id = %s""",
                (user_id,),
            )
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to clear reset token: {e}")
        conn.rollback()
        return False


def store_verify_token(conn, user_id: str, token: str) -> bool:
    """Store an email verification token in the database."""
    try:
        with conn.cursor() as cur:
            expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_EXPIRY_HOURS)
            cur.execute(
                """UPDATE users SET email_verify_token = %s, email_verify_expires = %s
                   WHERE id = %s""",
                (token, expires, user_id),
            )
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to store verify token: {e}")
        conn.rollback()
        return False


def verify_email_db(conn, token: str) -> Optional[str]:
    """Verify an email using the token. Returns user_id or None."""
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, email_verify_expires FROM users
                   WHERE email_verify_token = %s AND email_verified = false""",
                (token,),
            )
            user = cur.fetchone()
            if not user:
                return None
            if user["email_verify_expires"] and user["email_verify_expires"] < datetime.now(timezone.utc):
                return None  # Expired

            cur.execute(
                """UPDATE users SET email_verified = true, email_verify_token = NULL,
                   email_verify_expires = NULL WHERE id = %s""",
                (user["id"],),
            )
            conn.commit()
            return str(user["id"])
    except Exception as e:
        logger.error(f"Failed to verify email: {e}")
        conn.rollback()
        return None


def track_login(conn, user_id: str):
    """Update login count and last_login_at."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE users SET last_login_at = NOW(), login_count = login_count + 1
                   WHERE id = %s""",
                (user_id,),
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to track login: {e}")
        conn.rollback()


# ─── OAuth URL Builders ────────────────────────────────────────────────────────

def get_google_oauth_url() -> Optional[str]:
    """Build Google OAuth consent URL."""
    if not GOOGLE_CLIENT_ID:
        return None
    from urllib.parse import urlencode
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": f"{OAUTH_REDIRECT_BASE}/api/auth/oauth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def get_github_oauth_url() -> Optional[str]:
    """Build GitHub OAuth consent URL."""
    if not GITHUB_CLIENT_ID:
        return None
    from urllib.parse import urlencode
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": f"{OAUTH_REDIRECT_BASE}/api/auth/oauth/github/callback",
        "scope": "user:email",
        "allow_signup": "false",
    }
    return f"https://github.com/login/oauth/authorize?{urlencode(params)}"


def oauth_enabled() -> Dict[str, bool]:
    """Return which OAuth providers are configured."""
    return {
        "google": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
        "github": bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET),
    }


# ─── Session Management ────────────────────────────────────────────────────────

# In-memory session blacklist (for forced logout)
# In production, use Redis or database table
_session_blacklist: set = set()


def blacklist_session(jti: str) -> None:
    """Blacklist a JWT token by its jti claim (for logout)."""
    _session_blacklist.add(jti)
    logger.info(f"Session blacklisted: {jti[:8]}...")


def is_session_blacklisted(jti: str) -> bool:
    """Check if a JWT token has been blacklisted."""
    return jti in _session_blacklist


def cleanup_blacklist() -> int:
    """Remove stale entries that can't be checked anymore.
    In a real system, use TTL-based cleanup with Redis.
    Currently a no-op for the in-memory set.
    """
    return len(_session_blacklist)
