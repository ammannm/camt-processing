# AGENTS.md

## Ziel

Dieses Dokument definiert, wie Agenten in diesem Repository arbeiten sollen, um den MVP fuer CAMT.053-Processing stabil weiterzuentwickeln.

## Projektstruktur

- `frontend/`: Angular UI mit AG Grid und Tailwind.
- `backend/`: FastAPI API, SQLAlchemy Domain-Modelle, Alembic Migrationen.

## Agentenrollen

### 1) Product Agent

- Klaert fachliche Anforderungen.
- Beschreibt User Flows (Import, Verarbeitung, Ausgabe).
- Definiert MVP Scope pro Iteration.

### 2) Frontend Agent

- Arbeitet ausschliesslich in `frontend/`.
- Baut Views, Grid-Konfiguration und Form-Flows.
- Nutzt Services fuer API-Aufrufe und typed Models.

### 3) Backend Agent

- Arbeitet ausschliesslich in `backend/`.
- Implementiert FastAPI Endpunkte unter `app/api/`.
- Haltet Datenlogik in `app/crud/` und Modelle in `app/models/`.

### 4) Data/Migration Agent

- Pflege von SQLAlchemy Modellen.
- Erstellt und prueft Alembic Revisionen in `alembic/versions/`.
- Stellt Vorwaerts- und Rueckwaertsmigration sicher.

### 5) QA Agent

- Prueft API Kontrakte (OpenAPI, Statuscodes, Error Cases).
- Testet Frontend-Basisfluesse manuell und automatisiert.
- Verifiziert End-to-End den MVP-Hauptflow.

## Arbeitsregeln

- Keine Breaking Changes ohne dokumentierten Migrationspfad.
- Jede DB-Aenderung braucht eine Alembic Migration.
- API-Aenderungen muessen im OpenAPI-Schema sichtbar sein.
- Frontend konsumiert API nur ueber dedizierte Service-Layer.
- Kleine, nachvollziehbare Commits pro Feature/Fix.
- CAMT.053 Upload wird zuerst nur geparst und im UI bearbeitet; Persistenz passiert pro Datensatz erst bei explizitem Save.
- DB-Feldnamen sind Englisch, `snake_case`, PostgreSQL-kompatibel.
- Normalisierung von Buchungstexten erfolgt nur im Backend.

## Definition of Done

- Feature laeuft lokal in Frontend und Backend.
- Migrationen laufen mit `uv run alembic upgrade head`.
- API-Dokumentation ist unter `/docs` nutzbar.
- Keine offensichtlichen Lint-/Typfehler.
- README ist bei Setup-Aenderungen aktualisiert.
