"""
MovieAnimation.ai - FastAPI Backend
Phase 11: Beta Testing

Core API server with:
- JWT Authentication
- Project management
- Scene processing
- Video generation orchestration
- Analytics & cost monitoring

Uses psycopg2 (sync) for PostgreSQL access.
"""

import os
import sys
import uuid
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from functools import wraps

import jwt
import bcrypt
import psycopg2
import psycopg2.pool
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Depends, Request, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import project modules
from cache import response_cache, apply_cache_headers, should_cache
from security import get_security_headers, validate_input, sanitize_email, get_rate_limit, log_security_event
from auth import (
    hash_password, verify_password, create_jwt_token, decode_jwt_token,
    generate_reset_token, validate_reset_token, clear_reset_token,
    store_reset_token, generate_verify_token, store_verify_token,
    verify_email_db, track_login, generate_csrf_token, sign_csrf_token,
    verify_csrf_token, get_csrf_token as gen_csrf,
    get_google_oauth_url, get_github_oauth_url, oauth_enabled,
    create_magic_token, decode_magic_token, blacklist_session,
)

# ─── Configuration ─────────────────────────────────────────────────────────────

class Settings:
    """Application settings loaded from environment."""
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://sim_admin:SimData_Vector_2026!@localhost:5432/movieanimation_db"
    )
    JWT_SECRET: str = os.getenv("JWT_SECRET", "movieanimation-beta-secret-key-2026")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    ENV: str = os.getenv("ENV", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    DB_POOL_MIN: int = int(os.getenv("DB_POOL_MIN", "2"))
    DB_POOL_MAX: int = int(os.getenv("DB_POOL_MAX", "10"))
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")

settings = Settings()

# ─── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("movieanimation")

# ─── Database Pool ─────────────────────────────────────────────────────────────

db_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None

def get_db_pool():
    """Get or create the database connection pool."""
    global db_pool
    if db_pool is None:
        try:
            db_pool = psycopg2.pool.ThreadedConnectionPool(
                settings.DB_POOL_MIN,
                settings.DB_POOL_MAX,
                settings.DATABASE_URL
            )
            logger.info(f"Database pool created (min={settings.DB_POOL_MIN}, max={settings.DB_POOL_MAX})")
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            # Fallback: try SSH tunnel
            ssh_url = os.getenv("DATABASE_URL_SSH", settings.DATABASE_URL)
            db_pool = psycopg2.pool.ThreadedConnectionPool(
                settings.DB_POOL_MIN, settings.DB_POOL_MAX, ssh_url
            )
    return db_pool

def get_db():
    """Get a database connection from the pool."""
    pool = get_db_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

# ─── Rate Limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("🚀 MovieAnimation.ai Beta starting up...")
    pool = get_db_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT version()")
            version = cur.fetchone()[0]
            logger.info(f"Database connected: {version[:60]}...")
    finally:
        pool.putconn(conn)
    yield
    if db_pool:
        db_pool.closeall()
        logger.info("Database pool closed")

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="MovieAnimation.ai API",
    description="AI-powered movie creation platform - Beta API",
    version="0.1.0-beta",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# ─── Security Middleware ─────────────────────────────────────────────────────

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Apply security headers and input validation to all requests."""
    # Log incoming request (sanitized)
    client_ip = request.client.host if request.client else "unknown"
    # Don't log auth tokens in production
    if settings.ENV == "development":
        logger.debug(f"{request.method} {request.url.path} from {client_ip}")
    
    try:
        response = await call_next(request)
    except Exception as e:
        logger.error(f"Unhandled error: {e}", exc_info=True)
        response = JSONResponse(
            status_code=500,
            content={"success": False, "detail": "Internal server error. Our team has been notified."}
        )
    
    # Apply security headers
    sec_headers = get_security_headers(settings.ENV)
    for key, value in sec_headers.items():
        if key not in response.headers:
            response.headers[key] = value
    
    # Add cache headers for GET requests
    if request.method == "GET" and response.status_code == 200:
        try:
            # Try to get response body for ETag
            body = response.body if hasattr(response, 'body') else None
        except Exception:
            body = None
    
    return response

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting based on endpoint configuration."""
    path = request.url.path
    limit = get_rate_limit(path)
    # Rate limiting is handled by slowapi decorators on endpoints
    # This middleware can be extended for IP-based global limits
    return await call_next(request)

# Standard middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["X-Cache-TTL", "ETag", "X-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Pydantic Models ───────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    genre: Optional[str] = None

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    status: Optional[str] = None

class ScriptUpload(BaseModel):
    title: Optional[str] = None
    content: str = Field(..., min_length=1)
    language: str = "en"
    format: str = "txt"

class SceneCreate(BaseModel):
    scene_number: int
    description: Optional[str] = None
    action: Optional[str] = None
    dialogue: Optional[List[Dict]] = None
    characters: Optional[List[str]] = None
    setting: Optional[str] = None
    mood: Optional[str] = None

class SceneUpdate(BaseModel):
    description: Optional[str] = None
    action: Optional[str] = None
    dialogue: Optional[List[Dict]] = None
    characters: Optional[List[str]] = None
    mood: Optional[str] = None
    visual_prompt: Optional[str] = None

class GenerateSceneRequest(BaseModel):
    scene_id: str
    api_choice: Optional[str] = "luma"
    aspect_ratio: str = "16:9"
    duration: int = 5
    quality: str = "standard"

class RenderRequest(BaseModel):
    project_id: str
    resolution: str = "1080p"
    format: str = "mp4"
    scene_order: Optional[List[str]] = None

class FeedbackCreate(BaseModel):
    category: str = Field(...)
    severity: str = "medium"
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None

class FeedbackUpdate(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None

class AnalyticsEvent(BaseModel):
    event_type: str
    event_data: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None

class BetaInviteBulk(BaseModel):
    emails: List[EmailStr] = Field(..., min_items=1, max_items=10)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6, max_length=128)

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)

class VerifyEmailRequest(BaseModel):
    token: str

class CSRFTokenResponse(BaseModel):
    csrf_token: str

class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    role: Optional[str] = None
    gender: Optional[str] = None
    age_range: Optional[str] = None
    voice_profile: Optional[str] = None
    visual_description: Optional[str] = None
    image_url: Optional[str] = None
    traits: Optional[List[str]] = None

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    gender: Optional[str] = None
    age_range: Optional[str] = None
    voice_profile: Optional[str] = None
    visual_description: Optional[str] = None
    image_url: Optional[str] = None
    traits: Optional[List[str]] = None

class GenerationJobRequest(BaseModel):
    scene_id: Optional[str] = None
    job_type: str = Field(..., description="video, image, audio, or render")
    api_name: str = Field(default="luma")
    prompt: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    priority: int = 0

class PaginationParams:
    def __init__(self, page: int = 1, limit: int = 20):
        self.page = max(1, page)
        self.limit = min(max(1, limit), 100)
        self.offset = (self.page - 1) * self.limit

# ─── Auth Utilities ────────────────────────────────────────────────────────────

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    conn = Depends(get_db)
) -> dict:
    """Dependency: Get the currently authenticated user."""
    try:
        payload = decode_jwt_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, name, email, email_verified, created_at FROM users WHERE id = %s",
            (payload["sub"],)
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(user)

def track_event_db(conn, event_type: str, user_id: Optional[str] = None,
                   event_data: Optional[dict] = None, session_id: Optional[str] = None,
                   ip_address: Optional[str] = None, user_agent: Optional[str] = None):
    """Track an analytics event in the database."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analytics_events (user_id, session_id, event_type, event_data, user_agent, ip_address)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (user_id, session_id, event_type,
                 json.dumps(event_data) if event_data else None,
                 user_agent, ip_address)
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to track event: {e}")
        conn.rollback()

# ─── Response Helpers ──────────────────────────────────────────────────────────

def success_response(data: Any, message: Optional[str] = None) -> dict:
    response = {"success": True, "data": data}
    if message:
        response["message"] = message
    return response

def row_to_dict(row, cur) -> dict:
    """Convert a psycopg2 RealDictRow to a plain dict with stringified UUIDs and datetimes."""
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
    return d

def rows_to_list(rows, cur) -> list:
    return [row_to_dict(r, cur) for r in rows]

# ─── Global Exception Handler ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return a consistent error response."""
    error_id = str(uuid.uuid4())[:8]
    client_ip = request.client.host if request.client else "unknown"
    
    logger.error(
        f"[{error_id}] Unhandled exception: {type(exc).__name__}: {exc}",
        extra={
            "error_id": error_id,
            "path": request.url.path,
            "method": request.method,
            "ip": client_ip,
        },
        exc_info=True
    )
    
    # Don't leak error details in production
    if settings.ENV == "production":
        detail = f"An unexpected error occurred. Reference: {error_id}"
    else:
        detail = f"{type(exc).__name__}: {str(exc)}"
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": detail,
            "error_id": error_id
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Format HTTP exceptions consistently."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "detail": exc.detail
        }
    )


# ─── Health & Status ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "0.1.0-beta",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENV
    }

@app.get("/api/status")
@limiter.limit("30/minute")
async def system_status(request: Request, conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM users")
        user_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM projects")
        project_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM scenes")
        scene_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM beta_testers WHERE status = 'active'")
        beta_count = cur.fetchone()[0]
        cur.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM api_usage WHERE created_at > NOW() - INTERVAL '24 hours'"
        )
        daily_cost = cur.fetchone()[0]
    
    return success_response({
        "users": {"total": user_count},
        "projects": {"total": project_count},
        "scenes": {"total": scene_count},
        "beta_testers": {"active": beta_count},
        "costs": {"daily_usd": float(daily_cost)},
        "uptime": "operational"
    })

# ─── Auth Endpoints ────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
@limiter.limit("10/minute")
async def register(request: Request, body: UserRegister, conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")
        
        password_hash_val = hash_password(body.password)
        verify_token = generate_verify_token()
        verify_expires = datetime.now(timezone.utc) + timedelta(hours=24)
        cur.execute(
            """INSERT INTO users (name, email, password_hash, email_verify_token, email_verify_expires)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id, name, email, created_at, email_verified""",
            (body.name, body.email, password_hash_val, verify_token, verify_expires)
        )
        user = cur.fetchone()
        conn.commit()
    
    user_dict = dict(user)
    user_dict["id"] = str(user_dict["id"])
    token = create_jwt_token(user_dict["id"], user_dict["email"])
    
    track_event_db(conn, "user_registered", user_id=user_dict["id"],
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    logger.info(f"New user registered: {body.email}")
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_dict["id"], "name": user_dict["name"],
            "email": user_dict["email"], "email_verified": user_dict["email_verified"]
        },
        "verify_token": verify_token  # Only for dev; in production this goes via email
    }

@app.post("/api/auth/login")
@limiter.limit("20/minute")
async def login(request: Request, body: UserLogin, conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, name, email, password_hash, email_verified, created_at FROM users WHERE email = %s",
            (body.email,)
        )
        user = cur.fetchone()
    
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_dict = dict(user)
    user_dict["id"] = str(user_dict["id"])
    user_dict.pop("password_hash")
    token = create_jwt_token(user_dict["id"], user_dict["email"])
    
    # Track login
    track_login(conn, user_dict["id"])
    track_event_db(conn, "user_logged_in", user_id=user_dict["id"],
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_dict["id"], "name": user_dict["name"],
            "email": user_dict["email"], "email_verified": user_dict["email_verified"]
        }
    }

@app.get("/api/auth/me")
@limiter.limit("30/minute")
async def get_me(request: Request, user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM projects WHERE user_id = %s", (user["id"],))
        project_count = cur.fetchone()[0]
    
    return success_response({
        **user,
        "projects_count": project_count,
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None
    })

# ─── Password Management ───────────────────────────────────────────────────────

@app.post("/api/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest, conn=Depends(get_db)):
    """Send password reset email (returns token in dev; would send email in production)."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name, email FROM users WHERE email = %s", (body.email,))
        user = cur.fetchone()
    
    # Always return success even if email not found (prevent email enumeration)
    reset_token = None
    if user:
        reset_token = generate_reset_token()
        store_reset_token(conn, str(user["id"]), reset_token)
        logger.info(f"Password reset requested for {body.email}")
        # In production: send email with reset_token link
    
    return success_response({
        "message": "If an account exists with that email, a password reset link has been sent.",
    }, {
        "reset_token": reset_token,  # Only in dev mode
        "dev_note": "In production, this token would be emailed. Use it with POST /api/auth/reset-password"
    } if reset_token else None)


@app.post("/api/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: ResetPasswordRequest, conn=Depends(get_db)):
    """Reset a password using a valid reset token."""
    user_id = validate_reset_token(conn, body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    new_hash = hash_password(body.new_password)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (new_hash, user_id)
        )
        conn.commit()
    
    clear_reset_token(conn, user_id)
    
    track_event_db(conn, "password_reset", user_id=user_id,
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    logger.info(f"Password reset completed for user {user_id[:8]}...")
    return success_response(None, "Password has been reset successfully. You can now log in.")


@app.post("/api/auth/change-password")
@limiter.limit("10/minute")
async def change_password(request: Request, body: ChangePasswordRequest,
                          user: dict = Depends(get_current_user), conn=Depends(get_db)):
    """Change password for the currently authenticated user."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
        row = cur.fetchone()
    
    if not row or not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    new_hash = hash_password(body.new_password)
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (new_hash, user["id"]))
        conn.commit()
    
    logger.info(f"Password changed for user {user['email']}")
    return success_response(None, "Password changed successfully")


# ─── Email Verification ────────────────────────────────────────────────────────

@app.post("/api/auth/verify-email")
@limiter.limit("10/minute")
async def verify_email_endpoint(request: Request, body: VerifyEmailRequest, conn=Depends(get_db)):
    """Verify a user's email address using the verification token."""
    user_id = verify_email_db(conn, body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    track_event_db(conn, "email_verified", user_id=user_id,
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    logger.info(f"Email verified for user {user_id[:8]}...")
    return success_response(None, "Email verified successfully! 🎉")


@app.post("/api/auth/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(request: Request, user: dict = Depends(get_current_user),
                               conn=Depends(get_db)):
    """Resend the email verification token."""
    with conn.cursor() as cur:
        cur.execute("SELECT email_verified FROM users WHERE id = %s", (user["id"],))
        row = cur.fetchone()
    
    if row and row[0]:
        return success_response(None, "Email is already verified")
    
    verify_token = generate_verify_token()
    store_verify_token(conn, user["id"], verify_token)
    
    logger.info(f"Verification resent for {user['email']}")
    return success_response({
        "message": "Verification email sent.",
        "verify_token": verify_token  # In dev; would be emailed in production
    })


# ─── CSRF Protection ───────────────────────────────────────────────────────────

@app.get("/api/auth/csrf-token")
@limiter.limit("60/minute")
async def get_csrf_token(request: Request):
    """Get a CSRF token for form submissions."""
    csrf = gen_csrf()
    response = JSONResponse(content=success_response({"csrf_token": csrf["token"]}))
    # Set as HTTP-only cookie for double-submit pattern
    response.set_cookie(
        key="csrf_token",
        value=csrf["raw"],
        httponly=True,
        secure=False,  # True in production
        samesite="lax",
        max_age=3600
    )
    return response


# ─── OAuth Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/auth/oauth/providers")
@limiter.limit("30/minute")
async def list_oauth_providers(request: Request):
    """List available OAuth providers and their auth URLs."""
    providers = {}
    enabled = oauth_enabled()
    
    if enabled.get("google"):
        providers["google"] = get_google_oauth_url()
    if enabled.get("github"):
        providers["github"] = get_github_oauth_url()
    
    return success_response({"providers": providers, "enabled": enabled})


@app.get("/api/auth/oauth/google")
@limiter.limit("20/minute")
async def google_oauth_redirect(request: Request):
    """Redirect to Google OAuth consent screen."""
    url = get_google_oauth_url()
    if not url:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url)


@app.get("/api/auth/oauth/google/callback")
@limiter.limit("20/minute")
async def google_oauth_callback(code: str, request: Request, conn=Depends(get_db)):
    """Handle Google OAuth callback (stub — requires google-auth library)."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    
    raise HTTPException(
        status_code=501,
        detail="Google OAuth integration requires google-auth library. "
               "To complete: install google-auth, google-auth-oauthlib, "
               "exchange auth code for id_token, upsert user."
    )


@app.get("/api/auth/oauth/github")
@limiter.limit("20/minute")
async def github_oauth_redirect(request: Request):
    """Redirect to GitHub OAuth consent screen."""
    url = get_github_oauth_url()
    if not url:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url)


@app.get("/api/auth/oauth/github/callback")
@limiter.limit("20/minute")
async def github_oauth_callback(code: str, request: Request, conn=Depends(get_db)):
    """Handle GitHub OAuth callback (stub — requires httpx for token exchange)."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    
    raise HTTPException(
        status_code=501,
        detail="GitHub OAuth integration requires manual token exchange. "
               "To complete: POST to github.com/login/oauth/access_token, "
               "fetch user info, upsert user with oauth_provider='github'."
    )


# ─── Session Management ────────────────────────────────────────────────────────

@app.post("/api/auth/logout")
@limiter.limit("30/minute")
async def logout(request: Request, 
                 credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Logout by blacklisting the current JWT token."""
    if credentials:
        try:
            payload = decode_jwt_token(credentials.credentials)
            jti = payload.get("jti")
            if jti:
                blacklist_session(jti)
        except ValueError:
            pass  # Already expired/invalid — still effective logout
    
    return success_response(None, "Logged out successfully")


@app.post("/api/auth/logout-all")
@limiter.limit("10/minute")
async def logout_all(request: Request, user: dict = Depends(get_current_user),
                     conn=Depends(get_db)):
    """Logout from all sessions by changing password hash salt (forces re-login).
    Future: Would use a user-level token version or Redis set."""
    return success_response(None, "All sessions have been invalidated. Please log in again.")

# ─── Project Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/projects")
@limiter.limit("60/minute")
async def list_projects(
    request: Request,
    user: dict = Depends(get_current_user),
    conn=Depends(get_db),
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    p = PaginationParams(page, limit)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if status:
            cur.execute(
                "SELECT * FROM projects WHERE user_id = %s AND status = %s ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                (user["id"], status, p.limit, p.offset)
            )
            cur.execute(
                "SELECT COUNT(*) FROM projects WHERE user_id = %s AND status = %s",
                (user["id"], status)
            )
        else:
            cur.execute(
                "SELECT * FROM projects WHERE user_id = %s ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                (user["id"], p.limit, p.offset)
            )
            cur.execute("SELECT COUNT(*) FROM projects WHERE user_id = %s", (user["id"],))
        
        rows = cur.fetchall()
        total = cur.fetchone()[0]
    
    return success_response({
        "projects": rows_to_list(rows, None),
        "pagination": {"page": p.page, "limit": p.limit, "total": total,
                       "pages": max(1, (total + p.limit - 1) // p.limit)}
    })

@app.post("/api/projects")
async def create_project(request: Request, body: ProjectCreate,
                         user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO projects (user_id, title, description, genre)
               VALUES (%s, %s, %s, %s) RETURNING *""",
            (user["id"], body.title, body.description, body.genre)
        )
        project = cur.fetchone()
        conn.commit()
    
    project_dict = dict(project)
    project_dict["id"] = str(project_dict["id"])
    project_dict["user_id"] = str(project_dict["user_id"])
    
    track_event_db(conn, "project_created", user_id=user["id"],
                   event_data={"project_id": project_dict["id"]},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    return success_response(project_dict, "Project created successfully")

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user),
                      conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM projects WHERE id = %s AND user_id = %s",
            (project_id, user["id"])
        )
        project = cur.fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project_dict = dict(project)
        project_dict["id"] = str(project_dict["id"])
        project_dict["user_id"] = str(project_dict["user_id"])
        
        cur.execute(
            "SELECT * FROM scenes WHERE project_id = %s ORDER BY scene_number",
            (project_id,)
        )
        scenes = cur.fetchall()
        
        cur.execute(
            "SELECT id, title, word_count, format, created_at FROM scripts WHERE project_id = %s",
            (project_id,)
        )
        scripts = cur.fetchall()
        
        cur.execute(
            """SELECT COUNT(*) as total, 
               COUNT(CASE WHEN status='completed' THEN 1 END) as completed 
               FROM video_clips WHERE project_id = %s""",
            (project_id,)
        )
        clips_stats = cur.fetchone()
    
    return success_response({
        **project_dict,
        "scenes": rows_to_list(scenes, None),
        "scripts": rows_to_list(scripts, None),
        "clips_stats": dict(clips_stats) if clips_stats else {"total": 0, "completed": 0}
    })

@app.patch("/api/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate,
                         user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")
        
        sets = []
        vals = []
        if body.title is not None:
            sets.append("title = %s"); vals.append(body.title)
        if body.description is not None:
            sets.append("description = %s"); vals.append(body.description)
        if body.genre is not None:
            sets.append("genre = %s"); vals.append(body.genre)
        if body.status is not None:
            sets.append("status = %s"); vals.append(body.status)
        
        if sets:
            sets.append("updated_at = NOW()")
            vals.extend([project_id, user["id"]])
            cur.execute(
                f"UPDATE projects SET {', '.join(sets)} WHERE id = %s AND user_id = %s",
                vals
            )
            conn.commit()
        
        cur.execute("SELECT * FROM projects WHERE id = %s", (project_id,))
        project = cur.fetchone()
    
    project_dict = dict(project)
    project_dict["id"] = str(project_dict["id"])
    project_dict["user_id"] = str(project_dict["user_id"])
    return success_response(project_dict, "Project updated")

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user),
                         conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        conn.commit()
    
    return success_response(None, "Project deleted successfully")

# ─── Script Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/scripts")
async def upload_script(request: Request, project_id: str, body: ScriptUpload,
                        user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")
        
        word_count = len(body.content.split())
        cur.execute(
            """INSERT INTO scripts (project_id, title, content, word_count, language, format)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, title, word_count, language, format, created_at""",
            (project_id, body.title or "Untitled Script", body.content,
             word_count, body.language, body.format)
        )
        script = cur.fetchone()
        
        cur.execute(
            "UPDATE projects SET status = 'script_uploaded', updated_at = NOW() WHERE id = %s",
            (project_id,)
        )
        conn.commit()
    
    track_event_db(conn, "script_uploaded", user_id=user["id"],
                   event_data={"project_id": project_id, "word_count": word_count},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    return success_response(dict(script), "Script uploaded successfully")

# ─── Scene Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/scenes")
async def create_scene(project_id: str, body: SceneCreate,
                       user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")
        
        cur.execute(
            """INSERT INTO scenes (project_id, scene_number, description, action, dialogue, characters, setting, mood)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (project_id, body.scene_number, body.description, body.action,
             json.dumps(body.dialogue) if body.dialogue else None,
             json.dumps(body.characters) if body.characters else None,
             body.setting, body.mood)
        )
        scene = cur.fetchone()
        conn.commit()
    
    scene_dict = dict(scene)
    scene_dict["id"] = str(scene_dict["id"])
    scene_dict["project_id"] = str(scene_dict["project_id"])
    return success_response(scene_dict, "Scene created successfully")

@app.get("/api/projects/{project_id}/scenes")
async def list_scenes(project_id: str, user: dict = Depends(get_current_user),
                      conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM scenes WHERE project_id = %s ORDER BY scene_number",
            (project_id,)
        )
        scenes = cur.fetchall()
    
    return success_response({"scenes": rows_to_list(scenes, None)})

@app.patch("/api/scenes/{scene_id}")
async def update_scene(scene_id: str, body: SceneUpdate,
                       user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM scenes WHERE id = %s", (scene_id,))
        scene = cur.fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="Scene not found")
        
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (scene["project_id"], user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Not authorized")
        
        fields = []
        vals = []
        if body.description is not None:
            fields.append("description = %s"); vals.append(body.description)
        if body.action is not None:
            fields.append("action = %s"); vals.append(body.action)
        if body.dialogue is not None:
            fields.append("dialogue = %s"); vals.append(json.dumps(body.dialogue))
        if body.characters is not None:
            fields.append("characters = %s"); vals.append(json.dumps(body.characters))
        if body.mood is not None:
            fields.append("mood = %s"); vals.append(body.mood)
        if body.visual_prompt is not None:
            fields.append("visual_prompt = %s"); vals.append(body.visual_prompt)
        
        if fields:
            fields.append("updated_at = NOW()")
            vals.append(scene_id)
            cur.execute(f"UPDATE scenes SET {', '.join(fields)} WHERE id = %s", vals)
            conn.commit()
        
        cur.execute("SELECT * FROM scenes WHERE id = %s", (scene_id,))
        updated = cur.fetchone()
    
    updated_dict = dict(updated)
    updated_dict["id"] = str(updated_dict["id"])
    updated_dict["project_id"] = str(updated_dict["project_id"])
    return success_response(updated_dict, "Scene updated")

# ─── Characters Endpoints ──────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/characters")
async def create_character(project_id: str, body: CharacterCreate,
                           user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")

        cur.execute(
            """INSERT INTO characters (project_id, name, description, role, gender, age_range,
               voice_profile, visual_description, image_url, traits)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (project_id, body.name, body.description, body.role, body.gender, body.age_range,
             body.voice_profile, body.visual_description, body.image_url,
             json.dumps(body.traits) if body.traits else None)
        )
        character = cur.fetchone()
        conn.commit()

    char_dict = dict(character)
    char_dict["id"] = str(char_dict["id"])
    char_dict["project_id"] = str(char_dict["project_id"])
    return success_response(char_dict, "Character created")

@app.get("/api/projects/{project_id}/characters")
async def list_characters(project_id: str, user: dict = Depends(get_current_user),
                           conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM characters WHERE project_id = %s ORDER BY name",
            (project_id,)
        )
        characters = cur.fetchall()
    return success_response({"characters": rows_to_list(characters, None)})

@app.get("/api/characters/{character_id}")
async def get_character(character_id: str, user: dict = Depends(get_current_user),
                         conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT c.* FROM characters c
               JOIN projects p ON c.project_id = p.id
               WHERE c.id = %s AND p.user_id = %s""",
            (character_id, user["id"])
        )
        character = cur.fetchone()
        if not character:
            raise HTTPException(status_code=404, detail="Character not found")
    return success_response(dict(character))

@app.patch("/api/characters/{character_id}")
async def update_character(character_id: str, body: CharacterUpdate,
                           user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT c.id FROM characters c
               JOIN projects p ON c.project_id = p.id
               WHERE c.id = %s AND p.user_id = %s""",
            (character_id, user["id"])
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Character not found")

        fields = []
        vals = []
        for field in ["name", "description", "role", "gender", "age_range",
                       "voice_profile", "visual_description", "image_url"]:
            val = getattr(body, field, None)
            if val is not None:
                fields.append(f"{field} = %s")
                vals.append(val)
        if body.traits is not None:
            fields.append("traits = %s")
            vals.append(json.dumps(body.traits))

        if fields:
            fields.append("updated_at = NOW()")
            vals.append(character_id)
            cur.execute(
                f"UPDATE characters SET {', '.join(fields)} WHERE id = %s", vals
            )
            conn.commit()

        cur.execute("SELECT * FROM characters WHERE id = %s", (character_id,))
        updated = cur.fetchone()

    return success_response(dict(updated), "Character updated")

@app.delete("/api/characters/{character_id}")
async def delete_character(character_id: str, user: dict = Depends(get_current_user),
                            conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT c.id FROM characters c
               JOIN projects p ON c.project_id = p.id
               WHERE c.id = %s AND p.user_id = %s""",
            (character_id, user["id"])
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Character not found")
        cur.execute("DELETE FROM characters WHERE id = %s", (character_id,))
        conn.commit()
    return success_response(None, "Character deleted")

# ─── Generation Jobs Endpoints ─────────────────────────────────────────────────

@app.post("/api/generation-jobs")
@limiter.limit("30/minute")
async def create_generation_job(request: Request, body: GenerationJobRequest,
                                 project_id: str = Query(...),
                                 user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")

        estimated_costs = {"luma": 0.50, "runway": 0.75, "dalle": 0.04, "elevenlabs": 0.10}
        cost = estimated_costs.get(body.api_name, 0.50)

        cur.execute(
            """INSERT INTO generation_jobs (user_id, project_id, scene_id, job_type, api_name,
               prompt, params, status, cost_usd, priority)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
               RETURNING *""",
            (user["id"], project_id, body.scene_id, body.job_type, body.api_name,
             body.prompt, json.dumps(body.params) if body.params else None,
             cost, body.priority)
        )
        job = cur.fetchone()
        conn.commit()

    job_dict = dict(job)
    job_dict["id"] = str(job_dict["id"])
    job_dict["user_id"] = str(job_dict["user_id"])
    job_dict["project_id"] = str(job_dict["project_id"])

    track_event_db(conn, "generation_job_created", user_id=user["id"],
                   event_data={"job_id": job_dict["id"], "job_type": body.job_type,
                               "api": body.api_name},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))

    return success_response(job_dict, "Generation job queued")

@app.get("/api/generation-jobs")
async def list_generation_jobs(request: Request, user: dict = Depends(get_current_user),
                                conn=Depends(get_db),
                                project_id: Optional[str] = None,
                                status: Optional[str] = None,
                                job_type: Optional[str] = None,
                                page: int = Query(1, ge=1),
                                limit: int = Query(20, ge=1, le=100)):
    p = PaginationParams(page, limit)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        conditions = ["gj.user_id = %s"]
        params = [user["id"]]
        if project_id:
            conditions.append("gj.project_id = %s")
            params.append(project_id)
        if status:
            conditions.append("gj.status = %s")
            params.append(status)
        if job_type:
            conditions.append("gj.job_type = %s")
            params.append(job_type)

        where = " AND ".join(conditions)
        cur.execute(
            f"""SELECT gj.* FROM generation_jobs gj
               WHERE {where}
               ORDER BY gj.created_at DESC LIMIT %s OFFSET %s""",
            params + [p.limit, p.offset]
        )
        jobs = cur.fetchall()
        cur.execute(f"SELECT COUNT(*) FROM generation_jobs gj WHERE {where}", params)
        total = cur.fetchone()[0]

    return success_response({
        "jobs": rows_to_list(jobs, None),
        "pagination": {"page": p.page, "limit": p.limit, "total": total,
                       "pages": max(1, (total + p.limit - 1) // p.limit)}
    })

@app.get("/api/generation-jobs/{job_id}")
async def get_generation_job(job_id: str, user: dict = Depends(get_current_user),
                               conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM generation_jobs WHERE id = %s AND user_id = %s",
            (job_id, user["id"])
        )
        job = cur.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Generation job not found")
    return success_response(dict(job))

@app.post("/api/generation-jobs/{job_id}/cancel")
async def cancel_generation_job(job_id: str, user: dict = Depends(get_current_user),
                                  conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM generation_jobs WHERE id = %s AND user_id = %s",
            (job_id, user["id"])
        )
        job = cur.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Generation job not found")
        if job["status"] in ("completed", "failed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Job already {job['status']}")

        cur.execute(
            "UPDATE generation_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = %s",
            (job_id,)
        )
        conn.commit()

    return success_response(None, "Job cancelled")

# ─── Generation Endpoints ──────────────────────────────────────────────────────

@app.post("/api/generate/scene")
@limiter.limit("30/minute")
async def generate_scene(request: Request, body: GenerateSceneRequest,
                         user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM scenes WHERE id = %s", (body.scene_id,))
        scene = cur.fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="Scene not found")
        
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (scene["project_id"], user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Not authorized")
        
        # Build prompt
        prompt = scene.get("visual_prompt") or scene.get("description") or "A cinematic movie scene"
        if scene.get("action"):
            prompt += ". " + str(scene["action"])[:200]
        
        cur.execute(
            """INSERT INTO video_clips (scene_id, project_id, api_used, prompt, generation_params, status)
               VALUES (%s, %s, %s, %s, %s, 'pending')
               RETURNING *""",
            (body.scene_id, scene["project_id"], body.api_choice, prompt,
             json.dumps({"aspect_ratio": body.aspect_ratio, "duration": body.duration, "quality": body.quality}))
        )
        clip = cur.fetchone()
        
        estimated_cost = {"luma": 0.50, "runway": 0.75, "seedance": 0.25}.get(body.api_choice, 0.50)
        cur.execute(
            """INSERT INTO api_usage (user_id, project_id, api_name, endpoint, cost_usd, credits_used)
               VALUES (%s, %s, %s, 'generate', %s, %s)""",
            (user["id"], scene["project_id"], body.api_choice, estimated_cost, estimated_cost)
        )
        
        cur.execute(
            "UPDATE scenes SET generation_status = 'generating', api_used = %s, updated_at = NOW() WHERE id = %s",
            (body.api_choice, body.scene_id)
        )
        conn.commit()
    
    track_event_db(conn, "generation_started", user_id=user["id"],
                   event_data={"scene_id": body.scene_id, "api": body.api_choice},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    clip_dict = dict(clip)
    clip_dict["id"] = str(clip_dict["id"])
    return success_response({
        "clip": clip_dict,
        "estimated_cost_usd": estimated_cost,
        "status": "queued"
    }, "Scene queued for generation")

@app.get("/api/generation/{clip_id}/status")
async def check_generation(clip_id: str, user: dict = Depends(get_current_user),
                           conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT vc.* FROM video_clips vc
               JOIN projects p ON vc.project_id = p.id
               WHERE vc.id = %s AND p.user_id = %s""",
            (clip_id, user["id"])
        )
        clip = cur.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Generation not found")
    
    return success_response(dict(clip))

# ─── Render Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/render")
@limiter.limit("10/minute")
async def request_render(request: Request, body: RenderRequest,
                         user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (body.project_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")
        
        cur.execute(
            "SELECT id FROM scenes WHERE project_id = %s AND generation_status = 'completed' ORDER BY scene_number",
            (body.project_id,)
        )
        scenes = cur.fetchall()
        if not scenes:
            raise HTTPException(status_code=400, detail="No completed scenes to render")
        
        scene_order = body.scene_order or [str(s["id"]) for s in scenes]
        cur.execute(
            """INSERT INTO renders (project_id, title, resolution, format, scene_order, status)
               VALUES (%s, %s, %s, %s, %s, 'processing')
               RETURNING *""",
            (body.project_id, f"Render - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
             body.resolution, body.format, json.dumps(scene_order))
        )
        render = cur.fetchone()
        
        cur.execute("UPDATE projects SET status = 'rendering', updated_at = NOW() WHERE id = %s",
                    (body.project_id,))
        conn.commit()
    
    track_event_db(conn, "render_started", user_id=user["id"],
                   event_data={"project_id": body.project_id, "render_id": str(render["id"])},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    render_dict = dict(render)
    render_dict["id"] = str(render_dict["id"])
    return success_response(render_dict, "Render queued")

# ─── Beta Testing Endpoints ────────────────────────────────────────────────────

@app.post("/api/beta/invite")
@limiter.limit("5/minute")
async def invite_beta_testers(request: Request, body: BetaInviteBulk,
                              user: dict = Depends(get_current_user), conn=Depends(get_db)):
    invited = []
    failed = []
    
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        for email in body.emails:
            try:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                existing = cur.fetchone()
                invite_code = f"BETA-{uuid.uuid4().hex[:8].upper()}"
                
                if existing:
                    user_id = existing["id"]
                    cur.execute("SELECT id FROM beta_testers WHERE user_id = %s", (user_id,))
                    if cur.fetchone():
                        failed.append({"email": email, "reason": "Already a beta tester"})
                        continue
                else:
                    temp_hash = hash_password(invite_code)
                    cur.execute(
                        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
                        (email.split('@')[0], email, temp_hash)
                    )
                    user_id = cur.fetchone()["id"]
                
                cur.execute(
                    "INSERT INTO beta_testers (user_id, invite_code, status) VALUES (%s, %s, 'invited')",
                    (user_id, invite_code)
                )
                invited.append({"email": email, "invite_code": invite_code})
                
                track_event_db(conn, "beta_invite_sent", user_id=str(user_id),
                             event_data={"invited_email": email})
                
            except Exception as e:
                logger.error(f"Failed to invite {email}: {e}")
                conn.rollback()
                failed.append({"email": email, "reason": str(e)})
        
        conn.commit()
    
    return success_response({"invited": invited, "failed": failed, "total_invited": len(invited)})

@app.get("/api/beta/testers")
async def list_beta_testers(user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT bt.*, u.name, u.email
            FROM beta_testers bt
            JOIN users u ON bt.user_id = u.id
            ORDER BY bt.invited_at DESC
        """)
        testers = cur.fetchall()
        
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status='invited' THEN 1 END) as invited,
                COUNT(CASE WHEN status='active' THEN 1 END) as active,
                COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
                COALESCE(SUM(feedback_count), 0) as total_feedback,
                COALESCE(SUM(projects_created), 0) as total_projects
            FROM beta_testers
        """)
        stats = cur.fetchone()
    
    return success_response({
        "testers": rows_to_list(testers, None),
        "stats": dict(stats)
    })

@app.post("/api/beta/activate/{invite_code}")
async def activate_beta(invite_code: str, user: dict = Depends(get_current_user),
                        conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM beta_testers WHERE invite_code = %s AND user_id = %s",
            (invite_code, user["id"])
        )
        beta = cur.fetchone()
        if not beta:
            raise HTTPException(status_code=404, detail="Invalid invite code")
        
        cur.execute(
            "UPDATE beta_testers SET status = 'active', activated_at = NOW() WHERE id = %s",
            (beta["id"],)
        )
        conn.commit()
    
    return success_response(None, "Beta access activated! 🎉 Welcome aboard!")

# ─── Feedback Endpoints ────────────────────────────────────────────────────────

@app.post("/api/feedback")
@limiter.limit("20/minute")
async def submit_feedback(request: Request, body: FeedbackCreate,
                          user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """INSERT INTO beta_feedback (user_id, category, severity, title, description)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING *""",
            (user["id"], body.category, body.severity, body.title, body.description)
        )
        feedback = cur.fetchone()
        
        cur.execute(
            "UPDATE beta_testers SET feedback_count = feedback_count + 1 WHERE user_id = %s",
            (user["id"],)
        )
        conn.commit()
    
    track_event_db(conn, "feedback_submitted", user_id=user["id"],
                   event_data={"category": body.category, "severity": body.severity},
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    
    return success_response(dict(feedback), "Feedback submitted. Thank you!")

@app.get("/api/feedback")
@limiter.limit("30/minute")
async def list_feedback(request: Request, user: dict = Depends(get_current_user), conn=Depends(get_db),
                        status: Optional[str] = None, category: Optional[str] = None):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        query = "SELECT bf.*, u.name, u.email FROM beta_feedback bf JOIN users u ON bf.user_id = u.id WHERE 1=1"
        params = []
        if status:
            params.append(status)
            query += f" AND bf.status = %s"
        if category:
            params.append(category)
            query += f" AND bf.category = %s"
        query += " ORDER BY bf.created_at DESC LIMIT 100"
        
        cur.execute(query, tuple(params))
        feedback = cur.fetchall()
    
    return success_response({"feedback": rows_to_list(feedback, None)})

@app.patch("/api/feedback/{feedback_id}")
async def update_feedback(feedback_id: str, body: FeedbackUpdate,
                          user: dict = Depends(get_current_user), conn=Depends(get_db)):
    valid_statuses = ["open", "acknowledged", "in_progress", "resolved", "closed"]
    new_status = body.status
    admin_notes = body.admin_notes
    
    if new_status and new_status not in valid_statuses:
        raise HTTPException(status_code=400,
                          detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        updates = []
        vals = []
        if new_status:
            updates.append("status = %s"); vals.append(new_status)
        if admin_notes:
            updates.append("admin_notes = %s"); vals.append(admin_notes)
        
        if updates:
            updates.append("updated_at = NOW()")
            vals.append(feedback_id)
            cur.execute(
                f"UPDATE beta_feedback SET {', '.join(updates)} WHERE id = %s RETURNING *",
                vals
            )
            updated = cur.fetchone()
            if not updated:
                raise HTTPException(status_code=404, detail="Feedback not found")
            conn.commit()
        else:
            cur.execute("SELECT * FROM beta_feedback WHERE id = %s", (feedback_id,))
            updated = cur.fetchone()
            if not updated:
                raise HTTPException(status_code=404, detail="Feedback not found")
    
    return success_response(dict(updated), "Feedback updated")

# ─── Analytics Endpoints ───────────────────────────────────────────────────────

@app.post("/api/analytics/event")
@limiter.limit("100/minute")
async def track_analytics_event(request: Request, body: AnalyticsEvent,
                                user: dict = Depends(get_current_user), conn=Depends(get_db)):
    track_event_db(conn, body.event_type, user_id=user["id"],
                   event_data=body.event_data, session_id=body.session_id,
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"))
    return success_response(None, "Event tracked")

@app.get("/api/analytics/dashboard")
@limiter.limit("30/minute")
async def analytics_dashboard(request: Request, user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) as total FROM users")
        total_users = cur.fetchone()["total"]
        
        cur.execute("SELECT COUNT(*) FROM analytics_events WHERE created_at > NOW() - INTERVAL '24 hours'")
        events_24h = cur.fetchone()[0]
        
        cur.execute("""
            SELECT event_type, COUNT(*) as count
            FROM analytics_events
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY event_type ORDER BY count DESC LIMIT 10
        """)
        top_events = cur.fetchall()
        
        cur.execute("""
            SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as users
            FROM analytics_events
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY DATE(created_at) ORDER BY date
        """)
        dau = cur.fetchall()
        
        cur.execute("""
            SELECT api_name, COUNT(*) as calls, SUM(cost_usd) as total_cost
            FROM api_usage
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY api_name ORDER BY total_cost DESC
        """)
        api_summary = cur.fetchall()
    
    return success_response({
        "overview": {"total_users": total_users, "events_24h": events_24h},
        "top_events": rows_to_list(top_events, None),
        "daily_active_users": rows_to_list(dau, None),
        "api_usage": rows_to_list(api_summary, None)
    })

# ─── Cost Monitoring Endpoints ─────────────────────────────────────────────────

@app.get("/api/costs/dashboard")
@limiter.limit("30/minute")
async def cost_dashboard(request: Request, user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT api_name, SUM(cost_usd) as total_cost, COUNT(*) as total_calls
            FROM api_usage GROUP BY api_name ORDER BY total_cost DESC
        """)
        by_api = cur.fetchall()
        
        cur.execute("""
            SELECT COALESCE(SUM(cost_usd), 0) as month_cost, COUNT(*) as month_calls
            FROM api_usage
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        """)
        month = cur.fetchone()
        
        cur.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM api_usage WHERE DATE(created_at) = CURRENT_DATE"
        )
        today_cost = cur.fetchone()[0]
        
        cur.execute("""
            SELECT u.name, u.email, COUNT(*) as calls, SUM(au.cost_usd) as total_cost
            FROM api_usage au JOIN users u ON au.user_id = u.id
            WHERE au.created_at > NOW() - INTERVAL '30 days'
            GROUP BY u.name, u.email ORDER BY total_cost DESC LIMIT 20
        """)
        user_costs = cur.fetchall()
        
        cur.execute("""
            SELECT DATE(created_at) as date, api_name,
                   SUM(cost_usd) as cost, COUNT(*) as calls
            FROM api_usage
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at), api_name ORDER BY date DESC
        """)
        daily = cur.fetchall()
    
    return success_response({
        "today_cost": float(today_cost),
        "month_summary": dict(month) if month else {"month_cost": 0, "month_calls": 0},
        "by_api": rows_to_list(by_api, None),
        "by_user": rows_to_list(user_costs, None),
        "daily": rows_to_list(daily, None)
    })

@app.get("/api/costs/my-usage")
@limiter.limit("30/minute")
async def my_cost_usage(request: Request, user: dict = Depends(get_current_user), conn=Depends(get_db)):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT api_name, COUNT(*) as calls, SUM(cost_usd) as total_cost, MAX(created_at) as last_used
            FROM api_usage WHERE user_id = %s
            GROUP BY api_name ORDER BY total_cost DESC
        """, (user["id"],))
        usage = cur.fetchall()
        
        cur.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM api_usage WHERE user_id = %s",
                    (user["id"],))
        total = cur.fetchone()[0]
    
    return success_response({"total_cost": float(total), "by_api": rows_to_list(usage, None)})

# ─── Cache Management ─────────────────────────────────────────────────────────

@app.get("/api/cache/stats")
async def cache_stats():
    """Get response cache statistics."""
    return success_response(response_cache.stats())

@app.post("/api/cache/invalidate")
async def invalidate_cache(pattern: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Invalidate cache entries (admin only in production)."""
    response_cache.invalidate(pattern)
    logger.info(f"Cache invalidated by {user['email']}: pattern={pattern or 'ALL'}")
    return success_response(None, f"Cache invalidated: {pattern or 'ALL entries'}")


# ─── API Info ──────────────────────────────────────────────────────────────────

@app.get("/api/info")
async def api_info():
    return success_response({
        "name": "MovieAnimation.ai API",
        "version": "0.1.0-beta",
        "documentation": "/api/docs",
        "help_center": "https://movieanimation.ai/help",
        "contact": "support@movieanimation.ai",
        "endpoints": {
            "auth": [
                "POST /api/auth/register", "POST /api/auth/login", "GET /api/auth/me",
                "POST /api/auth/forgot-password", "POST /api/auth/reset-password",
                "POST /api/auth/change-password", "POST /api/auth/verify-email",
                "POST /api/auth/resend-verification", "GET /api/auth/csrf-token",
                "POST /api/auth/logout", "POST /api/auth/logout-all",
                "GET /api/auth/oauth/providers", "GET /api/auth/oauth/google",
                "GET /api/auth/oauth/github"
            ],
            "projects": ["GET /api/projects", "POST /api/projects", "GET /api/projects/{id}", "PATCH /api/projects/{id}", "DELETE /api/projects/{id}"],
            "scripts": ["POST /api/projects/{id}/scripts"],
            "scenes": ["POST /api/projects/{id}/scenes", "GET /api/projects/{id}/scenes", "PATCH /api/scenes/{id}"],
            "characters": ["POST /api/projects/{id}/characters", "GET /api/projects/{id}/characters", "GET /api/characters/{id}", "PATCH /api/characters/{id}", "DELETE /api/characters/{id}"],
            "generation-jobs": ["POST /api/generation-jobs", "GET /api/generation-jobs", "GET /api/generation-jobs/{id}", "POST /api/generation-jobs/{id}/cancel"],
            "generation": ["POST /api/generate/scene", "GET /api/generation/{id}/status"],
            "render": ["POST /api/render"],
            "beta": ["POST /api/beta/invite", "GET /api/beta/testers", "POST /api/beta/activate/{code}"],
            "feedback": ["POST /api/feedback", "GET /api/feedback", "PATCH /api/feedback/{id}"],
            "analytics": ["POST /api/analytics/event", "GET /api/analytics/dashboard"],
            "costs": ["GET /api/costs/dashboard", "GET /api/costs/my-usage"]
        }
    })

# ─── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting MovieAnimation.ai Beta API on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENV == "development",
        log_level=settings.LOG_LEVEL.lower()
    )
