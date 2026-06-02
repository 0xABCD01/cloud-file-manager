# Contributing

Thanks for looking at this. Here's how to get started.

## Setup

```bash
git clone https://github.com/0xABCD01/cloud-file-manager.git
cd cloud-file-manager
cp .env.example .env
make dev
```

This spins up PostgreSQL, Redis, MinIO, the backend, and the frontend via Docker Compose.

For local development without Docker:

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Running tests

```bash
make test-backend   # pytest
make lint           # ruff + mypy + eslint + tsc
```

## Code style

- Python: ruff formatting, strict mypy
- TypeScript: ESLint + Prettier defaults
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)

## Pull requests

1. Fork and branch off `main`
2. Make your changes
3. Run `make test-backend` and `make lint`
4. Open a PR with a clear description of what and why

I review PRs within a few days. If I'm slow, ping me.

## What I look for

- Does it work?
- Are there tests?
- Does it introduce security issues?
- Is the commit history clean?
