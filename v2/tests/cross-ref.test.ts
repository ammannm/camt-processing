import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, ConfigError } from '../src/engine/config/loader';

/**
 * Writes a temporary config directory with the seven YAML files, then loads
 * it. Makes it easy to test cross-reference validation without polluting
 * the real config/ tree.
 */
function withTempConfig(
  files: Partial<Record<'classes' | 'extraction' | 'tables' | 'matrices' | 'pipeline' | 'registries' | 'export', string>>,
  body: (dir: string) => void
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cfg-'));
  try {
    const defaults: Record<string, string> = {
      'classes.yaml': 'classes: []\n',
      'extraction.yaml': 'extraction: {}\n',
      'tables.yaml': 'tables: {}\n',
      'matrices.yaml': 'matrices: {}\n',
      'pipeline.yaml': 'pipeline: {}\n',
      'registries.yaml': 'registries: {}\n',
      'export.yaml': 'export:\n  format: xlsx\n  columns: []\n'
    };
    const overrides: Record<string, string> = {};
    if (files.classes !== undefined) overrides['classes.yaml'] = files.classes;
    if (files.extraction !== undefined) overrides['extraction.yaml'] = files.extraction;
    if (files.tables !== undefined) overrides['tables.yaml'] = files.tables;
    if (files.matrices !== undefined) overrides['matrices.yaml'] = files.matrices;
    if (files.pipeline !== undefined) overrides['pipeline.yaml'] = files.pipeline;
    if (files.registries !== undefined) overrides['registries.yaml'] = files.registries;
    if (files.export !== undefined) overrides['export.yaml'] = files.export;
    for (const [name, content] of Object.entries({ ...defaults, ...overrides })) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('cross-reference validation', () => {
  it('passes when every class has extraction + pipeline entries', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: 'extraction:\n  alpha_class: {}\n',
        pipeline: 'pipeline:\n  alpha_class: {}\n'
      },
      (dir) => {
        const cfg = loadConfig(dir);
        expect(cfg.classes).toHaveLength(1);
      }
    );
  });

  it('throws when a class has no extraction entry', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: 'extraction: {}\n',
        pipeline: 'pipeline:\n  alpha_class: {}\n'
      },
      (dir) => {
        expect(() => loadConfig(dir)).toThrow(ConfigError);
      }
    );
  });

  it('throws when a class has no pipeline entry', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: 'extraction:\n  alpha_class: {}\n',
        pipeline: 'pipeline: {}\n'
      },
      (dir) => {
        expect(() => loadConfig(dir)).toThrow(ConfigError);
      }
    );
  });

  it('throws when lookup_in_table references an unknown table', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: 'extraction:\n  alpha_class: {}\n',
        pipeline: [
          'pipeline:',
          '  alpha_class:',
          '    steps:',
          '      - lookup_in_table:',
          '          table: ghost_table',
          '          key_from_static: KEY',
          '          match: { mode: exact }',
          '          assign:',
          '            out: col'
        ].join('\n')
      },
      (dir) => {
        try {
          loadConfig(dir);
          throw new Error('expected ConfigError');
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigError);
          expect((err as Error).message).toContain('ghost_table');
        }
      }
    );
  });

  it('throws when nested step inside emit_row references an unknown matrix', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: 'extraction:\n  alpha_class: {}\n',
        pipeline: [
          'pipeline:',
          '  alpha_class:',
          '    steps:',
          '      - emit_row:',
          '          row:',
          '            steps:',
          '              - lookup_in_matrix:',
          '                  matrix: ghost_matrix',
          '                  row_from_static: R',
          '                  col_from_static: C',
          '                  match: { mode: exact }',
          '                  into_field: out'
        ].join('\n')
      },
      (dir) => {
        try {
          loadConfig(dir);
          throw new Error('expected ConfigError');
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigError);
          expect((err as Error).message).toContain('ghost_matrix');
          expect((err as Error).message).toContain('emit_row');
        }
      }
    );
  });

  it('throws when strip_known_prefixes references an unknown registry', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: [
          'extraction:',
          '  alpha_class:',
          '    cleaned:',
          '      extract: { static: "PREFIX value" }',
          '      transform:',
          '        - strip_known_prefixes: { registry: missing_list }'
        ].join('\n'),
        pipeline: 'pipeline:\n  alpha_class: {}\n',
        registries: 'registries: {}\n'
      },
      (dir) => {
        try {
          loadConfig(dir);
          throw new Error('expected ConfigError');
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigError);
          expect((err as Error).message).toContain('missing_list');
        }
      }
    );
  });

  it('passes when strip_known_prefixes registry is defined', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class'
        ].join('\n'),
        extraction: [
          'extraction:',
          '  alpha_class:',
          '    cleaned:',
          '      extract: { static: "PREFIX value" }',
          '      transform:',
          '        - strip_known_prefixes: { registry: noise_list }'
        ].join('\n'),
        pipeline: 'pipeline:\n  alpha_class: {}\n',
        registries: 'registries:\n  noise_list:\n    - PREFIX\n'
      },
      (dir) => {
        const cfg = loadConfig(dir);
        expect(cfg.registries.noise_list).toEqual(['PREFIX']);
      }
    );
  });

  it('reports both missing references at once', () => {
    withTempConfig(
      {
        classes: [
          'classes:',
          '  - id: r1',
          '    match_against: source_text',
          '    keyword: ALPHA',
          '    min_similarity: 90',
          '    class: alpha_class',
          '  - id: r2',
          '    match_against: source_text',
          '    keyword: BETA',
          '    min_similarity: 90',
          '    class: beta_class'
        ].join('\n'),
        extraction: 'extraction:\n  alpha_class: {}\n',
        pipeline: 'pipeline:\n  alpha_class: {}\n'
      },
      (dir) => {
        try {
          loadConfig(dir);
          throw new Error('expected ConfigError');
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigError);
          expect((err as Error).message).toContain('beta_class');
        }
      }
    );
  });
});
