import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=get_settings().bcrypt_rounds,
)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


_PRIVATE_KEY: rsa.RSAPrivateKey | None = None
_PUBLIC_KEY = None


def generate_rsa_keypair() -> tuple[rsa.RSAPrivateKey, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    public_key = private_key.public_key()
    return private_key, public_key


def _save_key(key, path: Path, is_private: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if is_private:
        data = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    else:
        data = key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    path.write_bytes(data)


def _load_private_key(path: Path):
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def _load_public_key(path: Path):
    return serialization.load_pem_public_key(path.read_bytes())


def load_or_generate_keys() -> tuple:
    global _PRIVATE_KEY, _PUBLIC_KEY

    settings = get_settings()
    private_path = Path(settings.jwt_private_key_path)
    public_path = Path(settings.jwt_public_key_path)

    if private_path.exists() and public_path.exists():
        _PRIVATE_KEY = _load_private_key(private_path)
        _PUBLIC_KEY = _load_public_key(public_path)
    else:
        _PRIVATE_KEY, _PUBLIC_KEY = generate_rsa_keypair()
        _save_key(_PRIVATE_KEY, private_path, is_private=True)
        _save_key(_PUBLIC_KEY, public_path, is_private=False)

    return _PRIVATE_KEY, _PUBLIC_KEY


def get_private_key():
    if _PRIVATE_KEY is None:
        load_or_generate_keys()
    return _PRIVATE_KEY


def get_public_key():
    if _PUBLIC_KEY is None:
        load_or_generate_keys()
    return _PUBLIC_KEY


class TokenExpiredError(Exception):
    pass


class TokenInvalidError(Exception):
    pass


class TokenTypeMismatchError(Exception):
    pass


class AuthenticationError(Exception):
    pass


class AuthorizationError(Exception):
    pass


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
    additional_claims: dict | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes))

    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    if additional_claims:
        payload.update(additional_claims)

    return jwt.encode(payload, get_private_key(), algorithm="RS256")


def create_refresh_token(subject: str, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=settings.jwt_refresh_token_expire_days))

    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    }

    return jwt.encode(payload, get_private_key(), algorithm="RS256")


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, get_public_key(), algorithms=["RS256"])
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError("Token has expired")
    except JWTError as e:
        raise TokenInvalidError(f"Invalid token: {e}")

    token_type = payload.get("type")
    if token_type != expected_type:
        raise TokenTypeMismatchError(
            f"Expected token type '{expected_type}', got '{token_type}'"
        )

    sub = payload.get("sub")
    if not sub:
        raise TokenInvalidError("Token missing subject")
    try:
        uuid.UUID(sub)
    except ValueError:
        raise TokenInvalidError("Token subject is not a valid UUID")

    return payload


def get_token_jti(token: str) -> str | None:
    try:
        # decode without verification, just need the JTI
        payload = jwt.get_unverified_claims(token)
        return payload.get("jti")
    except JWTError:
        return None
