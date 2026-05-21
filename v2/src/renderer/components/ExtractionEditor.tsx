import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { Card, EditorHeader, StatusBox, useYamlConfig } from './form-helpers';
import { EditableTitle } from './EditableTitle';
import { useClassNames, useRegistryNames } from './useReferences';

// ---------- types ----------
type Scalar = string | number | boolean;

type Source =
  | { regex: string; capture_group?: number; from_field?: string }
  | { static: Scalar }
  | { template: string }
  | { token: { position: 'first' | 'last' | 'last_n' | 'first_part_last_word' | 'after_delimiter'; count?: number; delimiter?: string; from_field?: string } }
  | { conditional: { from_field: string; when_value: Scalar; then: string; else?: string } }
  | { full_text: { from_field?: string } };

type Transform =
  | { to_decimal: { decimal_separator?: string } }
  | { absolute_value: true }
  | { max_length: { limit: number; fallback_template?: string; move_field_to_overflow?: { from_field: string; to_field: string } } }
  | { take_last_n_chars: number }
  | { remove_pattern: string }
  | { replace_literal: { from: string; to: string } }
  | { prefix: string }
  | { suffix: string }
  | { conditional_prefix: { from_field: string; when_value: Scalar; then: string; else?: string } }
  | { strip_known_prefixes: { registry: string } }
  | { trim: true };

interface FieldRule {
  extract: Source;
  transform?: Transform[];
  required?: boolean;
  required_message?: string;
  include_source_on_error?: boolean;
}
interface ExtractionData { extraction: Record<string, Record<string, FieldRule>>; }
const EMPTY: ExtractionData = { extraction: {} };

const SOURCE_OPTIONS = [
  { value: 'regex', label: 'Regex (Suchmuster mit Capture-Group)' },
  { value: 'static', label: 'Konstanter Wert' },
  { value: 'template', label: 'Template (Platzhalter aus anderen Feldern)' },
  { value: 'token', label: 'Token-Position (erstes/letztes Wort, Split)' },
  { value: 'conditional', label: 'Bedingt (je nach Wert eines Feldes)' },
  { value: 'full_text', label: 'Vollständiger Text eines Feldes' }
];

const TRANSFORM_OPTIONS = [
  { value: 'to_decimal', label: 'Als Dezimalzahl interpretieren' },
  { value: 'absolute_value', label: 'Absolutwert' },
  { value: 'max_length', label: 'Maximale Länge (mit Fallback)' },
  { value: 'take_last_n_chars', label: 'Letzte N Zeichen' },
  { value: 'remove_pattern', label: 'Pattern entfernen (Regex)' },
  { value: 'replace_literal', label: 'Wörtlich ersetzen' },
  { value: 'prefix', label: 'Prefix anhängen' },
  { value: 'suffix', label: 'Suffix anhängen' },
  { value: 'conditional_prefix', label: 'Prefix abhängig von Feldwert' },
  { value: 'strip_known_prefixes', label: 'Bekannte Wortanfänge entfernen (Liste)' },
  { value: 'trim', label: 'Leerzeichen am Anfang/Ende entfernen' }
];

const TOKEN_POSITIONS = [
  { value: 'first', label: 'Erstes Wort' },
  { value: 'last', label: 'Letztes Wort' },
  { value: 'last_n', label: 'Letzte N Wörter' },
  { value: 'first_part_last_word', label: 'Letztes Wort vor Trennzeichen' },
  { value: 'after_delimiter', label: 'Inhalt nach Trennzeichen' }
];

function sourceKind(s: Source): string { return Object.keys(s)[0]!; }
function transformKind(t: Transform): string { return Object.keys(t)[0]!; }

function makeDefaultSource(kind: string): Source {
  switch (kind) {
    case 'regex': return { regex: '' };
    case 'static': return { static: '' };
    case 'template': return { template: '' };
    case 'token': return { token: { position: 'first' } };
    case 'conditional': return { conditional: { from_field: '', when_value: '', then: '' } };
    case 'full_text': return { full_text: {} };
    default: return { static: '' };
  }
}
function makeDefaultTransform(kind: string): Transform {
  switch (kind) {
    case 'to_decimal': return { to_decimal: {} };
    case 'absolute_value': return { absolute_value: true };
    case 'max_length': return { max_length: { limit: 39 } };
    case 'take_last_n_chars': return { take_last_n_chars: 4 };
    case 'remove_pattern': return { remove_pattern: '' };
    case 'replace_literal': return { replace_literal: { from: '', to: '' } };
    case 'prefix': return { prefix: '' };
    case 'suffix': return { suffix: '' };
    case 'conditional_prefix': return { conditional_prefix: { from_field: '', when_value: '', then: '' } };
    case 'strip_known_prefixes': return { strip_known_prefixes: { registry: '' } };
    case 'trim': return { trim: true };
    default: return { trim: true };
  }
}

// ---------- main ----------
export function ExtractionEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<ExtractionData>('extraction', EMPTY);
  const classNames = useClassNames();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newClassName, setNewClassName] = useState('');

  const classesInExtraction = useMemo(() => (data ? Object.keys(data.extraction) : []), [data]);

  useEffect(() => {
    if (data && selectedClass === null && classesInExtraction.length > 0) {
      setSelectedClass(classesInExtraction[0]!);
    }
  }, [data, selectedClass, classesInExtraction]);

  if (!data) return <Text>{status}</Text>;

  const updateClass = (cls: string, mutator: (rules: Record<string, FieldRule>) => Record<string, FieldRule>): void => {
    setData({ extraction: { ...data.extraction, [cls]: mutator(data.extraction[cls] ?? {}) } });
  };
  const addField = (): void => {
    if (!selectedClass || !newFieldName.trim()) return;
    const name = newFieldName.trim();
    updateClass(selectedClass, (rules) => (rules[name] ? rules : { ...rules, [name]: { extract: { static: '' } } }));
    setNewFieldName('');
  };
  const addClass = (cls: string): void => {
    if (!cls || cls in data.extraction) return;
    setData({ extraction: { ...data.extraction, [cls]: {} } });
    setSelectedClass(cls);
    setNewClassName('');
  };
  const removeClass = (cls: string): void => {
    if (!confirm(`Extraktions-Regeln für "${cls}" entfernen?`)) return;
    const { [cls]: _, ...rest } = data.extraction;
    setData({ extraction: rest });
    if (selectedClass === cls) setSelectedClass(Object.keys(rest)[0] ?? null);
  };
  const updateField = (cls: string, fieldName: string, patch: Partial<FieldRule>): void =>
    updateClass(cls, (rules) => ({ ...rules, [fieldName]: { ...rules[fieldName]!, ...patch } }));
  const removeField = (cls: string, fieldName: string): void => {
    if (!confirm(`Feld "${fieldName}" wirklich entfernen?`)) return;
    updateClass(cls, (rules) => { const { [fieldName]: _, ...rest } = rules; return rest; });
  };
  const renameField = (cls: string, oldName: string, newName: string): void => {
    updateClass(cls, (rules) => {
      if (rules[newName]) return rules;
      const { [oldName]: r, ...rest } = rules;
      return { ...rest, [newName]: r! };
    });
  };

  // Classes that exist in classes.yaml but not yet in extraction.yaml
  const missingExtractionClasses = classNames.filter((c) => !(c in data.extraction));

  return (
    <Stack gap="md">
      <EditorHeader
        title="Feldextraktion"
        subtitle="Pro Klasse die Felder, die aus dem Rohtext extrahiert werden. Reihenfolge ist relevant."
        dirty={dirty} busy={busy} onSave={save} onReload={refresh}
      />

      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="xs" style={{ width: 260, flexShrink: 0 }}>
          <Text size="sm" fw={600}>Klassen</Text>
          {classesInExtraction.map((c) => (
            <Button key={c} variant={c === selectedClass ? 'light' : 'subtle'} color="indigo"
              fullWidth justify="flex-start" size="xs" ff="monospace" onClick={() => setSelectedClass(c)}>
              {c}
            </Button>
          ))}

          <Stack gap={4} mt="sm">
            {missingExtractionClasses.length > 0 ? (
              <Select
                size="xs"
                data={missingExtractionClasses}
                placeholder="Aus classes.yaml übernehmen"
                value={null}
                onChange={(v) => v && addClass(v)}
                searchable
                clearable
              />
            ) : (
              <Text size="xs" c="dimmed">Alle Klassen aus classes.yaml haben Extraktionsregeln.</Text>
            )}
            <Group gap={4}>
              <TextInput size="xs" placeholder="Neue Klasse (frei)" value={newClassName}
                onChange={(e) => setNewClassName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && addClass(newClassName.trim())}
                style={{ flex: 1 }} />
              <ActionIcon variant="filled" color="indigo" onClick={() => addClass(newClassName.trim())}
                disabled={!newClassName.trim()} aria-label="Hinzufügen">+</ActionIcon>
            </Group>
          </Stack>

        </Stack>

        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          {selectedClass ? (
            <>
              <Group justify="space-between" align="center">
                <Title order={3} ff="monospace">{selectedClass}</Title>
                <Tooltip label={`Klasse "${selectedClass}" entfernen`}>
                  <ActionIcon color="red" variant="light" size="lg" onClick={() => removeClass(selectedClass)} aria-label={`Klasse "${selectedClass}" entfernen`}>
                    <IconTrash size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              {!classNames.includes(selectedClass) && (
                <Alert color="yellow">
                  Diese Klasse ist nicht in classes.yaml definiert. Vor dem Speichern muss sie dort
                  ergänzt werden — sonst schlägt die Cross-Ref-Validierung fehl.
                </Alert>
              )}

              {Object.entries(data.extraction[selectedClass] ?? {}).map(([fname, fr]) => (
                <Card key={fname}>
                  <Group justify="space-between" mb="md">
                    <EditableTitle
                      value={fname}
                      onChange={(n) => renameField(selectedClass, fname, n)}
                      validate={(n) => {
                        if (!/^\w+$/.test(n)) return 'Nur Buchstaben, Ziffern und Unterstriche erlaubt.';
                        const rules = data.extraction[selectedClass] ?? {};
                        return rules[n] && n !== fname ? `Feld "${n}" existiert bereits.` : null;
                      }}
                      order={5}
                    />
                    <Tooltip label="Feld entfernen">
                      <ActionIcon color="red" variant="light" onClick={() => removeField(selectedClass, fname)} aria-label="Feld entfernen">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  <SourceEditor value={fr.extract} onChange={(s) => updateField(selectedClass, fname, { extract: s })} />

                  <Stack mt="md" gap="xs">
                    <Text size="sm" fw={600}>Transformationen (in Reihenfolge)</Text>
                    <TransformsList
                      transforms={fr.transform ?? []}
                      onChange={(ts) => updateField(selectedClass, fname, { transform: ts.length === 0 ? undefined : ts })}
                    />
                  </Stack>

                  <Stack mt="md" gap="xs">
                    <Group>
                      <Checkbox label="Pflichtfeld" checked={fr.required ?? false}
                        onChange={(e) => updateField(selectedClass, fname, { required: e.currentTarget.checked || undefined })} />
                      <Checkbox label="Original-Text bei Fehler protokollieren"
                        checked={fr.include_source_on_error ?? false}
                        onChange={(e) => updateField(selectedClass, fname, { include_source_on_error: e.currentTarget.checked || undefined })} />
                    </Group>
                    {fr.required && (
                      <TextInput label="Fehlermeldung wenn nicht gefunden (optional)"
                        value={fr.required_message ?? ''}
                        onChange={(e) => updateField(selectedClass, fname, { required_message: e.currentTarget.value || undefined })} />
                    )}
                  </Stack>
                </Card>
              ))}

              <Card>
                <Group align="flex-end">
                  <TextInput placeholder="z.B. location" label="Neuer Feldname"
                    description="Nur Buchstaben, Ziffern und Unterstriche — wird so in Templates referenziert: {feldname}"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addField()} style={{ flex: 1 }} />
                  <Button onClick={addField} disabled={!/^\w+$/.test(newFieldName.trim())} leftSection={<IconPlus size={14} />}>Feld hinzufügen</Button>
                </Group>
              </Card>
            </>
          ) : (
            <Text c="dimmed">Wähle links eine Klasse oder lege eine neue an.</Text>
          )}
        </Stack>
      </Group>

      <StatusBox status={status} />
    </Stack>
  );
}

// ---------- Source editor ----------
function SourceEditor({ value, onChange }: { value: Source; onChange: (s: Source) => void }): JSX.Element {
  const kind = sourceKind(value);
  return (
    <Stack gap="sm">
      <Select label="Quelle (woher kommt der Wert?)" data={SOURCE_OPTIONS}
        value={kind} allowDeselect={false}
        onChange={(v) => onChange(makeDefaultSource(v ?? 'static'))} />

      {kind === 'regex' && (() => {
        const v = value as Extract<Source, { regex: string }>;
        return (
          <Group grow align="flex-start">
            <TextInput label="Regex-Pattern" value={v.regex} ff="monospace"
              onChange={(e) => onChange({ ...v, regex: e.currentTarget.value })} />
            <NumberInput label="Capture-Group" value={v.capture_group ?? 1}
              onChange={(n) => onChange({ ...v, capture_group: Number(n) })} />
            <TextInput label="Quellfeld" description="Default: source_text"
              value={v.from_field ?? ''}
              onChange={(e) => onChange({ ...v, from_field: e.currentTarget.value || undefined })} />
          </Group>
        );
      })()}

      {kind === 'static' && (() => {
        const v = value as Extract<Source, { static: Scalar }>;
        return <TextInput label="Wert" value={String(v.static)} onChange={(e) => onChange({ static: e.currentTarget.value })} />;
      })()}

      {kind === 'template' && (() => {
        const v = value as Extract<Source, { template: string }>;
        return <TextInput label="Template" description="Platzhalter wie {andere_feld_name}"
          ff="monospace" value={v.template} onChange={(e) => onChange({ template: e.currentTarget.value })} />;
      })()}

      {kind === 'token' && (() => {
        const v = value as Extract<Source, { token: unknown }>;
        const t = v.token;
        return (
          <Group grow align="flex-start">
            <Select label="Position" data={TOKEN_POSITIONS} value={t.position} allowDeselect={false}
              onChange={(p) => onChange({ token: { ...t, position: (p ?? 'first') as typeof t.position } })} />
            <NumberInput label="N (bei 'letzte N')" value={t.count ?? ''}
              onChange={(n) => onChange({ token: { ...t, count: n === '' ? undefined : Number(n) } })} />
            <TextInput label="Trennzeichen" value={t.delimiter ?? ''}
              onChange={(e) => onChange({ token: { ...t, delimiter: e.currentTarget.value || undefined } })} />
            <TextInput label="Quellfeld" value={t.from_field ?? ''}
              onChange={(e) => onChange({ token: { ...t, from_field: e.currentTarget.value || undefined } })} />
          </Group>
        );
      })()}

      {kind === 'conditional' && (() => {
        const v = value as Extract<Source, { conditional: unknown }>;
        const c = v.conditional;
        return (
          <Group grow align="flex-start">
            <TextInput label="Bedingungs-Feld" value={c.from_field}
              onChange={(e) => onChange({ conditional: { ...c, from_field: e.currentTarget.value } })} />
            <TextInput label="Wenn dieser Wert" value={String(c.when_value)}
              onChange={(e) => onChange({ conditional: { ...c, when_value: e.currentTarget.value } })} />
            <TextInput label="… dann" value={c.then}
              onChange={(e) => onChange({ conditional: { ...c, then: e.currentTarget.value } })} />
            <TextInput label="… sonst" value={c.else ?? ''}
              onChange={(e) => onChange({ conditional: { ...c, else: e.currentTarget.value || undefined } })} />
          </Group>
        );
      })()}

      {kind === 'full_text' && (() => {
        const v = value as Extract<Source, { full_text: unknown }>;
        return (
          <TextInput label="Quellfeld" description="Default: source_text"
            value={v.full_text.from_field ?? ''}
            onChange={(e) => onChange({ full_text: { from_field: e.currentTarget.value || undefined } })} />
        );
      })()}
    </Stack>
  );
}

// ---------- Transforms ----------
function TransformsList({ transforms, onChange }: { transforms: Transform[]; onChange: (ts: Transform[]) => void }): JSX.Element {
  const [adding, setAdding] = useState<string>(TRANSFORM_OPTIONS[0]!.value);

  const update = (idx: number, t: Transform): void => onChange(transforms.map((x, i) => (i === idx ? t : x)));
  const remove = (idx: number): void => {
    if (!confirm('Transformation wirklich entfernen?')) return;
    onChange(transforms.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1): void => {
    const next = [...transforms];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };
  const add = (): void => onChange([...transforms, makeDefaultTransform(adding)]);

  return (
    <Stack gap="xs">
      {transforms.map((t, idx) => (
        <Card key={idx} style={{ marginBottom: 0, background: 'var(--mantine-color-gray-0)' }}>
          <Group justify="space-between" align="flex-start">
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">#{idx + 1}</Text>
              <Text size="sm" fw={600}>{TRANSFORM_OPTIONS.find((o) => o.value === transformKind(t))?.label}</Text>
            </Group>
            <Group gap={2}>
              <ActionIcon size="sm" variant="default" onClick={() => move(idx, -1)} disabled={idx === 0}><IconArrowUp size={14} /></ActionIcon>
              <ActionIcon size="sm" variant="default" onClick={() => move(idx, 1)} disabled={idx === transforms.length - 1}><IconArrowDown size={14} /></ActionIcon>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove(idx)}><IconX size={14} /></ActionIcon>
            </Group>
          </Group>
          <TransformEditor value={t} onChange={(nv) => update(idx, nv)} />
        </Card>
      ))}
      <Group gap="xs">
        <Select data={TRANSFORM_OPTIONS} value={adding} allowDeselect={false}
          onChange={(v) => v && setAdding(v)} style={{ flex: 1 }} size="xs" />
        <Button size="xs" onClick={add} leftSection={<IconPlus size={14} />}>Transformation</Button>
      </Group>
    </Stack>
  );
}

function TransformEditor({ value, onChange }: { value: Transform; onChange: (t: Transform) => void }): JSX.Element {
  const kind = transformKind(value);
  const registryNames = useRegistryNames();

  if (kind === 'to_decimal') {
    const v = value as Extract<Transform, { to_decimal: unknown }>;
    return (
      <TextInput mt="xs" label="Dezimaltrennzeichen" description="Default: ."
        value={v.to_decimal.decimal_separator ?? ''}
        onChange={(e) => onChange({ to_decimal: { decimal_separator: e.currentTarget.value || undefined } })} />
    );
  }
  if (kind === 'absolute_value' || kind === 'trim') {
    return <Text size="xs" c="dimmed" mt="xs">(keine Parameter)</Text>;
  }
  if (kind === 'max_length') {
    const v = value as Extract<Transform, { max_length: unknown }>;
    const p = v.max_length;
    return (
      <Stack mt="xs" gap="xs">
        <Group grow>
          <NumberInput label="Limit (Zeichen)" value={p.limit}
            onChange={(n) => onChange({ max_length: { ...p, limit: Number(n) } })} />
          <TextInput label="Fallback-Template (optional)" value={p.fallback_template ?? ''}
            onChange={(e) => onChange({ max_length: { ...p, fallback_template: e.currentTarget.value || undefined } })} />
        </Group>
        <Group grow>
          <TextInput label="Überlauf-Quellfeld" value={p.move_field_to_overflow?.from_field ?? ''}
            onChange={(e) => onChange({ max_length: { ...p, move_field_to_overflow: { from_field: e.currentTarget.value, to_field: p.move_field_to_overflow?.to_field ?? '' } } })} />
          <TextInput label="Überlauf-Zielfeld" value={p.move_field_to_overflow?.to_field ?? ''}
            onChange={(e) => onChange({ max_length: { ...p, move_field_to_overflow: { from_field: p.move_field_to_overflow?.from_field ?? '', to_field: e.currentTarget.value } } })} />
        </Group>
      </Stack>
    );
  }
  if (kind === 'take_last_n_chars') {
    const v = value as Extract<Transform, { take_last_n_chars: number }>;
    return <NumberInput mt="xs" label="N (Zeichen)" value={v.take_last_n_chars}
      onChange={(n) => onChange({ take_last_n_chars: Number(n) })} />;
  }
  if (kind === 'remove_pattern') {
    const v = value as Extract<Transform, { remove_pattern: string }>;
    return <TextInput mt="xs" label="Regex-Pattern" ff="monospace" value={v.remove_pattern}
      onChange={(e) => onChange({ remove_pattern: e.currentTarget.value })} />;
  }
  if (kind === 'replace_literal') {
    const v = value as Extract<Transform, { replace_literal: unknown }>;
    const p = v.replace_literal;
    return (
      <Group grow mt="xs">
        <TextInput label="von" value={p.from} onChange={(e) => onChange({ replace_literal: { ...p, from: e.currentTarget.value } })} />
        <TextInput label="zu" value={p.to} onChange={(e) => onChange({ replace_literal: { ...p, to: e.currentTarget.value } })} />
      </Group>
    );
  }
  if (kind === 'prefix' || kind === 'suffix') {
    const v = value as { prefix?: string; suffix?: string };
    const k = kind as 'prefix' | 'suffix';
    return <TextInput mt="xs" label={k === 'prefix' ? 'Prefix' : 'Suffix'} value={(v[k] as string) ?? ''}
      onChange={(e) => onChange({ [k]: e.currentTarget.value } as Transform)} />;
  }
  if (kind === 'conditional_prefix') {
    const v = value as Extract<Transform, { conditional_prefix: unknown }>;
    const c = v.conditional_prefix;
    return (
      <Group grow mt="xs">
        <TextInput label="Bedingungs-Feld" value={c.from_field}
          onChange={(e) => onChange({ conditional_prefix: { ...c, from_field: e.currentTarget.value } })} />
        <TextInput label="wenn Wert" value={String(c.when_value)}
          onChange={(e) => onChange({ conditional_prefix: { ...c, when_value: e.currentTarget.value } })} />
        <TextInput label="dann" value={c.then}
          onChange={(e) => onChange({ conditional_prefix: { ...c, then: e.currentTarget.value } })} />
        <TextInput label="sonst" value={c.else ?? ''}
          onChange={(e) => onChange({ conditional_prefix: { ...c, else: e.currentTarget.value || undefined } })} />
      </Group>
    );
  }
  if (kind === 'strip_known_prefixes') {
    const v = value as Extract<Transform, { strip_known_prefixes: unknown }>;
    return (
      <Select mt="xs" label="Liste aus registries.yaml"
        description="Aus den definierten Listen wählen"
        data={registryNames}
        value={v.strip_known_prefixes.registry}
        onChange={(n) => onChange({ strip_known_prefixes: { registry: n ?? '' } })}
        searchable nothingFoundMessage="Keine Liste definiert — erst im Tab 'Listen' anlegen" />
    );
  }
  return <Text size="xs" c="dimmed" mt="xs">(unbekannte Transformation)</Text>;
}
