<div align="center">

# ☁️ CloudVault

**Self-hosted cloud storage that respects your privacy.**

Upload, organize, share, and manage files with encryption, fine-grained permissions, and full audit trails. Your data stays on your infrastructure.

[![Build](https://img.shields.io/github/actions/workflow/status/0xABCD01/cloud-file-manager/ci.yml?branch=main&style=flat-square)](https://github.com/0xABCD01/cloud-file-manager/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg?style=flat-square)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg?style=flat-square&logo=next.js)](https://nextjs.org)
[![Security](https://img.shields.io/badge/Security-Hardened-red.svg?style=flat-square)](#security)

</div>

---

## What is this?

CloudVault is a self-hosted file manager you run on your own hardware. Think Google Drive, but you own the server, the data, and the keys.

I built this because I got tired of trusting random cloud providers with my files. Everything runs in Docker, encrypts at rest, and logs every access attempt.

## Quick start

```bash
git clone https://github.com/0xABCD01/cloud-file-manager.git
cd cloud-file-manager
cp .env.example .env
make dev
```

Open `http://localhost:3000` for the UI or `http://localhost:8000/docs` for the API.

That's it. Three commands.

## Features

| Feature | Details |
|---------|---------|
| **File upload** | Drag-and-drop, multi-file, folder upload. MIME detection via libmagic, not the Content-Type header. |
| **Folders** | Nested tree with depth limits. Breadcrumb navigation. Recursive operations. |
| **Sharing** | Public links with optional passwords and expiry. User-to-user permissions (view/edit/admin) with folder inheritance. |
| **Auth** | JWT RS256 with 4096-bit keys. Refresh token rotation. bcrypt password hashing. |
| **Audit log** | Every upload, download, delete, share, and permission change is logged with IP and user agent. |
| **Storage** | S3-compatible (MinIO for dev, AWS S3 for prod). Local filesystem fallback when S3 isn't available. |
| **Security headers** | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy on every response. |
| **Quotas** | Per-user storage limits with visual indicators. |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Next.js 15  │────▶│  FastAPI     │────▶│  PostgreSQL  │
│  (frontend)  │     │  (backend)   │     │  (metadata)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              ┌─────▼─────┐  ┌────▼─────┐
              │  Redis 7   │  │  S3/MinIO │
              │  (cache)   │  │  (files)  │
              └────────────┘  └──────────┘
```

**Backend:** FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, Celery  
**Frontend:** Next.js 15 App Router, TypeScript 5, Tailwind CSS 4, Zustand, React Query  
**Infra:** Docker Compose, PostgreSQL 16, Redis 7, MinIO

## Security

I take this part seriously. Here's what's baked in:

- **Path traversal defense** — null bytes, symlink escapes, Unicode normalization, Windows reserved names. All blocked.
- **No client-side trust** — MIME types detected from file content (libmagic). Storage keys generated server-side (UUID). Filenames sanitized.
- **SVG handling** — always served as `application/octet-stream` with `Content-Disposition: attachment`. No inline rendering, no XSS.
- **Share links** — tokens are `secrets.token_urlsafe(32)`. Password-protected links use bcrypt. Expired/revoked links return generic 404s (no information leakage).
- **Token rotation** — refresh tokens rotate on every use. Replay detection invalidates the entire token family.
- **Audit trail** — append-only log of every security-relevant event. IP, user agent, timestamp, action.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## API

Full interactive docs at `/docs` (Swagger) and `/redoc`.

```
POST   /api/v1/auth/register        Create account
POST   /api/v1/auth/login            Get tokens
POST   /api/v1/auth/refresh          Rotate tokens
POST   /api/v1/files/upload          Upload file
GET    /api/v1/files/                List files
GET    /api/v1/files/:id/download    Download file
POST   /api/v1/folders/              Create folder
GET    /api/v1/folders/tree          Sidebar tree
POST   /api/v1/sharing/links         Create share link
GET    /api/v1/sharing/resolve/:tok  Resolve public link (no auth)
```

## Running tests

```bash
# Backend unit tests (96 tests, ~30s)
cd backend && python -m pytest tests/ -v

# Lint
cd backend && ruff check app/ tests/
```

## Project structure

```
cloud-file-manager/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers
│   │   ├── core/            # Config, JWT, storage
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic request/response
│   │   ├── services/        # Business logic
│   │   └── utils/           # Path safety, MIME detection
│   ├── tests/               # pytest suite
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # UI components
│   │   ├── hooks/           # React hooks
│   │   └── lib/             # API client, auth store
│   └── package.json
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Contributing

Fork it, branch it, PR it. Run tests before pushing.

```bash
git checkout -b feature/my-thing
# make changes
make test-backend
git commit -m "add my thing"
git push origin feature/my-thing
# open PR
```

## License

[MIT](LICENSE)

---

<div align="center">

**Built with ☕ and paranoia about where my files go.**

If this saved you time, give it a ⭐

</div>
