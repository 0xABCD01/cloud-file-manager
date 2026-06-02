import pytest
from httpx import AsyncClient


class TestRegister:
    @pytest.mark.asyncio
    async def test_register_success(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "password": "SecureP@ss1",
            "display_name": "New User",
        })
        assert resp.status_code == 201
        assert "successful" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_weak_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "weak@example.com",
            "password": "short",
            "display_name": "Weak User",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncClient):
        data = {
            "email": "dup@example.com",
            "password": "SecureP@ss1",
            "display_name": "Dup User",
        }
        await client.post("/api/v1/auth/register", json=data)
        resp = await client.post("/api/v1/auth/register", json=data)
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_register_no_uppercase(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "noupp@example.com",
            "password": "securepass1!",
            "display_name": "Test",
        })
        assert resp.status_code == 422


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, user_token: str):
        assert user_token

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "email": "wrong@example.com",
            "password": "SecureP@ss1",
            "display_name": "Wrong",
        })
        resp = await client.post("/api/v1/auth/login", json={
            "email": "wrong@example.com",
            "password": "WrongP@ss1",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "SecureP@ss1",
        })
        assert resp.status_code == 401


class TestProfile:
    @pytest.mark.asyncio
    async def test_get_profile(self, client: AsyncClient, user_token: str):
        resp = await client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["display_name"] == "Test User"

    @pytest.mark.asyncio
    async def test_get_profile_no_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 401


class TestHealth:
    @pytest.mark.asyncio
    async def test_health_endpoint(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.status_code == 200
        assert "docs" in resp.json()
