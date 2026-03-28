# CAMT.053 Processing MVP Basis

Dieses Repository enthaelt ein einfaches MVP-Setup mit:

- `frontend/`: Angular + AG Grid + Tailwind
- `backend/`: FastAPI + SQLAlchemy + Alembic + `uv`

## PostgreSQL via Docker Compose

```bash
docker compose up -d postgres
docker compose stop postgres
docker compose start postgres
docker compose down
```

Externer DB-Port: `5433` (intern bleibt PostgreSQL auf `5432`).

## Frontend starten

```bash
cd frontend
npm install
npm start
```

App: <http://localhost:4200>

## Backend starten

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

API: <http://localhost:8000>
OpenAPI: <http://localhost:8000/docs>

## Erste API Calls

```bash
curl -X GET http://localhost:8000/api/v1/items
curl -X POST http://localhost:8000/api/v1/items -H "Content-Type: application/json" -d '{"name":"Neue Verarbeitung","description":"MVP Test"}'
```
