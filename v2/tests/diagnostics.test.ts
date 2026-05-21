import { describe, it, expect } from 'vitest';
import { processRows } from '../src/engine/pipeline';
import { appConfigSchema, type AppConfig } from '../src/engine/config/schema';
import type { RawRow } from '../src/shared/types';

const baseCfg: AppConfig = appConfigSchema.parse({
  classes: [
    {
      id: 'r_alpha',
      match_against: 'source_text',
      keyword: 'ALPHA',
      min_similarity: 80,
      class: 'alpha_class'
    },
    {
      id: 'r_beta',
      match_against: 'source_text',
      keyword: 'BETA',
      min_similarity: 80,
      class: 'beta_class'
    }
  ],
  extraction: {
    alpha_class: {
      kind: { extract: { static: 'A' } },
      first_token: { extract: { token: { position: 'first' } } }
    },
    beta_class: {
      kind: { extract: { static: 'B' } }
    }
  },
  tables: {
    things: {
      columns: ['out_a'],
      rows: { ALPHA_KEY: { out_a: 'ALPHA_RESULT' } }
    }
  },
  matrices: {},
  pipeline: {
    alpha_class: {
      steps: [
        {
          lookup_in_table: {
            table: 'things',
            key_from_static: 'ALPHA_KEY',
            match: { mode: 'exact' },
            assign: { resolved: 'out_a' }
          }
        },
        { set: { extra: 'present' } },
        {
          when: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            condition: { field: 'kind', equals: 'A' } as any,
            do: [{ set: { gated: 'yes' } }]
          }
        },
        {
          when: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            condition: { field: 'kind', equals: 'Z' } as any,
            do: [{ set: { never: 'no' } }]
          }
        },
        {
          emit_row: {
            row: { steps: [{ set: { kind: 'child', extra: 'child-extra' } }] }
          }
        }
      ]
    },
    beta_class: { steps: [] }
  },
  registries: {},
  export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
});

function row(text: string): RawRow {
  return { fields: { source_text: text } };
}

describe('§7 structured diagnostics', () => {
  it('is undefined by default (no trace overhead)', () => {
    const out = processRows([row('this contains ALPHA keyword')], baseCfg);
    expect(out.rows[0]!.diagnostics).toBeUndefined();
  });

  it('records classification scores when collectDiagnostics is true', () => {
    const out = processRows([row('this contains ALPHA keyword')], baseCfg, {
      collectDiagnostics: true
    });
    const d = out.rows[0]!.diagnostics!;
    expect(d.classification.winner).toBe('alpha_class');
    expect(d.classification.allScores.map((s) => s.class)).toEqual([
      'alpha_class',
      'beta_class'
    ]);
  });

  it('records per-field extraction traces with their source kind', () => {
    const out = processRows([row('this contains ALPHA keyword')], baseCfg, {
      collectDiagnostics: true
    });
    const ex = out.rows[0]!.diagnostics!.extraction;
    expect(ex.kind).toEqual({ matched: 'A', via: 'static' });
    expect(ex.first_token).toEqual({ matched: 'this', via: 'token:first' });
  });

  it('records pipeline step traces: applied / skipped / missed', () => {
    const out = processRows([row('this contains ALPHA keyword')], baseCfg, {
      collectDiagnostics: true
    });
    const main = out.rows[0]!;
    const trace = main.diagnostics!.pipeline;

    // Nested steps inside a matched `when.do` are traced inline alongside
    // the outer step — so the chronological trace is:
    //   0 outer lookup_in_table  applied
    //   1 outer set              applied   (extra=present)
    //   2 outer when             applied   (kind=A passes)
    //   3 nested set             applied   (gated=yes)
    //   4 outer when             skipped   (kind=Z does not pass)
    //   5 outer emit_row         applied
    expect(trace.map((t) => `${t.step}:${t.result}`)).toEqual([
      'lookup_in_table:things:applied',
      'set:applied',
      'when:applied',
      'set:applied',
      'when:skipped',
      'emit_row:applied'
    ]);
  });

  it('records `missed` when a table lookup has no key match', () => {
    const cfgMiss = appConfigSchema.parse({
      ...baseCfg,
      pipeline: {
        ...baseCfg.pipeline,
        alpha_class: {
          steps: [
            {
              lookup_in_table: {
                table: 'things',
                key_from_static: 'NOT_IN_TABLE',
                match: { mode: 'exact' },
                assign: { resolved: 'out_a' }
              }
            }
          ]
        }
      }
    });
    const out = processRows([row('this contains ALPHA keyword')], cfgMiss, {
      collectDiagnostics: true
    });
    const trace = out.rows[0]!.diagnostics!.pipeline;
    expect(trace[0]).toMatchObject({
      step: 'lookup_in_table:things',
      result: 'missed'
    });
  });

  it('emitted rows carry their own diagnostics with their own pipeline trace', () => {
    const out = processRows([row('this contains ALPHA keyword')], baseCfg, {
      collectDiagnostics: true
    });
    expect(out.rows).toHaveLength(2); // main + emitted
    const child = out.rows[1]!;
    expect(child.diagnostics).toBeDefined();
    // Child inherits the parent's classification winner; pipeline trace is
    // ITS own (only the steps inside emit_row.row.steps).
    expect(child.diagnostics!.classification.winner).toBe('alpha_class');
    expect(child.diagnostics!.pipeline.map((p) => p.step)).toEqual(['set']);
  });
});
