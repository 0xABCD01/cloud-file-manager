from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.user import User
from app.core.security import decode_token, TokenExpiredError, TokenInvalidError, TokenTypeMismatchError
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/api/v1/users", tags=["users"])


async def _get_current_user(request: Request, db: AsyncSession) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth[7:], expected_type="access")
    except TokenExpiredError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (TokenInvalidError, TokenTypeMismatchError):
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/me", response_model=UserResponse)
async def get_profile(request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_current_user(request, db)
    return user
