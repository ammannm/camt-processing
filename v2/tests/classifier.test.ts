import { describe, it, expect } from 'vitest';
import { classifyAll } from '../src/engine/classify/classifier';
import { appConfigSchema, type AppConfig } from '../src/engine/config/schema';
import type { RawRow } from '../src/shared/types';

/**
 * Domain-free fixtures: class IDs are alpha_class/beta_class/gamma_class.
 * Field names are source_text/direction/flag. If the engine ever needs to
 * know what alpha_class "is", the abstraction has leaked.
 */
function cfg(rules: AppConfig['classes']): AppConfig {
  // We give matching extraction/pipeline entries so cross-ref validation
  // (when invoked via loader) would be satisfied. The classifier itself
  // doesn't consult those, but it keeps the fixtures honest.
  const placeholderExtraction = Object.fromEntries(rules.map((r) => [r.class, {}]));
  const placeholderPipeline = Object.fromEntries(rules.map((r) => [r.class, {}]));
  return appConfigSchema.parse({
    classes: rules,
    extraction: placeholderExtraction,
    tables: {},
    matrices: {},
    pipeline: placeholderPipeline,
    registries: {},
    export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
  });
}

function row(fields: Record<string, unknown>): RawRow {
  return { fields };
}

describe('§1 classifyAll', () => {
  it('classifies when a single rule passes its threshold', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA KEYWORD',
        min_similarity: 90,
        class: 'alpha_class'
      }
    ]);
    const out = classifyAll([row({ source_text: 'prefix ALPHA KEYWORD suffix' })], c);
    expect(out.classified).toHaveLength(1);
    expect(out.classified[0]!.classKey).toBe('alpha_class');
    expect(out.classified[0]!.classificationScore).toBeGreaterThanOrEqual(90);
    expect(out.unclassified).toHaveLength(0);
  });

  it('reports unclassified when no rule meets its threshold', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA KEYWORD',
        min_similarity: 95,
        class: 'alpha_class'
      }
    ]);
    const out = classifyAll([row({ source_text: 'totally unrelated' })], c);
    expect(out.classified).toHaveLength(0);
    expect(out.unclassified).toHaveLength(1);
    expect(out.unclassified[0]!.allScores[0]!.class).toBe('alpha_class');
  });

  it('picks the highest-scoring rule when several pass', () => {
    // alpha keyword only partially overlaps the haystack → lower score;
    // beta keyword is a substring → score 100. Beta should win.
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ZZZ_ALPHA_PARTIAL_KEY',
        min_similarity: 50,
        class: 'alpha_class'
      },
      {
        id: 'r_beta',
        match_against: 'source_text',
        keyword: 'BETA_STRONG_MATCH',
        min_similarity: 50,
        class: 'beta_class'
      }
    ]);
    const out = classifyAll(
      [row({ source_text: 'leading text BETA_STRONG_MATCH trailing text and ZZZ_ALPHA' })],
      c
    );
    expect(out.classified[0]!.classKey).toBe('beta_class');
  });

  it('priority breaks exact score ties (higher priority wins)', () => {
    const c = cfg([
      {
        id: 'low',
        match_against: 'source_text',
        keyword: 'TIE',
        min_similarity: 50,
        class: 'low_class',
        priority: 1
      },
      {
        id: 'high',
        match_against: 'source_text',
        keyword: 'TIE',
        min_similarity: 50,
        class: 'high_class',
        priority: 5
      }
    ]);
    const out = classifyAll([row({ source_text: 'TIE' })], c);
    expect(out.classified[0]!.classKey).toBe('high_class');
  });

  it('falls back to YAML order when scores AND priorities tie', () => {
    const c = cfg([
      {
        id: 'first',
        match_against: 'source_text',
        keyword: 'SAME',
        min_similarity: 50,
        class: 'first_class'
      },
      {
        id: 'second',
        match_against: 'source_text',
        keyword: 'SAME',
        min_similarity: 50,
        class: 'second_class'
      }
    ]);
    const out = classifyAll([row({ source_text: 'SAME' })], c);
    expect(out.classified[0]!.classKey).toBe('first_class');
  });

  it('filter blocks a rule that would otherwise win', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA',
        min_similarity: 50,
        class: 'alpha_class',
        filter: { field: 'direction', equals: 'inbound' }
      }
    ]);
    const out = classifyAll([row({ source_text: 'ALPHA', direction: 'outbound' })], c);
    expect(out.classified).toHaveLength(0);
    expect(out.unclassified).toHaveLength(1);
  });

  it('filter passes when field equals expected value', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA',
        min_similarity: 50,
        class: 'alpha_class',
        filter: { field: 'direction', equals: 'inbound' }
      }
    ]);
    const out = classifyAll([row({ source_text: 'ALPHA', direction: 'inbound' })], c);
    expect(out.classified[0]!.classKey).toBe('alpha_class');
  });

  it('filter supports boolean equality', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA',
        min_similarity: 50,
        class: 'alpha_class',
        filter: { field: 'is_reversal', equals: true }
      }
    ]);
    const matched = classifyAll([row({ source_text: 'ALPHA', is_reversal: true })], c);
    const blocked = classifyAll([row({ source_text: 'ALPHA', is_reversal: false })], c);
    expect(matched.classified).toHaveLength(1);
    expect(blocked.classified).toHaveLength(0);
  });

  it('empty match_against field never classifies', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA',
        min_similarity: 50,
        class: 'alpha_class'
      }
    ]);
    const out = classifyAll([row({ source_text: '' })], c);
    expect(out.classified).toHaveLength(0);
    expect(out.unclassified[0]!.allScores[0]!.score).toBe(0);
  });

  it('records every rule\'s score in unclassified.allScores', () => {
    const c = cfg([
      {
        id: 'r_alpha',
        match_against: 'source_text',
        keyword: 'ALPHA',
        min_similarity: 99,
        class: 'alpha_class'
      },
      {
        id: 'r_beta',
        match_against: 'source_text',
        keyword: 'BETA',
        min_similarity: 99,
        class: 'beta_class'
      }
    ]);
    const out = classifyAll([row({ source_text: 'partial alpha mention' })], c);
    expect(out.unclassified).toHaveLength(1);
    const scores = out.unclassified[0]!.allScores;
    expect(scores.map((s) => s.class)).toEqual(['alpha_class', 'beta_class']);
  });
});
