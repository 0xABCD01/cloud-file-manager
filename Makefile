.PHONY: dev test-backend test-frontend lint migrate seed docker-up docker-down clean

dev: docker-up

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

test-backend:
	cd backend && python -m pytest tests/ -v --tb=short

test-frontend:
	cd frontend && npm test

lint:
	cd backend && ruff check app/ tests/
	cd backend && mypy app/ --ignore-missing-imports
	cd frontend && npx tsc --noEmit

migrate:
	cd backend && alembic upgrade head

seed:
	cd backend && python -m app.seed

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
