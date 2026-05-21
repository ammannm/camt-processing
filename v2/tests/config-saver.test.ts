import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readConfigFile,
  saveConfigFile,
  CONFIG_FILE_IDS,
  SaveError
} from '../src/engine/editor/yaml-saver';

/**
 * Each test gets its own temporary config dir seeded with a minimal valid
 * set of files. Then we edit ONE file via saveConfigFile and assert the
 * cross-references are checked end-to-end.
 */

const MINIMAL_CONFIG: Record<string, string> = {
  'classes.yaml': 'classes: []\n',
  'extraction.yaml': 'extraction: {}\n',
  'tables.yaml': 'tables: {}\n',
  'matrices.yaml': 'matrices: {}\n',
  'pipeline.yaml': 'pipeline: {}\n',
  'registries.yaml': 'registries: {}\n',
  'validation.yaml': 'validation:\n  rules: []\n',
  'export.yaml': "export_profiles:\n  default:\n    format: xlsx\n    outputs:\n      - columns: []\n"
};

let configDir: string;

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-cfgsave-'));
  for (const [name, content] of Object.entries(MINIMAL_CONFIG)) {
    fs.writeFileSync(path.join(configDir, name), content);
  }
});

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('readConfigFile', () => {
  it('returns the on-disk YAML content', () => {
    expect(readConfigFile(configDir, 'classes')).toBe('classes: []\n');
  });

  it('returns empty string for a missing optional file', () => {
    fs.unlinkSync(path.join(configDir, 'validation.yaml'));
    expect(readConfigFile(configDir, 'validation')).toBe('');
  });

  it('exposes all eight editable config file ids', () => {
    expect(CONFIG_FILE_IDS).toEqual([
      'classes',
      'extraction',
      'tables',
      'matrices',
      'pipeline',
      'registries',
      'validation',
      'export'
    ]);
  });
});

describe('saveConfigFile — schema validation', () => {
  it('writes a valid file and returns the path', () => {
    const filePath = saveConfigFile(configDir, 'registries', 'registries:\n  shop_prefixes: [PRO, KUNDE]\n');
    expect(filePath).toBe(path.resolve(configDir, 'registries.yaml'));
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('shop_prefixes');
  });

  it('rejects YAML that fails the file-specific schema (does NOT write)', () => {
    // classes.yaml expects an array of well-formed rules
    expect(() =>
      saveConfigFile(configDir, 'classes', 'classes:\n  - missing_required_fields: true\n')
    ).toThrow(SaveError);
    // Original content unchanged
    expect(fs.readFileSync(path.join(configDir, 'classes.yaml'), 'utf-8')).toBe('classes: []\n');
  });

  it('rejects malformed YAML', () => {
    expect(() => saveConfigFile(configDir, 'classes', 'classes:\n  - id: ok\n  invalid_indent')).toThrow(
      SaveError
    );
  });
});

describe('saveConfigFile — cross-reference enforcement', () => {
  it('rejects a class defined in classes.yaml when extraction/pipeline lack an entry', () => {
    const newClassesYaml = `classes:
  - id: r_alpha
    match_against: source_text
    keyword: ALPHA
    min_similarity: 90
    class: alpha_class
`;
    expect(() => saveConfigFile(configDir, 'classes', newClassesYaml)).toThrow(SaveError);
    // Original content untouched
    expect(fs.readFileSync(path.join(configDir, 'classes.yaml'), 'utf-8')).toBe('classes: []\n');
  });

  it('accepts when extraction and pipeline have matching entries', () => {
    // Pre-populate extraction + pipeline with alpha_class
    fs.writeFileSync(
      path.join(configDir, 'extraction.yaml'),
      'extraction:\n  alpha_class: {}\n'
    );
    fs.writeFileSync(
      path.join(configDir, 'pipeline.yaml'),
      'pipeline:\n  alpha_class:\n    steps: []\n'
    );
    const newClassesYaml = `classes:
  - id: r_alpha
    match_against: source_text
    keyword: ALPHA
    min_similarity: 90
    class: alpha_class
`;
    expect(() => saveConfigFile(configDir, 'classes', newClassesYaml)).not.toThrow();
  });

  it('rejects a pipeline step that references an undefined table', () => {
    fs.writeFileSync(
      path.join(configDir, 'extraction.yaml'),
      'extraction:\n  alpha_class: {}\n'
    );
    const badPipeline = `pipeline:
  alpha_class:
    steps:
      - lookup_in_table:
          table: ghost_table
          key_from_static: K
          match: { mode: exact }
          assign:
            out_a: col_a
`;
    expect(() => saveConfigFile(configDir, 'pipeline', badPipeline)).toThrow(SaveError);
  });
});
