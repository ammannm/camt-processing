import { describe, it, expect } from 'vitest';
import { extractOne } from '../src/engine/extract/extractor';
import { appConfigSchema, type AppConfig } from '../src/engine/config/schema';
import { asClassKey, type ClassifiedRow } from '../src/shared/types';

function cfg(
  extraction: AppConfig['extraction'],
  registries: AppConfig['registries'] = {}
): AppConfig {
  const placeholderPipeline = Object.fromEntries(Object.keys(extraction).map((k) => [k, {}]));
  return appConfigSchema.parse({
    classes: [],
    extraction,
    tables: {},
    matrices: {},
    pipeline: placeholderPipeline,
    registries,
    export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
  });
}

function row(
  classKey: string,
  fields: Record<string, unknown>,
  score = 99
): ClassifiedRow {
  return {
    fields,
    classKey: asClassKey(classKey),
    classificationScore: score
  };
}

// ---------- sources (§2) ----------

describe('§2 sources', () => {
  it('regex with default capture_group 1 and default from_field', () => {
    const c = cfg({
      alpha_class: {
        amount: {
          extract: { regex: 'AMT:\\s*(-?\\d+(?:\\.\\d+)?)' }
        }
      }
    });
    const out = extractOne(row('alpha_class', { source_text: 'AMT: 12.5 ignored' }), c);
    expect(out.fields.amount).toBe('12.5');
  });

  it('regex with explicit from_field', () => {
    const c = cfg({
      alpha_class: {
        amount: {
          extract: { regex: '(\\d+)', from_field: 'other_text' }
        }
      }
    });
    const out = extractOne(row('alpha_class', { other_text: 'value 42 here' }), c);
    expect(out.fields.amount).toBe('42');
  });

  it('static yields a constant value', () => {
    const c = cfg({
      alpha_class: { kind: { extract: { static: 'CONST_VALUE' } } }
    });
    const out = extractOne(row('alpha_class', {}), c);
    expect(out.fields.kind).toBe('CONST_VALUE');
  });

  it('template substitutes earlier extracted fields and raw fields', () => {
    const c = cfg({
      alpha_class: {
        prefix_value: { extract: { static: 'P' } },
        composed: { extract: { template: '{prefix_value}-{raw_id}' } }
      }
    });
    const out = extractOne(row('alpha_class', { raw_id: 'X42' }), c);
    expect(out.fields.composed).toBe('P-X42');
  });

  it('token positions (first/last/last_n) on whitespace tokens', () => {
    const c = cfg({
      alpha_class: {
        f_first: { extract: { token: { position: 'first' } } },
        f_last: { extract: { token: { position: 'last' } } },
        f_last_n: { extract: { token: { position: 'last_n', count: 2 } } }
      }
    });
    const out = extractOne(row('alpha_class', { source_text: 'one two three four five' }), c);
    expect(out.fields.f_first).toBe('one');
    expect(out.fields.f_last).toBe('five');
    expect(out.fields.f_last_n).toBe('four five');
  });

  it('token positions (first_part_last_word / after_delimiter) split on a custom delimiter', () => {
    const c = cfg({
      alpha_class: {
        f_fpl: { extract: { token: { position: 'first_part_last_word', delimiter: '/' } } },
        f_after: { extract: { token: { position: 'after_delimiter', delimiter: '/' } } }
      }
    });
    const out = extractOne(row('alpha_class', { source_text: 'one two FOO/bar baz' }), c);
    expect(out.fields.f_fpl).toBe('FOO');
    expect(out.fields.f_after).toBe('bar baz');
  });

  it('conditional source picks then/else by field equality', () => {
    const c = cfg({
      alpha_class: {
        direction_text: {
          extract: {
            conditional: {
              from_field: 'direction',
              when_value: 'in',
              then: 'incoming-text',
              else: 'outgoing-text'
            }
          }
        }
      }
    });
    const inbound = extractOne(row('alpha_class', { direction: 'in' }), c);
    const outbound = extractOne(row('alpha_class', { direction: 'out' }), c);
    expect(inbound.fields.direction_text).toBe('incoming-text');
    expect(outbound.fields.direction_text).toBe('outgoing-text');
  });

  it('full_text returns the entire configured field', () => {
    const c = cfg({
      alpha_class: { whole: { extract: { full_text: {} } } }
    });
    const out = extractOne(row('alpha_class', { source_text: 'all of this' }), c);
    expect(out.fields.whole).toBe('all of this');
  });
});

// ---------- transforms (§3) ----------

describe('§3 transforms', () => {
  it('to_decimal + absolute_value', () => {
    const c = cfg({
      alpha_class: {
        n: {
          extract: { regex: '(-?\\d+(?:\\.\\d+)?)' },
          transform: [{ to_decimal: {} }, { absolute_value: true }]
        }
      }
    });
    const out = extractOne(row('alpha_class', { source_text: 'value -7.25 here' }), c);
    expect(out.fields.n).toBe(7.25);
  });

  it('max_length truncates without fallback', () => {
    const c = cfg({
      alpha_class: {
        s: {
          extract: { static: 'ABCDEFGHIJ' },
          transform: [{ max_length: { limit: 4 } }]
        }
      }
    });
    const out = extractOne(row('alpha_class', {}), c);
    expect(out.fields.s).toBe('ABCD');
  });

  it('max_length renders fallback_template and moves a chosen field into the overflow target', () => {
    const c = cfg({
      alpha_class: {
        date_str: { extract: { static: '2026-05-21' } },
        place: { extract: { static: 'PLACENAME' } },
        // Composed value too long → fallback uses just {place}; the dropped
        // field (date_str) is preserved in `overflow_text`.
        composed: {
          extract: { template: 'BookingOn {date_str} at {place} with long suffix XXX' },
          transform: [
            {
              max_length: {
                limit: 12,
                fallback_template: '{place}',
                move_field_to_overflow: { from_field: 'date_str', to_field: 'overflow_text' }
              }
            }
          ]
        }
      }
    });
    const out = extractOne(row('alpha_class', {}), c);
    expect(String(out.fields.composed).length).toBeLessThanOrEqual(12);
    expect(String(out.fields.composed)).toContain('PLACENAME');
    expect(out.fields.overflow_text).toBe('2026-05-21');
  });

  it('take_last_n_chars', () => {
    const c = cfg({
      alpha_class: {
        last4: {
          extract: { static: 'CH9100000123456789' },
          transform: [{ take_last_n_chars: 4 }]
        }
      }
    });
    expect(extractOne(row('alpha_class', {}), c).fields.last4).toBe('6789');
  });

  it('remove_pattern (regex) and replace_literal', () => {
    const c = cfg({
      alpha_class: {
        cleaned: {
          extract: { static: 'NAME (CH) OLD-STUFF' },
          transform: [
            { remove_pattern: '\\(CH\\)' },
            { replace_literal: { from: 'OLD', to: 'NEW' } }
          ]
        }
      }
    });
    expect(extractOne(row('alpha_class', {}), c).fields.cleaned).toBe('NAME  NEW-STUFF');
  });

  it('prefix + suffix', () => {
    const c = cfg({
      alpha_class: {
        wrapped: {
          extract: { static: 'core' },
          transform: [{ prefix: '<<' }, { suffix: '>>' }]
        }
      }
    });
    expect(extractOne(row('alpha_class', {}), c).fields.wrapped).toBe('<<core>>');
  });

  it('conditional_prefix uses a field for the prefix decision', () => {
    const c = cfg({
      alpha_class: {
        labelled: {
          extract: { static: 'value' },
          transform: [
            {
              conditional_prefix: {
                from_field: 'direction',
                when_value: 'in',
                then: 'IN-',
                else: 'OUT-'
              }
            }
          ]
        }
      }
    });
    expect(extractOne(row('alpha_class', { direction: 'in' }), c).fields.labelled).toBe('IN-value');
    expect(extractOne(row('alpha_class', { direction: 'out' }), c).fields.labelled).toBe('OUT-value');
  });

  it('strip_known_prefixes via registry, applied repeatedly', () => {
    const c = cfg(
      {
        alpha_class: {
          stripped: {
            extract: { static: 'PREFIX_A PREFIX_B real value' },
            transform: [{ strip_known_prefixes: { registry: 'noise' } }]
          }
        }
      },
      { noise: ['PREFIX_A', 'PREFIX_B'] }
    );
    expect(extractOne(row('alpha_class', {}), c).fields.stripped).toBe('real value');
  });
});

// ---------- orchestrator behaviour ----------

describe('§7 required + diagnostics', () => {
  it('records error when required field has no value', () => {
    const c = cfg({
      alpha_class: {
        missing: {
          extract: { regex: 'NEVER_MATCHES' },
          required: true,
          include_source_on_error: true
        }
      }
    });
    const out = extractOne(row('alpha_class', { source_text: 'no match here' }), c);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]!.field).toBe('missing');
    expect(out.errors[0]!.source).toBe('no match here');
  });

  it('does not record error when field is optional', () => {
    const c = cfg({
      alpha_class: {
        optional: { extract: { regex: 'NEVER_MATCHES' } }
      }
    });
    expect(extractOne(row('alpha_class', { source_text: '' }), c).errors).toHaveLength(0);
  });

  it('records error when a transform throws (e.g. to_decimal on non-numeric)', () => {
    const c = cfg({
      alpha_class: {
        n: {
          extract: { static: 'not a number' },
          transform: [{ to_decimal: {} }]
        }
      }
    });
    const out = extractOne(row('alpha_class', {}), c);
    expect(out.errors[0]!.field).toBe('n');
    expect(out.errors[0]!.message).toContain('to_decimal');
  });

  it('class with no extraction rules yields empty fields, no errors', () => {
    const c = cfg({ alpha_class: {} });
    const out = extractOne(row('alpha_class', { source_text: 'x' }), c);
    expect(out.fields).toEqual({});
    expect(out.errors).toEqual([]);
  });
});

describe('field ordering', () => {
  it('later fields can reference earlier ones via template', () => {
    const c = cfg({
      alpha_class: {
        first_field: { extract: { static: 'AAA' } },
        second_field: { extract: { template: '{first_field}-BBB' } },
        third_field: { extract: { template: '{second_field}-{first_field}' } }
      }
    });
    const out = extractOne(row('alpha_class', {}), c);
    expect(out.fields.first_field).toBe('AAA');
    expect(out.fields.second_field).toBe('AAA-BBB');
    expect(out.fields.third_field).toBe('AAA-BBB-AAA');
  });
});
