# Vision: Konfigurierbare Transaction Parser & Mapping (V2)

**Version:** 2.2 — Revidiert nach Code-Abgleich und Migrationsplanung  
**Letzte Anpassung:** 20. Mai 2026  
**Status:** Zielarchitektur definiert, Migration startet mit Fundament statt mit Mapping

---

## Executive Summary

**Grundprinzip:** Die Applikation soll keine fachliche Logik mehr im Code kennen. Code = generische Engine. Fachliche Regeln = YAML-Konfiguration.

**Wichtige Klarstellung:** Diese Datei beschreibt ab jetzt den Zielzustand und die geplante Migration. Der aktuelle Code erfüllt diesen Stand noch nicht. Detection, Parser und Teile des Mappings sind heute weiterhin hard-codiert.

**Was das bedeutet:**
- Neuer Transaktionstyp? → Nur YAML editieren, kein Code anfassen.
- Geänderte Regex? → YAML, kein Deploy.
- Neue Kontenzuordnung? → YAML (löst Excel ab), kein Programmierer nötig.

**Revidierter Ist-Zustand:**

| Bereich | Stand | Beschreibung |
|---|---|---|
| **Detection** | ❌ Hardcodiert | Keywords und Schwellenwerte liegen aktuell in TypeScript |
| **Parser-Engine** | ❌ Hardcodiert | 11 typspezifische Parser-Funktionen statt generischer Engine |
| **Parser-Konfiguration** | ❌ Nicht vorhanden | Keine produktiv genutzte `transaction-rules.yaml` im Codepfad |
| **Mapping (Konten/Kostenstellen)** | ⚠️ Teilweise extern | Daten aus Excel, Lookup-Logik zusätzlich im Code verdrahtet |
| **Mapping (Zahlungsmittel-Matrix)** | ⚠️ Teilweise extern | Matrix liegt in Excel, Fallback- und Override-Logik im Code |
| **Config-Validierung (Zod)** | ❌ Offen | Fehlerhafte YAML-Regeln werden noch nicht geprüft |
| **Conditional Logic in Config** | 🟡 Später prüfen | Erst nach stabiler V1-Engine, nicht in der ersten Ausbaustufe |
| **Registry-System** | ❌ Offen | Wiederverwendbare Listen (z.B. Shop-Präfixe) |
| **TransactionType-Enum ablösen** | ❌ Offen | Zentrale Kopplung, die neue Typen im Code erzwingt |

**Konsequenz für die Umsetzung:** Wir starten nicht mit immer mehr YAML-Strukturen auf bestehendem Code, sondern zuerst mit dem Fundament: string-basierte Typen, Config-Layer, Validierung und Regressionstests. Erst darauf folgen Detection, Parsing und Mapping.

---

## Teil 0: Realitätscheck im aktuellen Code

Die wichtigsten Hardcodings heute:

- `transaction-type-detector.ts` enthält die komplette Detection als feste If-Kette mit Keywords, Schwellen und Sonderbehandlung für `CRDT` / `DBIT`.
- `transaction-parsers.ts` enthält 11 typspezifische Parser-Funktionen mit festen Regexen, Texttemplates und Sonderfällen.
- `main-logic.ts` verdrahtet Parser und Mapping über harte Typverzweigungen, feste Suchstrings und feste Konten.
- `mapping-service.ts` lädt Excel-Daten, aber die fachliche Lookup-Logik liegt nicht vollständig dort.
- `shared/types.ts` erzwingt über den `TransactionType`-Enum, dass neue Typen im Code definiert werden müssen.

Diese Vision ist daher nicht nur eine Feature-Liste, sondern ein kontrollierter Migrationsplan von diesem Ist-Zustand in eine generische Engine.

---

## Teil 1: Architektur-Prinzip — Pipeline ohne Sonderfälle

Jede Transaktion durchläuft dieselbe generische Pipeline. Die Konfiguration entscheidet, was in jedem Schritt passiert:

```
XML-Rohdaten
    ↓
[1. Detection]      → Welcher Typ? (fuzzy_keyword aus YAML)
    ↓
[2. Extraction]     → Felder extrahieren (regex, split, template aus YAML)
    ↓
[3. Transformation] → Werte normalisieren (trim, abs, substring aus YAML)
    ↓
[4. Validation]     → Pflichtfelder vorhanden? (error_if_not_found aus YAML)
    ↓
[5. Mapping]        → Konten/Kostenstellen nachschlagen (YAML → löst Excel ab)
    ↓
[6. Post-Processing]→ Fee-Buchung, Text-Truncation (konfigurierbar)
    ↓
Export (Excel)
```

**Kein Schritt enthält fachliche Regeln im Code.** Die Engine weiss, wie man einen Regex ausführt — sie weiss nicht, wie eine TWINT-Transaktion aussieht.

**Wichtig:** Dieses Ziel bedeutet nicht, dass die YAML zu einer allgemeinen Programmiersprache werden soll. V1 der Engine unterstützt nur einen kleinen, expliziten Satz an Regelbausteinen. Alles Weitere wird erst ergänzt, wenn mindestens ein realer Use Case es erzwingt.

---

## Teil 2: Zielkonfiguration für V1

Die erste produktive Konfigurationsversion soll absichtlich begrenzt bleiben. Ziel ist, alle heutigen Typen abzubilden, ohne eine schwer wartbare DSL zu bauen.

**V1 soll unterstützen:**

- Detection-Regeln mit Keyword, Fuzzy-Schwelle, Priorität und optionalem Feldfilter
- Parser-Regeln mit `regex`, `static_value`, `source`, `template` und einfachen Transformationen
- Feldvalidierung wie `error_if_not_found`, `include_raw_on_error`, `absolute_value`, `max_length`
- Mapping-Regeln für feste Typ-Zuordnungen, ortsbasierte Zuordnungen, Kostenstellen und Zahlungsmittel-Matrix
- Einfache Post-Processing-Regeln wie Zusatzbuchung aus `fee_amount` oder Text-Fallbacks

**V1 soll bewusst noch nicht unterstützen:**

- Beliebig verschachtelte Bedingungen
- Freie Skriptausdrücke in YAML
- Eine allgemeine Workflow- oder Regel-DSL
- Registries ohne realen Wiederverwendungsfall

### 2a: Detection Rules

Definieren, wann ein Transaktionstyp erkannt wird. Verwendet Fuzzy-Matching gegen `additional_text`.

```yaml
detection_rules:
  - id: twint
    keyword: "TWINT ACQUIRING AG"   # Text im Rohdatensatz
    min_similarity: 95              # Fuzzy-Match-Schwellenwert (0–100)
    result: twint                   # Frei definierbarer Typ-Key

  - id: eft_pos_credit
    keyword: EFT/POS
    min_similarity: 95
    credit_debit_indicator: CRDT    # Optional: Einschränkung auf CRDT oder DBIT
    result: eft_pos_credit
```

Erweiterung: Einfach einen neuen Block hinzufügen. Kein Code nötig.

---

### 2b: Parser Rules

Definieren pro Typ, welche Felder wie extrahiert werden. Die Engine führt diese Regeln aus — keine typ-spezifische Logik im TypeScript.

**Verfügbare Extraktionsmethoden:**

| Methode | Verwendung | Beispiel |
|---|---|---|
| `regex` | Pattern mit Capture-Group | `regex: "GROSS:\\s*(-?\\d+)"` |
| `static_value` | Fester Wert | `static_value: "TWINT"` |
| `template` | Zusammengesetzter Text aus Variablen | `template: "{payment_type} {location}"` |
| `source: first_word` | Erstes Wort des Textes | Datum am Anfang |
| `source: last_two_words` | Letzten 2 Wörter | Ortsangabe am Ende |
| `source: last_three_words` | Letzten 3 Wörter | Buchungstext am Ende |
| `source: first_part_last_word` | Letztes Wort vor dem ersten Delimiter | Zahlungstyp |
| `source: second_part` | Inhalt nach dem ersten Delimiter | Betrag |
| `source: debit_credit_prefix` | CRDT/DBIT-bedingter Prefix | Gutschrift / Lastschrift |

**Verfügbare Feld-Optionen:**

| Option | Bedeutung |
|---|---|
| `capture_group` | Welche Regex-Gruppe verwenden (Default: 1) |
| `type: decimal` | Wert als Dezimalzahl parsen |
| `absolute_value: true` | Immer positiv (für Gebühren) |
| `max_length` | Auf N Zeichen kürzen |
| `take_last_n_chars` | Letzten N Zeichen verwenden (z.B. für Kontonummer) |
| `remove_pattern` | Pattern aus Wert entfernen (z.B. `"(CH)"`) |
| `error_if_not_found: true` | Fehler setzen wenn kein Match |
| `include_raw_on_error: true` | Rohdaten im Fehler-Zusatztext speichern |
| `anonymous_prefixes` | Liste von Präfixen, die aus Location entfernt werden |
| `delimiter` | Trennzeichen für Split-Operationen |

**Verfügbare Transaction-Text-Optionen:**

| Option | Bedeutung |
|---|---|
| `template` | Zusammensetzung: `"{payment_type} {location} {text_date}"` |
| `max_length` | Maximale Textlänge |
| `fallback_template` | Kürzere Variante wenn `max_length` überschritten |
| `fallback_field` | Welches Feld in `additional_text` verschoben wird bei Kürzung |
| `replace_from` / `replace_to` | Textersetzung nach Zusammensetzung |
| `prefix` | Fester Prefix voranstellen |
| `prefix_crdt` / `prefix_dbit` | Bedingter Prefix je nach Buchungsrichtung |
| `append_location` | Location nach Transaction-Text anhängen |

**Beispiel — TWINT (komplex, mit Fees):**
```yaml
parser_rules:
  twint:
    debit_credit_amount:
      regex: "GROSS:\\s*(-?\\d+(?:\\.\\d+)?)"
      capture_group: 1
      type: decimal
    fee_amount:
      regex: "FEES:\\s*(-?\\d+(?:\\.\\d+)?)"
      capture_group: 1
      type: decimal
      absolute_value: true          # Gebühr immer positiv
    transaction_text:
      regex: "REFERENZEN:\\s*([^-]+)"
      capture_group: 1
      append_location: true         # Location wird nach dem Referenztext angehängt
    location:
      regex: "TWINT\\s+((?:(?!TWINT).)+?)\\s+PAY\\s*OUT"
      capture_group: 1
      anonymous_prefixes: ["KUNDE ANONYM", "PRO SHOP", "SCHLEIFSERVICE", "OCHSI"]
      error_if_not_found: true
      include_raw_on_error: true
    payment_type:
      static_value: "TWINT"
```

**Beispiel — Einfacher Typ (TRANSFER):**
```yaml
  transfer:
    text_date:
      source: first_word
    transaction_text:
      template: "Kontoübertrag {last_word}"
      max_length: 39
      fallback_template: "KU {last_word}"
```

**Beispiel — Nur statische Werte (CREDIT_ACCOUNT_MANAGEMENT):**
```yaml
  credit_account_management:
    transaction_text:
      static_value: "Preis für Kontoführung"
    location:
      static_value: "Preise"
```

---

## Teil 3: Neuen Transaktionstyp hinzufügen — Zielzustand

Kein TypeScript nötig. Nur YAML editieren.

**Schritt 1 — Detection-Regel:**
```yaml
detection_rules:
  - id: mein_neuer_typ
    keyword: "MEIN BANK AG ZAHLUNGSEINGANG"
    min_similarity: 93
    result: mein_neuer_typ
```

**Schritt 2 — Parser-Regel:**
```yaml
parser_rules:
  mein_neuer_typ:
    text_date:
      regex: "VOM\\s*(\\d{2}\\.\\d{2}\\.\\d{4})"
      capture_group: 1
    location:
      source: last_two_words
      remove_pattern: "(CH)"
    transaction_text:
      template: "Zahlung {text_date} {location}"
      max_length: 39
      fallback_template: "Zahlung {location}"
      fallback_field: text_date
    payment_type:
      static_value: "Meine Bank"
```

**Schritt 3 — Mapping-Eintrag:**
```yaml
location_accounts:
  MEIN_ORT:
    account_debit: "1100"
    account_credit: "3000"
    vat_code: "1"
    include_cost_center: false
```

Fertig. Kein Enum, kein Parser-Dispatch im Code, keine Test-Anpassung nur wegen des Typs.

---

## Teil 4: Offene Roadmap — Was noch fehlt

### Schritt 1: Fundament schaffen ← Nächster Schritt

**Problem heute:** Detection, Parser und Mapping hängen alle am `TransactionType`-Enum und an festen Codepfaden. Eine YAML-Datei allein würde daran noch nichts ändern.

**Ziel:**

- Typen intern als freie String-Keys statt Enum-Werte führen
- Config-Dateien zentral laden und normalisieren
- Konfiguration beim Start validieren
- Regressionstests aufbauen, damit das Verhalten vor und nach der Migration vergleichbar bleibt

**Ergebnis von Schritt 1:** Die Codebasis ist bereit für konfigurierbare Detection und Parser, ohne dass wir parallel neue Hardcodings einführen.

---

### Schritt 2: Detection in Config überführen

**Problem heute:** Keywords, Schwellenwerte und Sonderfälle für `CRDT` / `DBIT` sind fest in TypeScript kodiert.

**Ziel:** Eine generische Detection-Engine bewertet Regeln aus der Config und liefert einen String-Key als Typ zurück.

---

### Schritt 3: Parser-Engine als begrenztes Regelsystem einführen

**Problem heute:** Jede Transaktion hat ihre eigene Parser-Funktion mit eigenen Regexen und Textmanipulationen.

**Ziel:** Eine generische Engine unterstützt die heute real benötigten Extraktions- und Transformationsbausteine, aber noch keine allgemeine DSL.

---

### Schritt 4: Mapping-Migration (Excel → YAML) im Parallelbetrieb

**Problem heute:** Konten, Kostenstellen und Zahlungsmittel-Matrix sind in einer Excel-Datei. Das macht Deployments schwerer, ist nicht versionierbar und passt nicht zum Config-First-Ansatz.

**Zielstruktur `config/mappings.yaml`:**
```yaml
location_accounts:
  KLOTEN:
    account_debit: "1100"
    account_credit: "3000"
    vat_code: "1"
    include_cost_center: true
  PREISE:
    account_debit: "6800"
    account_credit: "1005"
    vat_code: "0"
    include_cost_center: false

payment_method_matrix:
  # location × payment_type → account_credit
  KLOTEN:
    TWINT: "1005"
    VISA:  "1006"
    CASH:  "1000"

type_accounts:
  # Feste Konten pro Transaktionstyp (kein Location-Lookup nötig)
  transfer:
    search_string: "KONTOUEBERTRAG"
  credit_account_management:
    search_string: "PREIS FÜR KONTOFÜHRUNG"
  commission:
    search_string: "BUCHUNGSSPESEN"
```

**Migration:** Einmaliger Export aus Excel → YAML. Excel bleibt als Fallback aktiv bis YAML-Variante validiert ist.

---

### Schritt 5: Config-Validierung mit Zod

**Problem heute:** Fehler in der YAML-Konfiguration führen zu stillem Fehlverhalten statt klarer Meldung.

**Ziel:** Beim Start wird die Config gegen ein Schema geprüft:
```
❌ Config-Fehler: parser_rules.TWINT.location.regex fehlt,
   aber error_if_not_found ist gesetzt.
   Bitte Regex angeben oder error_if_not_found entfernen.
```

Fehler sollen für Nicht-Programmierer verständlich sein.

---

### Schritt 6: Registry-System für wiederverwendbare Listen

**Problem heute:** Wiederverwendbare Listen wie Shop-Präfixe würden sonst mehrfach kopiert. Gleichzeitig wäre ein Registry-System zu früh, solange nicht mindestens zwei reale Regeln dieselbe Liste teilen.

**Ziel:**
```yaml
registries:
  twint_shop_prefixes:
    - "KUNDE ANONYM"
    - "PRO SHOP"
    - "SCHLEIFSERVICE"
    - "OCHSI"
    - "PENNY"        # ← Einfach ergänzen, kein Regex anpassen

parser_rules:
  twint:
    location:
      regex: "TWINT\\s+(.+?)\\s+PAY\\s*OUT"
      anonymous_prefixes_registry: twint_shop_prefixes  # Referenz statt inline-Liste
```

---

### Schritt 7: Conditional Logic in Config

**Problem heute:** Für CRDT/DBIT-Unterscheidungen oder ähnliche Varianten entstehen sonst mehrere sehr ähnliche Typen.

**Leitplanke:** Conditional Logic kommt erst nach einer stabilen V1-Engine. Vorher bevorzugen wir getrennte Regeln, wenn sie einfacher und klarer sind.

**Ziel:**
```yaml
  eft_pos:
    detection:
      keyword: "EFT/POS"
      min_similarity: 95
    transaction_text:
      condition:
        field: credit_debit_indicator
        equals: CRDT
      if_true:
        template: "Postcard {text_date} {location}"
      if_false:
        template: "Spesen vom {text_date} {location}"
    payment_type:
      condition:
        field: credit_debit_indicator
        equals: CRDT
      if_true:
        static_value: "EFT/POS Gutschrift"
      if_false:
        static_value: "EFT/POS Spesen"
```

---

### Schritt 8: Legacy entfernen und Enum ablösen

**Problem heute:** Enum, alte Parser-Funktionen und harte Switches bleiben sonst als zweite Wahrheit im Code bestehen.

**Ziel:** Der Typ ist nur der String aus `result:` in der Detection-Regel. Enum, typspezifische Parser und harte Mapping-Verzweigungen werden erst entfernt, wenn alle Regressionstests stabil sind.

```yaml
# Vorher: result muss im Enum stehen
result: MEIN_NEUER_TYP  # + Enum-Eintrag nötig

# Nachher: result ist frei definierbar
result: mein_neuer_typ  # Nur YAML, kein Code
```

---

### Schritt 9: Diagnostics-Logging

Wenn eine Transaktion nicht korrekt erkannt oder geparst wird, soll ein strukturiertes Log helfen:

```json
{
  "ref_id": "REF-001",
  "detection": {
    "winner": "TWINT",
    "score": 97.3,
    "all_scores": { "TWINT": 97.3, "TRANSFER": 12.1 }
  },
  "extraction": {
    "location": { "matched": "KLOTEN", "regex": "TWINT\\s+...", "group": 1 },
    "fee_amount": { "matched": "1.50", "parsed": 1.5 }
  },
  "mapping": {
    "lookup": "KLOTEN",
    "result": { "account_debit": "1100", "account_credit": "3000" }
  }
}
```

---

## Teil 5: Priorisierte Roadmap

| # | Schritt | Aufwand | Wert | Status |
|---|---|---|---|---|
| **1** | **Fundament: String-Typen, Config-Layer, Tests** | **M** | **Entkoppelt neue Typen vom Code** | **← Nächster Schritt** |
| 2 | Detection komplett in YAML | M | Entfernt Keyword-Hardcoding | Offen |
| 3 | Generische Parser-Engine | M | Kern der Vision | Offen |
| 4 | Alle bestehenden Typen in Config | M | Kein typspez. Parser-Code mehr | Offen |
| 5 | Mapping-Migration (Excel → YAML) | M | Volle Config-Kontrolle | Offen |
| 6 | Config-Validierung (Zod) produktiv scharf schalten | S | Fehler früh sichtbar | Offen |
| 7 | Registry-System | S | DRY in Config | Optional nach Bedarf |
| 8 | Conditional Logic in Config | M | Weniger Typ-Duplikate | Optional nach Bedarf |
| 9 | Diagnostics-Logging | M | Debug-Fähigkeit | Offen |
| 10 | Legacy entfernen: Enum, alte Parser, Excel-Pflicht | M | Echter Zero-Code-Neueintrag | Offen |
| 11 | GUI-Config-Editor | L | Komfort für Nicht-Entwickler | Optional |

**Aufwand:** S = klein (Stunden), M = mittel (Tage), L = gross (Wochen)

---

## Teil 6: Definition of Done — Zero Hardcoding

Die Migration gilt als abgeschlossen, wenn alle Punkte erfüllt sind:

- [ ] Es gibt einen zentralen Config-Loader mit Validierung und verständlichen Fehlermeldungen
- [ ] Transaktionstypen werden intern als freie String-Keys geführt, nicht über einen festen Enum
- [ ] Alle Detection-Keywords und Schwellenwerte liegen in `transaction-rules.yaml`
- [ ] `transaction-type-detector.ts` enthält keine fachlichen Keywords mehr
- [ ] `transaction-parsers.ts` enthält nur noch generische Engine-Bausteine — keine typspezifischen Regeln
- [ ] `main-logic.ts` enthält keine typ-spezifischen Mapping-Sonderfälle mehr
- [ ] Konto- und Kostenstellen-Mappings in YAML, kein Excel mehr
- [ ] Zahlungsmittel-Matrix und Fee-Regeln sind konfigurierbar
- [ ] `TransactionType`-Enum ist vollständig entfernt
- [ ] Neuer Transaktionstyp: Einzige Änderung ist YAML (kein TypeScript)
- [ ] Regressionstests für alle bestehenden Typen bleiben nach jeder Änderung grün

---

## Teil 7: Schritt 1 im Detail

Schritt 1 ist bewusst technisch und nicht fachlich. Er schafft die Voraussetzungen, damit alle späteren YAML-Regeln überhaupt sauber greifen können.

**Enthalten in Schritt 1:**

- `TransactionType` schrittweise durch freie String-Keys ersetzen
- Neue Typdefinitionen und Interfaces für Config-Regeln einführen
- Config-Dateien laden, normalisieren und zentral verfügbar machen
- Zod-Schema für Detection-, Parser- und Mapping-Konfiguration anlegen
- Regressionstests für Detection, Parsing und Mapping auf repräsentativen Daten ergänzen

**Nicht enthalten in Schritt 1:**

- Produktive YAML-Detection für alle Typen
- Vollständige Parser-Migration
- Entfernen des Excel-Fallbacks
- Conditional Logic oder Registry-System

**Akzeptanzkriterien für Schritt 1:**

- Die Codebasis kann mit string-basierten Typen arbeiten, ohne funktionale Regression
- Config-Dateien werden beim Start geladen und validiert
- Fehlerhafte Config bricht mit verständlicher Meldung ab
- Eine Testbasis erlaubt Alt-vs-Neu-Vergleiche für die folgenden Migrationsschritte

---

## Teil 8: Grundprinzipien für die Weiterentwicklung

1. **Config first:** Bevor etwas in TypeScript implementiert wird, prüfen: Kann das die Config abdecken?
2. **Engine erweiterbar, nicht anpassbar:** Neue Extraktionsmethoden oder Transformationen kommen in die Engine. Typ-spezifische Regeln kommen nie in den Code.
3. **Keine stillen Fehler:** Fehlerhafte Config bricht mit verständlicher Meldung — nicht mit falschem Output.
4. **Parallelbetrieb:** Neue Features hinter Feature-Flags. Alten Code erst entfernen wenn neuer Weg vollständig validiert ist.
5. **Regressionsstabilität:** Kein Merge ohne identisches oder bewusst dokumentiertes Ergebnis gegenüber der Baseline.
6. **Stop-Regel:** Wenn ein Schritt die Baseline bricht und die Ursache nicht klar isolierbar ist — nicht weiter, sondern zurückbauen und separat lösen.
