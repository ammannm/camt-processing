import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/engine/run/step-runner';
import { multiply } from '../src/engine/multiply/multiplier';
import { appConfigSchema, type AppConfig, type Step } from '../src/engine/config/schema';
import { asClassKey, type ProcessedRow } from '../src/shared/types';

function cfg(opts: {
  pipeline: Record<string, { steps: Step[] }>;
  tables?: AppConfig['tables'];
  matrices?: AppConfig['matrices'];
}): AppConfig {
  const placeholderExtraction = Object.fromEntries(Object.keys(opts.pipeline).map((k) => [k, {}]));
  return appConfigSchema.parse({
    classes: [],
    extraction: placeholderExtraction,
    tables: opts.tables ?? {},
    matrices: opts.matrices ?? {},
    pipeline: opts.pipeline,
    registries: {},
    export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
  });
}

function row(classKey: string, fields: Record<string, unknown> = {}): ProcessedRow {
  return {
    classKey: asClassKey(classKey),
    fields: { ...fields },
    errors: [],
    source: { fields: {} }
  };
}

// ---------- step types ----------

describe('§5 set', () => {
  it('writes literal values into fields', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [{ set: { out_a: 'CONST', out_b: 42, out_c: true } }]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class'), c);
    expect(main!.fields).toEqual({ out_a: 'CONST', out_b: 42, out_c: true });
  });

  it('renders template strings against current fields', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            { set: { greeting: 'Hello {who}, value {existing}' } }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class', { who: 'World', existing: 7 }), c);
    expect(main!.fields.greeting).toBe('Hello World, value 7');
  });
});

describe('§5 lookup_in_table', () => {
  const c = cfg({
    pipeline: {
      alpha_class: {
        steps: [
          {
            lookup_in_table: {
              table: 'lookup_a',
              key_from_field: 'key_field',
              match: { mode: 'exact' },
              assign: { out_a: 'col_a', out_b: 'col_b' }
            }
          }
        ]
      }
    },
    tables: {
      lookup_a: {
        columns: ['col_a', 'col_b'],
        rows: { KEY_X: { col_a: 'AAA', col_b: 'BBB' } }
      }
    }
  });

  it('writes assigned columns when key matches', () => {
    const [main] = runPipeline(row('alpha_class', { key_field: 'KEY_X' }), c);
    expect(main!.fields.out_a).toBe('AAA');
    expect(main!.fields.out_b).toBe('BBB');
  });

  it('silently no-ops when key misses', () => {
    const [main] = runPipeline(row('alpha_class', { key_field: 'NOPE' }), c);
    expect(main!.fields.out_a).toBeUndefined();
    expect(main!.errors).toHaveLength(0);
  });

  it('supports key_from_static', () => {
    const c2 = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              lookup_in_table: {
                table: 'lookup_a',
                key_from_static: 'KEY_X',
                match: { mode: 'exact' },
                assign: { out_a: 'col_a' }
              }
            }
          ]
        }
      },
      tables: {
        lookup_a: {
          columns: ['col_a'],
          rows: { KEY_X: { col_a: 'static-hit' } }
        }
      }
    });
    const [main] = runPipeline(row('alpha_class'), c2);
    expect(main!.fields.out_a).toBe('static-hit');
  });
});

describe('§5 lookup_in_matrix', () => {
  const c = cfg({
    pipeline: {
      alpha_class: {
        steps: [
          {
            lookup_in_matrix: {
              matrix: 'mx',
              row_from_field: 'r',
              col_from_field: 'c',
              match: { mode: 'exact' },
              into_field: 'result_value'
            }
          }
        ]
      }
    },
    matrices: {
      mx: {
        cells: { ROW_A: { COL_X: 'v-ax', COL_Y: 'v-ay' } }
      }
    }
  });

  it('writes cell value into into_field', () => {
    const [main] = runPipeline(row('alpha_class', { r: 'ROW_A', c: 'COL_Y' }), c);
    expect(main!.fields.result_value).toBe('v-ay');
  });

  it('does not set field when matrix misses', () => {
    const [main] = runPipeline(row('alpha_class', { r: 'NOPE', c: 'COL_X' }), c);
    expect(main!.fields.result_value).toBeUndefined();
  });
});

describe('§5 when', () => {
  const buildCfg = (cond: { field: string; equals?: string | boolean }) =>
    cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              when: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                condition: cond as any,
                do: [{ set: { out_a: 'wrote' } }]
              }
            }
          ]
        }
      }
    });

  it('runs nested steps when condition is true', () => {
    const c = buildCfg({ field: 'flag', equals: true });
    const [main] = runPipeline(row('alpha_class', { flag: true }), c);
    expect(main!.fields.out_a).toBe('wrote');
  });

  it('skips nested steps when condition is false', () => {
    const c = buildCfg({ field: 'flag', equals: true });
    const [main] = runPipeline(row('alpha_class', { flag: false }), c);
    expect(main!.fields.out_a).toBeUndefined();
  });

  it('supports `present` and `absent` comparators', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { when: { condition: { field: 'x', present: true } as any, do: [{ set: { p: 'yes' } }] } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { when: { condition: { field: 'y', absent: true } as any, do: [{ set: { a: 'yes' } }] } }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class', { x: 'something' }), c);
    expect(main!.fields.p).toBe('yes');
    expect(main!.fields.a).toBe('yes');
  });

  it('supports `greater_than` and `less_than` comparators on numbers', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { when: { condition: { field: 'n', greater_than: 10 } as any, do: [{ set: { big: true } }] } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { when: { condition: { field: 'n', less_than: 100 } as any, do: [{ set: { small: true } }] } }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class', { n: 50 }), c);
    expect(main!.fields.big).toBe(true);
    expect(main!.fields.small).toBe(true);
  });
});

describe('§6 emit_row', () => {
  it('emits an additional row when condition is true', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            { set: { main_field: 'MAIN' } },
            {
              emit_row: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                condition: { field: 'fee', greater_than: 0 } as any,
                row: {
                  steps: [{ set: { extra_marker: 'EXTRA', main_field: 'OVERRIDDEN_IN_CHILD' } }]
                }
              }
            }
          ]
        }
      }
    });
    const result = runPipeline(row('alpha_class', { fee: 5 }), c);
    expect(result).toHaveLength(2);
    expect(result[0]!.fields.main_field).toBe('MAIN');
    expect(result[0]!.fields.extra_marker).toBeUndefined();
    expect(result[1]!.fields.main_field).toBe('OVERRIDDEN_IN_CHILD');
    expect(result[1]!.fields.extra_marker).toBe('EXTRA');
  });

  it('emits nothing when condition is false', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              emit_row: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                condition: { field: 'fee', greater_than: 0 } as any,
                row: { steps: [{ set: { extra: 'no' } }] }
              }
            }
          ]
        }
      }
    });
    const result = runPipeline(row('alpha_class', { fee: 0 }), c);
    expect(result).toHaveLength(1);
  });

  it('child row sees parent fields at snapshot time, not after', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            { set: { stage: 'BEFORE_EMIT' } },
            {
              emit_row: {
                row: { steps: [{ set: { captured: 'stage was {stage}' } }] }
              }
            },
            { set: { stage: 'AFTER_EMIT' } }
          ]
        }
      }
    });
    const result = runPipeline(row('alpha_class'), c);
    expect(result[0]!.fields.stage).toBe('AFTER_EMIT');
    expect(result[1]!.fields.captured).toBe('stage was BEFORE_EMIT');
  });

  it('multiplier re-export produces the same result as runPipeline', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            { set: { main: 'MAIN' } },
            { emit_row: { row: { steps: [{ set: { extra: 'YES' } }] } } }
          ]
        }
      }
    });
    const viaRun = runPipeline(row('alpha_class'), c);
    const viaMultiply = multiply(row('alpha_class'), c);
    expect(viaRun.map((r) => r.fields)).toEqual(viaMultiply.map((r) => r.fields));
  });
});

describe('§5 error_if', () => {
  it('pushes a structured error when the condition matches', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              error_if: {
                condition: { field: 'out_credit', absent: true } as never,
                message: 'Habenkonto fehlt für {location}',
                field: 'out_credit'
              }
            }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class', { location: 'PLACEX' }), c);
    expect(main!.errors).toHaveLength(1);
    expect(main!.errors[0]!.message).toBe('Habenkonto fehlt für PLACEX');
    expect(main!.errors[0]!.field).toBe('out_credit');
  });

  it('does nothing when the condition does not match', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              error_if: {
                condition: { field: 'out_credit', absent: true } as never,
                message: 'Habenkonto fehlt'
              }
            }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class', { out_credit: '1234' }), c);
    expect(main!.errors).toHaveLength(0);
  });

  it('templates can reference engine pseudo-fields like {_class}', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              error_if: {
                condition: { field: 'out_credit', absent: true } as never,
                message: 'Klasse {_class}: Konto fehlt'
              }
            }
          ]
        }
      }
    });
    const [main] = runPipeline(row('alpha_class'), c);
    expect(main!.errors[0]!.message).toBe('Klasse alpha_class: Konto fehlt');
  });
});

describe('integration: lookup + set inside when inside emit_row', () => {
  it('handles a full composition correctly', () => {
    const c = cfg({
      pipeline: {
        alpha_class: {
          steps: [
            {
              lookup_in_table: {
                table: 'accounts',
                key_from_field: 'category',
                match: { mode: 'exact' },
                assign: { out_account: 'col_account', _flag_emit: 'col_emit_fee' }
              }
            },
            {
              emit_row: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                condition: { field: '_flag_emit', equals: true } as any,
                row: {
                  steps: [
                    { set: { kind: 'fee_row' } },
                    {
                      lookup_in_table: {
                        table: 'fee_accounts',
                        key_from_static: 'FEE',
                        match: { mode: 'exact' },
                        assign: { out_account: 'col_account' }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      },
      tables: {
        accounts: {
          columns: ['col_account', 'col_emit_fee'],
          rows: {
            CAT_A: { col_account: '1000', col_emit_fee: true },
            CAT_B: { col_account: '2000', col_emit_fee: false }
          }
        },
        fee_accounts: {
          columns: ['col_account'],
          rows: { FEE: { col_account: '9999' } }
        }
      }
    });

    const withFee = runPipeline(row('alpha_class', { category: 'CAT_A' }), c);
    expect(withFee).toHaveLength(2);
    expect(withFee[0]!.fields.out_account).toBe('1000');
    expect(withFee[1]!.fields.kind).toBe('fee_row');
    expect(withFee[1]!.fields.out_account).toBe('9999');

    const noFee = runPipeline(row('alpha_class', { category: 'CAT_B' }), c);
    expect(noFee).toHaveLength(1);
    expect(noFee[0]!.fields.out_account).toBe('2000');
  });
});
