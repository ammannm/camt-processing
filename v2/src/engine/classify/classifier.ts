/**
 * §1 Klassifikation
 *
 * Pro Eingangszeile wird jede Klassifikationsregel ausgewertet:
 *   1. Optionaler Vorfilter (Feldwert-Vergleich). Trifft der Filter nicht,
 *      wird die Regel übersprungen — kein Score, keine Auswirkung.
 *   2. Fuzzy-Score (partial_ratio, ohne Preprocessing) zwischen `keyword`
 *      und dem Wert des in `match_against` benannten Feldes der Zeile.
 *   3. Eine Regel zählt nur, wenn ihr Score >= `min_similarity` ist.
 *
 * Auswahl: höchster Score gewinnt. Bei exaktem Score-Gleichstand entscheidet
 * `priority` (höher gewinnt); bleibt es gleich, gewinnt die zuerst definierte
 * Regel (stabil zur YAML-Reihenfolge).
 *
 * Wenn keine Regel ihren Schwellwert erreicht, landet die Zeile in
 * `unclassified` mit allen berechneten Scores als Diagnose.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §1
 */

import { partial_ratio } from 'fuzzball';
import type { AppConfig, ClassRule } from '../config/schema';
import type { ClassifiedRow, RawRow } from '../../shared/types';
import { asClassKey } from '../../shared/types';

export interface ClassifyOutcome {
  classified: ClassifiedRow[];
  unclassified: { row: RawRow; allScores: { class: string; score: number }[] }[];
}

export interface ClassifyOptions {
  /** §7. Attach RowDiagnostics with the full score breakdown to each classified row. */
  trace?: boolean;
}

export function classifyAll(
  rows: RawRow[],
  config: AppConfig,
  opts: ClassifyOptions = {}
): ClassifyOutcome {
  const classified: ClassifiedRow[] = [];
  const unclassified: ClassifyOutcome['unclassified'] = [];

  const rules = config.classes;

  for (const row of rows) {
    const scores = scoreRow(row, rules);
    const winner = pickWinner(scores, rules);
    if (winner) {
      const cr: ClassifiedRow = {
        ...row,
        classKey: asClassKey(winner.rule.class),
        classificationScore: winner.score
      };
      if (opts.trace) {
        cr.diagnostics = {
          classification: {
            winner: winner.rule.class,
            allScores: scores.map((s) => ({ class: s.rule.class, score: s.score }))
          },
          extraction: {},
          pipeline: []
        };
      }
      classified.push(cr);
    } else {
      unclassified.push({
        row,
        allScores: scores.map((s) => ({ class: s.rule.class, score: s.score }))
      });
    }
  }

  return { classified, unclassified };
}

// ---------- internals ----------

interface RuleScore {
  rule: ClassRule;
  ruleIndex: number;
  score: number;
  /** false = filter rejected the rule; the score isn't considered. */
  filterPassed: boolean;
}

function scoreRow(row: RawRow, rules: ClassRule[]): RuleScore[] {
  return rules.map((rule, ruleIndex) => {
    const filterPassed = passesFilter(row, rule);
    const haystack = filterPassed ? readField(row, rule.match_against) : '';
    const score = filterPassed && haystack
      ? partial_ratio(rule.keyword, haystack, { full_process: false, force_ascii: false })
      : 0;
    return { rule, ruleIndex, score, filterPassed };
  });
}

function pickWinner(
  scored: RuleScore[],
  _rules: ClassRule[]
): { rule: ClassRule; score: number } | undefined {
  const passing = scored.filter((s) => s.filterPassed && s.score >= s.rule.min_similarity);
  if (passing.length === 0) return undefined;

  passing.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = a.rule.priority ?? 0;
    const pb = b.rule.priority ?? 0;
    if (pb !== pa) return pb - pa;
    return a.ruleIndex - b.ruleIndex; // stable: first-defined wins
  });

  const top = passing[0]!;
  return { rule: top.rule, score: top.score };
}

function passesFilter(row: RawRow, rule: ClassRule): boolean {
  if (!rule.filter) return true;
  const actual = row.fields[rule.filter.field];
  // Strict equality after string coercion for non-boolean values keeps the
  // semantics simple: YAML can express string/number/boolean filter values.
  if (typeof rule.filter.equals === 'boolean') {
    return actual === rule.filter.equals;
  }
  return String(actual) === String(rule.filter.equals);
}

function readField(row: RawRow, fieldName: string): string {
  const v = row.fields[fieldName];
  return v === undefined || v === null ? '' : String(v);
}
