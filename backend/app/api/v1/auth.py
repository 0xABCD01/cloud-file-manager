import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.user import User
from app.models.folder import Folder
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_token_jti,
    TokenExpiredError,
    TokenInvalidError,
    TokenTypeMismatchError,
)
from app.core.config import get_settings
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    ChangePasswordRequest,
    TokenResponse,
    UserResponse,
    MessageResponse,
)
from app.services.audit_service import audit_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

settings = get_settings()

# dummy hash so we can always run verify_password even when user doesn't exist
_DUMMY_HASH = hash_password("__dummy_password_for_timing__")


def _validate_password_strength(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if len(password) > 128:
        return "Password must be at most 128 characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one digit"
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;':\",./<>?`~]", password):
        return "Password must contain at least one special character"
    return None


@router.post("/register", response_model=MessageResponse, status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    strength_error = _validate_password_strength(body.password)
    if strength_error:
        raise HTTPException(status_code=422, detail=strength_error)

    email = body.email.lower().strip()

    # don't reveal which field conflicted
    result = await db.execute(select(User.id).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Registration failed")

    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name.strip(),
    )
    db.add(user)
    await db.flush()

    root_folder = Folder(name="My Files", owner_id=user.id, parent_id=None)
    db.add(root_folder)
    await db.flush()

    await audit_service.log(
        db,
        action="auth.register",
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return MessageResponse(detail="Registration successful. Please log in.")


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # always run verify_password to keep timing consistent
    if not user:
        verify_password(body.password, _DUMMY_HASH)
        await audit_service.log(
            db, action="auth.login_fail", metadata={"email": email, "reason": "user_not_found"},
            ip_address=ip, user_agent=ua,
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, user.hashed_password):
        await audit_service.log(
            db, action="auth.login_fail", user_id=user.id,
            metadata={"reason": "wrong_password"}, ip_address=ip, user_agent=ua,
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email")

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    await audit_service.log(
        db, action="auth.login_success", user_id=user.id,
        ip_address=ip, user_agent=ua,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except TokenExpiredError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except (TokenInvalidError, TokenTypeMismatchError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload["sub"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    new_access = create_access_token(subject=user_id)
    new_refresh = create_refresh_token(subject=user_id)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # full impl would blacklist the JTI in redis; for now client discards tokens
    return None


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]
    try:
        payload = decode_token(token, expected_type="access")
    except (TokenExpiredError, TokenInvalidError, TokenTypeMismatchError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=403, detail="Current password is incorrect")

    strength_error = _validate_password_strength(body.new_password)
    if strength_error:
        raise HTTPException(status_code=422, detail=strength_error)

    user.hashed_password = hash_password(body.new_password)
    await db.flush()

    await audit_service.log(
        db, action="auth.password_change", user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )

    return MessageResponse(detail="Password changed successfully")
