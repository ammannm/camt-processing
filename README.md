# CAMT.053 Processing MVP Basis

Dieses Repository enthaelt ein einfaches MVP-Setup mit:

- `frontend/`: Angular + AG Grid + Tailwind
- `backend/`: FastAPI + SQLAlchemy + Alembic + `uv`

## PostgreSQL via Docker Compose

```bash
docker compose up
docker compose down
```

Startet die komplette Dev-Umgebung:

- PostgreSQL auf `localhost:5433`
- FastAPI (Hot Reload) auf <http://localhost:8000>
- OpenAPI auf <http://localhost:8000/docs>
- Angular (Hot Reload) auf <http://localhost:4200>

Wenn du nur die DB starten willst:

```bash
docker compose up -d postgres
docker compose stop postgres
docker compose start postgres
docker compose down
```

Externer DB-Port: `5433` (intern bleibt PostgreSQL auf `5432`).

## Frontend lokal starten (optional)

```bash
cd frontend
npm install
npm start
```

App: <http://localhost:4200>

## Backend lokal starten (optional)

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
curl -X POST http://localhost:8000/api/v1/camt053/parse \
  -F "file=@/pfad/zu/deiner/datei.xml"

curl -X POST http://localhost:8000/api/v1/booking-entries \
  -H "Content-Type: application/json" \
  -d '{"original_booking_text":"ALT","new_booking_text":"NEU","account_number":"ABC123"}'
```
