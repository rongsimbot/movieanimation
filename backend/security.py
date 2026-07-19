"""
MovieAnimation.ai - Security Middleware
Phase 11: Beta Testing - Security Hardening

Provides:
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Input sanitization
- Request validation middleware
- SQL injection guard
"""

import re
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("movieanimation.security")

# ─── Security Headers ──────────────────────────────────────────────────────────

SECURITY_HEADERS = {
    # Content Security Policy - restrict resource loading
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https: blob:; "
        "media-src 'self' https: blob:; "
        "connect-src 'self' https://api.lumalabs.ai https://api.runwayml.com https://api.anthropic.com https://api.openai.com https://api.elevenlabs.io; "
        "font-src 'self' data:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "upgrade-insecure-requests"
    ),
    # Prevent MIME type sniffing
    "X-Content-Type-Options": "nosniff",
    # Prevent clickjacking
    "X-Frame-Options": "DENY",
    # Cross-site scripting protection
    "X-XSS-Protection": "1; mode=block",
    # Referrer policy
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Permissions policy
    "Permissions-Policy": (
        "camera=(), "
        "microphone=(), "
        "geolocation=(), "
        "payment=(), "
        "usb=()"
    ),
    # HSTS (only in production)
    # "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    # Server info hiding
    "Server": "MovieAnimation",
    # Cross-origin policies
    "Cross-Origin-Embedder-Policy": "unsafe-none",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "cross-origin",
}


def get_security_headers(env: str = "development") -> Dict[str, str]:
    """Get security headers based on environment."""
    headers = dict(SECURITY_HEADERS)
    
    # Add HSTS in production
    if env == "production":
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    else:
        # Relax CSP for development
        headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(
            "'unsafe-eval'", "'unsafe-eval' http://localhost:* ws://localhost:*"
        )
    
    return headers


# ─── Input Sanitization ────────────────────────────────────────────────────────

# SQL injection patterns to guard against
SQL_INJECTION_PATTERNS = [
    r"(?i)(\bUNION\b.*\bSELECT\b)",
    r"(?i)(\bSELECT\b.*\bFROM\b.*--)",
    r"(?i)(\bINSERT\b.*\bINTO\b.*\bVALUES\b)",
    r"(?i)(\bDELETE\b.*\bFROM\b)",
    r"(?i)(\bDROP\b\s+\bTABLE\b)",
    r"(?i)(\bALTER\b\s+\bTABLE\b)",
    r"(?i)(\bEXEC\b\s*\(.*\))",
    r"(?i)(\bEXECUTE\b\s+\bIMMEDIATE\b)",
    r"(\bOR\b\s+['\"]?\d['\"]?\s*=\s*['\"]?\d['\"]?)",
    r"(\bAND\b\s+['\"]?\d['\"]?\s*=\s*['\"]?\d['\"]?)",
    r"(?i)(\/\*.*\*\/)",  # SQL comments
    r"(?:--\s)",  # SQL line comments
]

# XSS patterns
XSS_PATTERNS = [
    r"<script[\s>]",
    r"javascript\s*:",
    r"on\w+\s*=\s*[\"\\']?[^\"\\'>]*[\"\\']?",
    r"<iframe[\s>]",
    r"<embed[\s>]",
    r"<object[\s>]",
    r"data\s*:\s*text\/html",
    r"expression\s*\(.*\)",
    r"eval\s*\(.*\)",
]


def sanitize_string(value: str, max_length: int = 5000) -> str:
    """Sanitize a string input: strip HTML, truncate."""
    if not isinstance(value, str):
        return ""
    # Strip HTML tags
    clean = re.sub(r'<[^>]*>', '', value)
    # Remove null bytes
    clean = clean.replace('\x00', '')
    # Truncate
    if len(clean) > max_length:
        clean = clean[:max_length]
    return clean.strip()


def detect_sql_injection(value: str) -> bool:
    """Check if a string contains potential SQL injection patterns."""
    if not value:
        return False
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value):
            logger.warning(f"SQL injection pattern detected: {pattern}")
            return True
    return False


def detect_xss(value: str) -> bool:
    """Check if a string contains potential XSS patterns."""
    if not value:
        return False
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value):
            logger.warning(f"XSS pattern detected: {pattern}")
            return True
    return False


def sanitize_email(email: str) -> Optional[str]:
    """Validate and sanitize email address."""
    if not email:
        return None
    email = email.strip().lower()
    # Basic email validation pattern
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if re.match(pattern, email) and len(email) <= 254:
        return email
    return None


def validate_input(value: str, field_name: str, 
                   min_len: int = 1, max_len: int = 5000) -> Optional[str]:
    """
    Comprehensive input validation for user-provided strings.
    Returns sanitized string or None if validation fails.
    """
    if not value or not isinstance(value, str):
        return None
    
    value = sanitize_string(value, max_len)
    
    if len(value) < min_len:
        logger.warning(f"Input too short for {field_name}: {len(value)} < {min_len}")
        return None
    
    if detect_sql_injection(value):
        logger.warning(f"SQL injection attempt blocked in {field_name}")
        return None
    
    if detect_xss(value):
        logger.warning(f"XSS attempt blocked in {field_name}")
        return None
    
    return value


# ─── Rate Limit Configuration ──────────────────────────────────────────────────

# Per-endpoint rate limits (requests per minute)
RATE_LIMITS = {
    "default": "60/minute",
    "/api/auth/register": "5/minute",
    "/api/auth/login": "10/minute",
    "/api/generate/scene": "20/minute",
    "/api/render": "5/minute",
    "/api/beta/invite": "5/minute",
    "/api/feedback": "15/minute",
    "/api/analytics/event": "60/minute",
}

# Rate limit by IP for unauthenticated endpoints
IP_RATE_LIMITS = {
    "/api/auth/login": "20/minute",
    "/api/auth/register": "10/minute",
}


def get_rate_limit(path: str) -> str:
    """Get rate limit string for a specific endpoint."""
    for prefix, limit in sorted(RATE_LIMITS.items(), key=lambda x: -len(x[0])):
        if path.startswith(prefix):
            return limit
    return RATE_LIMITS["default"]


# ─── Security Audit Logging ────────────────────────────────────────────────────

def log_security_event(event_type: str, details: Dict[str, Any], 
                       ip: Optional[str] = None, user_id: Optional[str] = None):
    """Log a security-related event for audit trail."""
    log_data = {
        "event": event_type,
        "ip": ip or "unknown",
        "user_id": user_id or "anonymous",
        **details
    }
    logger.warning(f"SECURITY: {json.dumps(log_data)}")


# Needed for log_security_event
import json
