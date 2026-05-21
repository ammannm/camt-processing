# Generische Engine-Fähigkeiten — Ist-Analyse, feature-orientiert

**Status:** Diese Datei ist die **Spezifikation für V2**. Sie ist die verbindliche Vorlage sowohl für die YAML-Konfigurationssprache als auch für die Modulgrenzen im Code. Jeder neue Engine-Baustein muss zu einem der hier beschriebenen Abschnitte gehören, oder die Spezifikation muss erweitert werden — nicht der Code „darüber hinaus".

V2 liegt im Unterverzeichnis `v2/` des Repos.

**Zweck:** Festhalten, welche generischen Operationen die Engine anbieten muss, damit alle heute existierenden Verarbeitungsregeln rein konfigurativ ausgedrückt werden können. Diese Liste ist domänenfrei — keine Annahmen über „Orte", „Konten", „Zahlungsmittel" oder andere Fachbegriffe. Es geht ausschliesslich um Operationen auf Text, Werten und Tabellen.

---

## 1. Klassifikation einer Eingabe

Eingangs wird jede Rohzeile einer **Klasse** zugewiesen. Eine Klasse ist nichts weiter als ein frei wählbarer Bezeichner; die Engine verwendet ihn später nur als Index, um die passenden Regelgruppen nachzuschlagen.

Die Engine muss anbieten:
- **Fuzzy-Vergleich** eines Referenzstrings gegen ein Feld der Eingabe.
- **Schwellwert pro Regel**: ein Treffer zählt nur, wenn der Score über dem Schwellwert liegt.
- **Höchster Score gewinnt**, falls mehrere Regeln über ihrem Schwellwert liegen.
- **Priorität als Tiebreaker** bei exaktem Score-Gleichstand.
- **Optionaler Vorfilter**: eine Regel greift nur, wenn ein anderes Feld der Eingabe einen erwarteten Wert hat (Beispiel-Form: „nur wenn Kennzeichen = A").
- **Diagnose-Output**: alle Scores einer Eingabe können protokolliert werden — auch die der nicht-gewählten Regeln. Wichtig für Debugging.
- **Nicht-klassifizierbar als Ergebnis**: keine Regel matcht → die Eingabe wird mit einer Fehlerkennzeichnung weitergereicht, nicht stillschweigend verworfen.

---

## 2. Feldextraktion aus Text

Pro Klasse extrahiert die Engine **eine beliebige Anzahl frei benannter Felder** aus dem Rohtext. Ein Feld kann auf eine der folgenden Arten gewonnen werden:

- **Regulärer Ausdruck** mit Capture-Gruppen; das Feld ist eine bestimmte Capture-Gruppe.
- **Konstanter Wert** — keine Extraktion, einfach Zuweisung eines festen Strings.
- **Template** — Zusammenbau eines neuen Strings aus bereits extrahierten Feldern (mit Platzhaltern).
- **Positionsbasierte Token-Auswahl**:
  - erstes Token,
  - letztes Token,
  - letzte N Token,
  - Token vor/nach einem definierten Trennzeichen.
- **Bedingter Wert nach binärem Flag** — z.B. anderer Wert bei „eingehend" als bei „ausgehend".
- **Vollständiger Rohtext** als Wert.

Anforderungen, die zu jeder Extraktion gehören:
- Reihenfolge der Felder ist relevant: ein späteres Feld darf auf ein früheres Feld zugreifen (Template-Substitution).
- **Capture-Gruppen-Auswahl** ist konfigurierbar (welche Gruppe ist der Wert).
- **Trennzeichen** für token- oder split-basierte Operationen ist pro Regel einstellbar (Default: Leerzeichen).

---

## 3. Werttransformation

Nach Extraktion durchläuft jeder Feldwert beliebig viele Transformationen. Die Engine muss anbieten:

**Numerisch:**
- Typkonvertierung String → Zahl (Komma oder Punkt als Dezimaltrennzeichen).
- Absolutwert (Vorzeichen entfernen).

**String:**
- Auf maximale Länge kürzen.
- Nur letzte N Zeichen behalten.
- Pattern entfernen (regulärer Ausdruck als „weg damit").
- Literal-Ersetzung („alt" → „neu").
- Konstanten Prefix oder Suffix anhängen.
- Konditionalen Prefix anhängen — Prefix-Wert hängt von einem binären Flag der Quelle ab.
- **Prefix-Liste abziehen**: gegeben eine Liste „belangloser Wortanfänge" — falls der Wert mit einem solchen Anfang beginnt, diesen entfernen.

**Längenkontrolle mit Alternativwert:**
- Wenn der berechnete Wert eine bestimmte Länge überschreitet, einen alternativen Wert (anderes Template) verwenden.
- Im Alternativfall darf ein Teil-Wert in ein **anderes Feld** verschoben werden (typischer Fall: lange Variante wird abgekürzt; das weggekürzte Stück landet als Zusatzinformation in einem Diagnose-/Notiz-Feld).

---

## 4. Tabellen-Lookup

Die Engine muss Daten aus extern definierten Tabellen nachschlagen können. Die Engine hat **keine Vorstellung davon, was eine bestimmte Tabelle bedeutet** — Tabellen werden in der Konfiguration deklariert, mit frei wählbarem Namen, frei wählbaren Spalten und beliebigem Inhalt.

Es gibt exakt zwei Lookup-Formen:

### 4.1 Einschlüssel-Tabelle
Schlüssel → Datensatz mit beliebigen Spalten.

Eigenschaften:
- Der Schlüssel kann entweder aus einem bereits extrahierten Feld kommen oder ein konstanter Wert sein.
- Match-Modi: **exakt**, **exakt nach Normalisierung** (Whitespace, Gross-/Kleinschreibung, Umlaut-Ersatz), **fuzzy mit Schwelle**.
- Ergebnis: ausgewählte Spalten landen in frei benannten Ausgabefeldern. Eine Spalte kann auch ein boolean-artiges Flag liefern, das im weiteren Verlauf für konditionale Schritte verwendet wird.

### 4.2 Zweischlüssel-Matrix
Zeilenschlüssel × Spaltenschlüssel → ein Wert.

Eigenschaften:
- Beide Schlüssel kommen entweder aus Feldern oder sind konstant.
- Match pro Achse einstellbar (exakt / normalisiert / fuzzy).
- Ergebnis ist ein einzelner Wert, der in ein frei benanntes Ausgabefeld geschrieben wird (typischerweise überschreibt er einen aus einem früheren Schritt gesetzten Wert).

### Übergreifend
- Die **Schwelle** für Fuzzy-Match ist pro Lookup einstellbar.
- Wenn kein Treffer: das Ausgabefeld wird nicht gesetzt; optional kann das als Fehler markiert werden.
- Tabellen sind **als Daten konfigurierbar**, nicht als Code. Beliebig viele Tabellen pro Konfiguration. Eine Tabelle ist nur ein Name, eine Liste von Spalten und ein Mapping `Schlüssel → Datensatz`.

---

## 5. Konditionaler Kontrollfluss

Verarbeitungsregeln pro Klasse sind eine **geordnete Schrittliste**. Ein Schritt kann sein:

- ein Lookup (siehe 4),
- ein „Wert setzen" (statischer oder templatebasierter Ausdruck schreibt in ein Ausgabefeld),
- ein konditionaler Block: „nur ausführen wenn Feld X = Wert / leer / nicht-leer / numerisch > N / Regex matcht".

Anforderungen:
- Spätere Schritte können Werte aus früheren Schritten überschreiben — Reihenfolge ist explizit.
- Konditionen referenzieren Felder über ihren Namen.
- Templates innerhalb von „Wert setzen" können auf alle bisher gesetzten Felder zugreifen.

---

## 6. Mehrfach-Ausgabe (eine Eingabe → mehrere Ergebniszeilen)

Eine einzelne Eingangszeile kann mehr als eine Ausgangszeile erzeugen. Die Engine muss anbieten:

- Eine konfigurierbare Regel „Erzeuge eine zusätzliche Ergebniszeile, wenn [Bedingung auf einem Feld]".
- Pro zusätzlicher Zeile eine eigene Feldzuordnung (kann auf die Felder der Hauptzeile zugreifen).
- Die zusätzliche Zeile darf eigene Lookups durchlaufen (z.B. andere Tabelle als die Hauptzeile).
- Beliebig viele solche Regeln pro Klasse.

---

## 7. Validierung und Diagnose

**Fehler-Anhang an Zeilen** — drei Quellen, alle identisch in der Wirkung:
- **`required` in der Extraktion (§2):** Ein Feld kann als Pflichtfeld einer einzelnen Klasse markiert werden. Erfolgt keine Extraktion, hängt die Engine eine Fehlermeldung an die Zeile.
- **`error_if` als Pipeline-Schritt (§5):** Klassen-spezifischer Schritt mit Condition + Message-Template. Pushed eine Meldung, wenn die Bedingung erfüllt ist. Wird typischerweise für Diagnose mit Kontextfeldern eingesetzt (z.B. „TWINT-Ort konnte nicht extrahiert werden").
- **Validierungsregeln (eigene Konfigurationsebene):** Klassenagnostische Regeln, die nach der Pipeline gegen jede Zeile geprüft werden. Beantworten die Frage „ist dieser Datensatz vollständig genug, um exportiert/importiert zu werden?" — typischerweise Mussfelder am Output (z.B. „jede Buchungszeile braucht Soll- und Habenkonto").

**Eigenschaften:**
- Alle drei Quellen landen in derselben Liste `row.errors[]`. Konsumenten (UI, Export) sehen eine einheitliche Sicht.
- Fehlermeldungen sind **mehrfach pro Zeile** möglich.
- Optional: bei Fehler den ursprünglichen Rohtext mit-protokollieren (Diagnose-Hilfe).
- **Strikte Entkopplung von Export:** Fehler beeinflussen das Routing der Zeile beim Export *nicht*. Der Export schreibt — sofern keine eigenen Filter gesetzt sind — alle Zeilen mit ihren Fehlermeldungen in einer Spalte. Damit kann ein Bediener im UI Korrekturen vornehmen, bevor exportiert wird.

**Validierungs-Konfiguration:**
- Liste von Regeln, jede mit Condition + Message-Template.
- Pro Regel optional einschränkbar auf bestimmte Klassen (`applies_to`), oder ausschliessbar für bestimmte Klassen (`exclude_classes`).
- Templates dürfen Feldwerte (`{out_credit}`) und Pseudo-Felder (`{_class}`) referenzieren.

**Diagnose-Modus:** bei Bedarf protokolliert die Engine pro Eingangszeile, welche Klassifikations-Scores berechnet wurden, welcher Schritt welches Feld gesetzt hat und welche Tabellen-Treffer mit welchem Score gewonnen haben. Dieses Protokoll ist getrennt vom Ergebnis-Output (z.B. Logfile/JSON).

---

## 8. Wiederverwendbare Listen (Registries)

Es gibt Werte, die in mehreren Regeln vorkommen — etwa eine Sammlung von „belanglosen Wortanfängen", die in jeder Klasse vor dem Tabellen-Lookup entfernt werden soll, oder eine Liste von erlaubten Codes.

Die Engine muss anbieten:
- **Benannte Listen** in der Konfiguration zentral definieren.
- In Regeln per Namen referenzieren (statt die Liste inline zu wiederholen).
- Listen sind reine Strings; die Semantik entscheidet die Regel, die sie verwendet.

---

## 9. Ausgabe-Mapping

Die Engine erzeugt am Ende eine Liste von Ergebniszeilen, jede mit einem **frei benannten Satz von Feldern**. Das endgültige Ausgabeformat (Excel, CSV, JSON, etc.) ist eine **eigene Konfigurationsebene**, die nichts über die Verarbeitung weiss:

- Welche Felder erscheinen in welcher Spalte, in welcher Reihenfolge.
- Welcher Spaltentitel (Header) wird vergeben.
- Welche Felder werden, wenn vorhanden, kombiniert oder umformatiert (z.B. Datumsformat).
- Pflicht- vs. Optionalspalten.

Die Engine selbst legt **kein** Ausgabeschema fest — sie liefert nur ein generisches `Liste<Datensatz>`.

**Mehrere benannte Outputs** sind erlaubt — z.B. zwei Excel-Layouts und ein JSON-Dump in einem Lauf. Jeder Output ist eigenständig (eigenes Format, eigenes Spaltenmapping). Eine optionale Filterbedingung pro Output erlaubt es, gezielt Teilmengen zu schreiben (z.B. „nur Zeilen über Betrag X" für ein Analytics-File) — **nicht** für Validitäts-Routing. Validität ist Sache der §7-Schicht und beeinflusst den Export ausschliesslich über eine Spalte mit Fehlermeldungen.

---

## 10. Zusammenfassung: das gesamte Vokabular der Engine

Was die Engine kennen darf:
- Texte, Felder, Werte, Tabellen, Matrizen, Listen, Regeln, Schritte, Bedingungen, Schwellwerte, Scores.

Was die Engine **nie** kennen darf:
- Konkrete Feldnamen einer Domäne („Ort", „Konto", „Kostenstelle", „Zahlungsmittel" etc.).
- Konkrete Klassen-Bezeichner („TWINT", „Miete" etc.).
- Konkrete Tabellennamen oder -strukturen.
- Domänenspezifische Output-Schemata.

Alles, was zur Fachdomäne gehört, lebt **ausschliesslich** in den Konfigurationsdateien.
