import { useEffect, useState } from 'react';
import { parse as parseYaml } from 'yaml';

/**
 * Lightweight hooks that load a single config file and extract the list
 * of "known names" defined there. Used by other editors to populate
 * Select / MultiSelect dropdowns so the user doesn't have to type a
 * cross-reference by hand.
 */

async function loadNames<T>(id: 'classes' | 'tables' | 'matrices' | 'registries', extract: (obj: T) => string[]): Promise<string[]> {
  const r = await window.api.loadConfigFile(id);
  if (!r.ok || !r.content || r.content.trim() === '') return [];
  try {
    const parsed = parseYaml(r.content) as T;
    return extract(parsed);
  } catch {
    return [];
  }
}

export function useClassNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    void loadNames<{ classes?: { class: string }[] }>('classes', (d) =>
      Array.from(new Set((d.classes ?? []).map((c) => c.class)))
    ).then(setNames);
  }, []);
  return names;
}

export function useTableNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    void loadNames<{ tables?: Record<string, unknown> }>('tables', (d) =>
      Object.keys(d.tables ?? {})
    ).then(setNames);
  }, []);
  return names;
}

export function useMatrixNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    void loadNames<{ matrices?: Record<string, unknown> }>('matrices', (d) =>
      Object.keys(d.matrices ?? {})
    ).then(setNames);
  }, []);
  return names;
}

export function useRegistryNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    void loadNames<{ registries?: Record<string, unknown> }>('registries', (d) =>
      Object.keys(d.registries ?? {})
    ).then(setNames);
  }, []);
  return names;
}

/**
 * Helper: convert a flat string list into the {value,label} shape Mantine
 * Select expects. Adds a free-text fallback option so unknown values
 * still display correctly.
 */
export function asSelectOptions(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}
