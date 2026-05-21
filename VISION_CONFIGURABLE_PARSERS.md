# Vision: Konfigurationsgetriebene Verarbeitungs-Engine (V2)

**Version:** 3.0 — Domänenfreie Engine, Greenfield-Neuaufbau in `v2/`
**Letzte Anpassung:** 21. Mai 2026
**Status:** Spezifikation steht, Skeleton aufgebaut, Implementierung beginnt
**Verbindliche Spezifikation:** [GENERIC_PRIMITIVES.md](GENERIC_PRIMITIVES.md)
**Greenfield-Projekt:** [`v2/`](v2/)

---

## Was sich gegenüber V2.3 geändert hat

Die ursprüngliche Vision war noch zu nah an der Fachdomäne. Begriffe wie „Transaktionstyp", „Detection", „Parser-Regel", „location_accounts", „payment_method_matrix" suggerieren, die Engine wisse, was eine Bank-Transaktion ist. Tut sie nicht — sie weiss nur, wie man Texte zerlegt, Werte transformiert und Tabellen nachschlägt.

V3 zieht diese Konsequenz radikal:

- **Keine Domänen-Vokabeln im Code.** Weder „Transaktion" noch „Detection" noch „location_accounts" stehen mehr in TypeScript-Bezeichnern. Stattdessen: **Klasse, Feldextraktion, Tabelle, Matrix, Schritt, Bedingung**.
- **Verbindliche Spezifikation** ist [GENERIC_PRIMITIVES.md](GENERIC_PRIMITIVES.md). Dort sind die neun Sektionen aufgelistet, die die Engine genau abdeckt. Jeder Code-Baustein gehört zu einer dieser Sektionen — oder die Spec wird erweitert, nicht „der Code drüber hinaus".
- **Greenfield in `v2/`** statt Schwesterordner. Alle Pfade sind relativ zur Repo-Wurzel.

V2.3 (die alte Fassung) ist als Lernschritt dokumentiert: Sie hat gezeigt, wie domänenspezifische Begriffe sich beim besten Willen einschleichen. V3 ist die Antwort darauf.

---

## Hartes Architekturprinzip

**Die Engine kennt nur generische Begriffe.**

| Engine darf kennen | Engine darf nie kennen |
|---|---|
| Texte, Felder, Werte | „Transaktionstyp", „TWINT", „Miete" |
| Tabellen, Matrizen, Listen | „location_accounts", „payment_method_matrix" |
| Regeln, Schritte, Bedingungen | „account_debit", „cost_center" als feste Felder |
| Schwellwerte, Scores, Klassen-IDs (als opake Strings) | Konkrete Output-Schemata |

Falls eine Frage diesen Grundsatz brechen würde, ist das ein Signal:
- Die Spec (`GENERIC_PRIMITIVES.md`) wird erweitert, oder
- Eine neue Regelart wird in die Konfiguration aufgenommen.

**Niemals eine Ausnahme im TypeScript.**

---

## Wo lebt was

```
camt-processing/                  ← Altprojekt (Referenzquelle für Regeln/Beispiele)
  GENERIC_PRIMITIVES.md           ← verbindliche Spezifikation
  VISION_CONFIGURABLE_PARSERS.md  ← dieses Dokument (high-level vision)
  src/, excel/, beispiel_daten/   ← V1-Code, nur Referenz
  v2/                             ← Greenfield-V2
    config/
      classes.yaml                §1 Klassifikation
      extraction.yaml             §2 + §3 Feldextraktion + Transformationen
      tables.yaml                 §4.1 Einschlüssel-Tabellen
      matrices.yaml               §4.2 Zweischlüssel-Matrizen
      pipeline.yaml               §5 + §6 Schrittlisten + Mehrfach-Ausgabe
      registries.yaml             §8 Wiederverwendbare Listen
      export.yaml                 §9 Ausgabe-Spalten
    src/
      shared/                     domänenfreie Typen, IPC-Contract
      engine/
        config/                   Loader + Zod-Schemas
        io/                       CAMT-Reader (Boundary, einer der wenigen domain-aware Punkte)
        classify/                 §1
        extract/                  §2 + §3
        run/                      §5 step-runner + §4 lookups
        multiply/                 §6
        diagnostics/              §7
        export/                   §9
        pipeline.ts               Top-Level-Orchestrator
      main/, preload/, renderer/  Electron-App
    tests/
      fixtures/                   CAMT-XML-Beispiele
```

---

## Die neun Engine-Fähigkeiten — Kurzform

Die vollständige Beschreibung steht in [GENERIC_PRIMITIVES.md](GENERIC_PRIMITIVES.md). Hier nur die Übersicht, damit klar ist, wie aus „Bank-Transaktion" eine domänenfreie Sicht wird:

1. **Klassifikation** — Rohzeile bekommt eine Klassen-ID (opaker String) per Fuzzy-Match gegen Schlüsselwörter, höchster Score gewinnt, optionaler Vorfilter, optionale Priorität als Tiebreaker.
2. **Feldextraktion** — Pro Klasse beliebige frei benannte Felder aus Text gewinnen: Regex, statisch, Template, Token-Selektion, bedingt, Volltext.
3. **Werttransformation** — Numerische und String-Transformationen inkl. Längenkontrolle mit Alternativwert und Overflow-Feld.
4. **Tabellen-Lookup** — Zwei generische Primitiven: Einschlüssel-Tabelle (Schlüssel → Record) und Zweischlüssel-Matrix (Zeile × Spalte → Wert). Beide mit drei Match-Modi (exakt, normalisiert, fuzzy).
5. **Konditionaler Kontrollfluss** — Geordnete Schrittliste pro Klasse: Lookup, Set, When, Emit-Row. Spätere Schritte können frühere überschreiben.
6. **Mehrfach-Ausgabe** — Eine Eingangszeile darf mehrere Ergebniszeilen erzeugen (z.B. zweite Buchung für Gebühren).
7. **Validierung und Diagnose** — Pflichtfelder, Fehler-Liste pro Zeile, optionales strukturiertes Diagnose-Protokoll.
8. **Wiederverwendbare Listen** — Benannte String-Listen (Registries), per Namen referenzierbar.
9. **Ausgabe-Mapping** — Welche Felder mit welchen Headern in welcher Reihenfolge ausgegeben werden, ist eine eigene Konfigurationsebene — die Engine selbst legt kein Output-Schema fest.

---

## Was eine neue Verarbeitungsklasse hinzuzufügen bedeutet

Ausschliesslich YAML, kein TypeScript:

1. **Klassifikationsregel** in `classes.yaml` ergänzen.
2. **Extraktionsregeln** in `extraction.yaml` unter dem gewählten Klassen-ID.
3. **Pipeline-Schritte** in `pipeline.yaml` (Lookups, Set, When, Emit-Row).
4. Falls benötigt: Tabellen/Matrizen in `tables.yaml`/`matrices.yaml` ergänzen.
5. Falls benötigt: Liste in `registries.yaml` ergänzen.

Beim Start läuft der Loader die sieben Dateien durch, validiert sie gegen Zod und prüft Querverweise (Klassen-ID konsistent über Dateien, referenzierte Tabellen/Matrizen/Registries existieren). Bei Fehlern: klare Meldung, kein stiller Fehlbetrieb.

---

## Status

| Bereich | Stand |
|---|---|
| Spezifikation `GENERIC_PRIMITIVES.md` | ✅ Verbindlich beschlossen |
| `v2/` Verzeichnisstruktur und Electron-Skeleton | ✅ Aufgesetzt |
| Sieben leere YAML-Templates | ✅ Vorhanden |
| Domain-freie Typen (`shared/types.ts`) | ✅ Definiert |
| Engine-Modul-Stubs mit JSDoc-Verweis auf die Spec-Sektionen | ✅ Angelegt |
| Electron Main/Preload/Renderer | ✅ Minimal (Datei wählen + Start-Button) |
| Config-Loader mit Zod | 🟡 Skelett vorhanden, Schemata sind noch `z.unknown()` |
| Klassifikation §1 | ⏳ Stub |
| Feldextraktion §2/§3 | ⏳ Stub |
| Lookups §4 | ⏳ Stub |
| Step-Runner §5 + Multiplier §6 | ⏳ Stub |
| Diagnostik §7 | ⏳ Stub |
| Export §9 | ⏳ Stub |
| Smoke-Test Config-Loader | ✅ 2 Tests grün, `tsc --noEmit` sauber |

---

## Implementierungsreihenfolge

Die Spec-Sektionen werden bottom-up implementiert, damit jeder Schritt sofort testbar ist:

1. **§4 Lookups** — kleinste in sich geschlossene Funktion, lässt sich ohne Pipeline isoliert testen.
2. **§1 Klassifikation** — entkoppelt von Extraktion/Pipeline; produziert nur eine Klassen-ID.
3. **§2 + §3 Feldextraktion + Transformationen** — kann erst mit klassifizierten Zeilen sinnvoll laufen, aber ohne Pipeline.
4. **§5 Step-Runner** — orchestriert §4 zusammen mit `set`/`when`.
5. **§6 Multiplier** — baut auf §5 auf.
6. **§7 Diagnostik** — wird durchgehend mitgezogen, finalisiert sobald §5 läuft.
7. **§9 Export** — als letzter Schritt, weil er nur ein Ausgabeformat-Wrapper ist.
8. **End-to-End-Validierung** an `tests/fixtures/representative_transactions.xml`, indem die Konfiguration mit den real benötigten Klassen befüllt wird (z.B. die zehn Klassen, die das Altprojekt heute kennt).

---

## Grundprinzipien für die Weiterentwicklung

1. **Spec first.** Bevor Code geschrieben wird: passt das in eine der neun Sektionen? Wenn nein → Spec erweitern, dann Code, sonst nichts tun.
2. **Engine erweiterbar, nicht anpassbar.** Neue Source-Methoden oder Transformationen kommen in die Engine als zusätzliche generische Bausteine. Klassenspezifische Logik kommt nie in den Code.
3. **Keine stillen Fehler.** Fehlerhafte Konfiguration bricht beim Start mit verständlicher Meldung ab.
4. **Domain-freier Wortschatz.** TypeScript-Bezeichner enthalten nur Engine-Begriffe. Klassen-IDs, Feldnamen, Tabellen- und Matrixnamen leben ausschliesslich als opake Strings in der YAML.
5. **Diagnostik mitliefern.** Jede Verarbeitungsstufe ist ohne zusätzlichen Aufwand nachvollziehbar — wer hat klassifiziert, welche Tabellen-Zeile hat getroffen, welches Feld wurde gesetzt.
6. **Stop-Regel.** Wenn ein Schritt die bisherige Erwartung bricht und die Ursache nicht klar isolierbar ist: zurückbauen und separat lösen, statt darauf weiter aufzubauen.

---

## Bezug zum Altprojekt

Der Code im Wurzelverzeichnis (`src/`, `excel/`, `mapping-service.ts`, `transaction-parsers.ts`, `transaction-type-detector.ts`) ist **Referenzquelle**, kein Wiederverwendungsziel:

- **Regexe, Schlüsselwörter, Schwellwerte** werden bei Bedarf in die V2-YAML übernommen.
- **Excel-Daten** (`excel/template.xlsx`) werden einmalig nach `v2/config/tables.yaml` und `v2/config/matrices.yaml` migriert.
- **Code-Strukturen** werden bewusst nicht übernommen — V2 startet sauber gegen die Spec.

Wenn V2 den Reifegrad von V1 erreicht und auf realen Daten validiert ist, kann V1 archiviert oder entfernt werden. Bis dahin laufen beide nebeneinander.
