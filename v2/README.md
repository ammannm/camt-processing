# camt-processing v2

Greenfield rewrite. **Spec:** [../GENERIC_PRIMITIVES.md](../GENERIC_PRIMITIVES.md) — diese Datei definiert verbindlich, welche Operationen die Engine anbietet und ist gleichzeitig der Bauplan für YAML und Code.

## Leitprinzip

Die Engine kennt nur generische Begriffe: Texte, Felder, Werte, Tabellen, Matrizen, Listen, Regeln, Schritte, Bedingungen, Schwellwerte, Scores.

Die Engine kennt **nie**: konkrete Domänenbegriffe („Ort", „Konto", „Zahlungsmittel"), konkrete Klassen-IDs („TWINT", „Miete"), konkrete Tabellenstrukturen, konkrete Output-Schemata.

Alles Domänenspezifische lebt **ausschliesslich** in der Konfiguration unter `config/`.

## Verzeichnisstruktur

```
config/
  classes.yaml         # §1 Klassifikation
  extraction.yaml      # §2/§3 Feldextraktion + Transformationen
  tables.yaml          # §4.1 Einschlüssel-Tabellen
  matrices.yaml        # §4.2 Zweischlüssel-Matrizen
  pipeline.yaml        # §5/§6 Schrittlisten pro Klasse + Mehrfach-Ausgabe
  registries.yaml      # §8 Wiederverwendbare Listen
  export.yaml          # §9 Ausgabe-Spalten

src/
  shared/types.ts      # Domänenfreie Domain-Typen
  engine/
    config/            # Loader + Zod-Schemas
    io/                # Eingangs-Reader (CAMT) + Ausgangs-Writer
    classify/          # §1
    extract/           # §2/§3
    run/               # §5 + §4 (Lookups als Schritte)
    multiply/          # §6
    diagnostics/       # §7
    export/            # §9
  main/                # Electron Main-Prozess
  preload/             # Electron Preload
  renderer/            # React UI (minimal)

tests/
  fixtures/            # Eingangs-XML-Beispiele
```

## Bezug zu V1

V1 (Wurzelverzeichnis dieses Repos) ist Referenz für Regeln, Schwellwerte und Beispieldaten. Wird aber **nicht** wiederverwendet — V2 ist ein eigenständiger Greenfield-Build.

## Setup

```bash
npm install
npm test
npm run dev
```
