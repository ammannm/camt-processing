# Backend MVP

## Setup

```bash
cd backend
uv sync
```

## Datenbank Migration

```bash
uv run alembic upgrade head
```

## API starten

```bash
uv run uvicorn app.main:app --reload --port 8000
```

OpenAPI UI: <http://localhost:8000/docs>

## API Endpunkte (MVP)

- `POST /api/v1/camt053/parse` (multipart file upload, Feldname `file`)
- `POST /api/v1/booking-entries` (speichert einen einzelnen Buchungssatz)
