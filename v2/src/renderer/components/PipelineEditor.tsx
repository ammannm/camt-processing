import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
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
import { useClassNames, useMatrixNames, useTableNames } from './useReferences';

// ---------- types ----------
type Scalar = string | number | boolean;
type Condition =
  | { field: string; equals: Scalar }
  | { field: string; not_equals: Scalar }
  | { field: string; present: true }
  | { field: string; absent: true }
  | { field: string; greater_than: number }
  | { field: string; less_than: number };
type MatchSpec = { mode: 'exact' | 'exact_normalized' | 'fuzzy' | 'fuzzy_normalized'; min_similarity?: number };

type Step =
  | { lookup_in_table: { table: string; key_from_field?: string; key_from_static?: string; match: MatchSpec; assign: Record<string, string> } }
  | { lookup_in_matrix: { matrix: string; row_from_field?: string; row_from_static?: string; col_from_field?: string; col_from_static?: string; match?: MatchSpec; row_match?: MatchSpec; col_match?: MatchSpec; into_field: string } }
  | { set: Record<string, Scalar> }
  | { when: { condition: Condition; do: Step[] } }
  | { emit_row: { condition?: Condition; row: { steps: Step[] } } }
  | { error_if: { condition: Condition; message: string; field?: string } };

interface PipelineData { pipeline: Record<string, { steps: Step[] }>; }
const EMPTY: PipelineData = { pipeline: {} };

const STEP_OPTIONS = [
  { value: 'lookup_in_table', label: 'Tabellen-Lookup' },
  { value: 'lookup_in_matrix', label: 'Matrix-Lookup' },
  { value: 'set', label: 'Werte setzen' },
  { value: 'when', label: 'Wenn … dann' },
  { value: 'emit_row', label: 'Zusatzzeile erzeugen' },
  { value: 'error_if', label: 'Fehler markieren' }
];

const MATCH_MODE_OPTIONS = [
  { value: 'exact', label: 'exakt' },
  { value: 'exact_normalized', label: 'exakt normalisiert (Umlaute/Case)' },
  { value: 'fuzzy', label: 'fuzzy' },
  { value: 'fuzzy_normalized', label: 'fuzzy normalisiert' }
];

const CMP_OPTIONS = [
  { value: 'equals', label: 'ist gleich' },
  { value: 'not_equals', label: 'ist nicht gleich' },
  { value: 'present', label: 'vorhanden' },
  { value: 'absent', label: 'fehlt' },
  { value: 'greater_than', label: 'grösser als' },
  { value: 'less_than', label: 'kleiner als' }
];

function stepKind(s: Step): string { return Object.keys(s)[0]!; }
function makeDefaultStep(kind: string): Step {
  switch (kind) {
    case 'lookup_in_table': return { lookup_in_table: { table: '', key_from_static: '', match: { mode: 'exact_normalized' }, assign: {} } };
    case 'lookup_in_matrix': return { lookup_in_matrix: { matrix: '', row_from_field: '', col_from_field: '', match: { mode: 'exact_normalized' }, into_field: '' } };
    case 'set': return { set: {} };
    case 'when': return { when: { condition: { field: '', equals: '' }, do: [] } };
    case 'emit_row': return { emit_row: { row: { steps: [] } } };
    case 'error_if': return { error_if: { condition: { field: '', absent: true }, message: '' } };
    default: return { set: {} };
  }
}

// ---------- main ----------
export function PipelineEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<PipelineData>('pipeline', EMPTY);
  const classNames = useClassNames();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');

  const classesInPipeline = useMemo(() => (data ? Object.keys(data.pipeline) : []), [data]);
  useEffect(() => {
    if (data && selectedClass === null && classesInPipeline.length > 0) setSelectedClass(classesInPipeline[0]!);
  }, [data, selectedClass, classesInPipeline]);

  if (!data) return <Text>{status}</Text>;

  const updateClass = (cls: string, steps: Step[]): void => {
    setData({ pipeline: { ...data.pipeline, [cls]: { steps } } });
  };
  const addClass = (cls: string): void => {
    if (!cls || cls in data.pipeline) return;
    setData({ pipeline: { ...data.pipeline, [cls]: { steps: [] } } });
    setSelectedClass(cls);
    setNewClassName('');
  };
  const removeClass = (cls: string): void => {
    if (!confirm(`Pipeline für "${cls}" entfernen?`)) return;
    const { [cls]: _, ...rest } = data.pipeline;
    setData({ pipeline: rest });
    if (selectedClass === cls) setSelectedClass(Object.keys(rest)[0] ?? null);
  };

  const missingPipelineClasses = classNames.filter((c) => !(c in data.pipeline));

  return (
    <Stack gap="md">
      <EditorHeader
        title="Pipeline-Schritte"
        subtitle="Pro Klasse die Schrittfolge, die aus den extrahierten Feldern die Buchungszeile erzeugt."
        dirty={dirty} busy={busy} onSave={save} onReload={refresh}
      />

      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="xs" style={{ width: 260, flexShrink: 0 }}>
          <Text size="sm" fw={600}>Klassen</Text>
          {classesInPipeline.map((c) => (
            <Button key={c} variant={c === selectedClass ? 'light' : 'subtle'} color="indigo"
              fullWidth justify="flex-start" size="xs" ff="monospace" onClick={() => setSelectedClass(c)}>
              {c}
            </Button>
          ))}

          <Stack gap={4} mt="sm">
            {missingPipelineClasses.length > 0 ? (
              <Select size="xs" data={missingPipelineClasses}
                placeholder="Aus classes.yaml übernehmen" value={null}
                onChange={(v) => v && addClass(v)} searchable clearable />
            ) : (
              <Text size="xs" c="dimmed">Alle Klassen aus classes.yaml haben Pipeline-Definitionen.</Text>
            )}
            <Group gap={4}>
              <TextInput size="xs" placeholder="Neue Klasse" value={newClassName}
                onChange={(e) => setNewClassName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && addClass(newClassName.trim())} style={{ flex: 1 }} />
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
                  Diese Klasse ist nicht in classes.yaml definiert. Vor dem Speichern ergänzen, sonst
                  schlägt die Cross-Ref-Validierung fehl.
                </Alert>
              )}
              <StepsList
                steps={data.pipeline[selectedClass]?.steps ?? []}
                onChange={(steps) => updateClass(selectedClass, steps)}
                depth={0}
              />
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

// ---------- Steps list (recursive) ----------
function StepsList({ steps, onChange, depth }: { steps: Step[]; onChange: (s: Step[]) => void; depth: number }): JSX.Element {
  const [adding, setAdding] = useState<string>(STEP_OPTIONS[0]!.value);
  const update = (idx: number, s: Step): void => onChange(steps.map((x, i) => (i === idx ? s : x)));
  const remove = (idx: number): void => {
    if (!confirm('Schritt wirklich entfernen?')) return;
    onChange(steps.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1): void => {
    const next = [...steps];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };
  const add = (): void => onChange([...steps, makeDefaultStep(adding)]);

  return (
    <Stack gap="xs" style={depth > 0 ? { marginLeft: 16, borderLeft: '3px solid var(--mantine-color-gray-3)', paddingLeft: 12 } : undefined}>
      {steps.map((s, idx) => (
        <Card key={idx}>
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <Text size="xs" c="dimmed">#{idx + 1}</Text>
              <Text size="sm" fw={600}>{STEP_OPTIONS.find((o) => o.value === stepKind(s))?.label}</Text>
            </Group>
            <Group gap={2}>
              <ActionIcon size="sm" variant="default" onClick={() => move(idx, -1)} disabled={idx === 0}><IconArrowUp size={14} /></ActionIcon>
              <ActionIcon size="sm" variant="default" onClick={() => move(idx, 1)} disabled={idx === steps.length - 1}><IconArrowDown size={14} /></ActionIcon>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove(idx)}><IconX size={14} /></ActionIcon>
            </Group>
          </Group>
          <StepEditor value={s} onChange={(ns) => update(idx, ns)} depth={depth} />
        </Card>
      ))}
      <Group gap="xs">
        <Select data={STEP_OPTIONS} value={adding} allowDeselect={false}
          onChange={(v) => v && setAdding(v)} style={{ flex: 1 }} size="xs" />
        <Button size="xs" onClick={add} leftSection={<IconPlus size={14} />}>Schritt</Button>
      </Group>
    </Stack>
  );
}

function StepEditor({ value, onChange, depth }: { value: Step; onChange: (s: Step) => void; depth: number }): JSX.Element {
  const k = stepKind(value);
  if (k === 'lookup_in_table') return <LookupInTableEditor value={(value as any).lookup_in_table} onChange={(b) => onChange({ lookup_in_table: b } as Step)} />;
  if (k === 'lookup_in_matrix') return <LookupInMatrixEditor value={(value as any).lookup_in_matrix} onChange={(b) => onChange({ lookup_in_matrix: b } as Step)} />;
  if (k === 'set') return <SetEditor value={(value as any).set} onChange={(b) => onChange({ set: b } as Step)} />;
  if (k === 'when') return <WhenEditor value={(value as any).when} onChange={(b) => onChange({ when: b } as Step)} depth={depth} />;
  if (k === 'emit_row') return <EmitRowEditor value={(value as any).emit_row} onChange={(b) => onChange({ emit_row: b } as Step)} depth={depth} />;
  if (k === 'error_if') return <ErrorIfEditor value={(value as any).error_if} onChange={(b) => onChange({ error_if: b } as Step)} />;
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}

function MatchEditor({ value, onChange }: { value: MatchSpec; onChange: (m: MatchSpec) => void }): JSX.Element {
  const needsThreshold = value.mode === 'fuzzy' || value.mode === 'fuzzy_normalized';
  return (
    <Group grow align="flex-end">
      <Select label="Match-Modus" data={MATCH_MODE_OPTIONS} value={value.mode} allowDeselect={false}
        onChange={(v) => onChange({ ...value, mode: (v ?? 'exact') as MatchSpec['mode'] })} />
      {needsThreshold && (
        <NumberInput label="Mindest-Score" min={0} max={100} value={value.min_similarity ?? 95}
          onChange={(n) => onChange({ ...value, min_similarity: Number(n) })} />
      )}
    </Group>
  );
}

function LookupInTableEditor({ value, onChange }: { value: any; onChange: (b: any) => void }): JSX.Element {
  const tableNames = useTableNames();
  const fromField = value.key_from_field ?? '';
  const fromStatic = value.key_from_static ?? '';
  const keySource = fromField !== '' ? 'field' : 'static';
  return (
    <Stack gap="sm">
      <Select label="Tabelle" data={tableNames} value={value.table}
        searchable nothingFoundMessage="Keine Tabelle definiert — erst im Tab 'Tabellen' anlegen"
        onChange={(v) => onChange({ ...value, table: v ?? '' })} />

      <Group grow align="flex-end">
        <Select label="Schlüssel kommt aus" data={[
          { value: 'field', label: 'Feldwert der Zeile' },
          { value: 'static', label: 'statischer Wert' }
        ]} value={keySource} allowDeselect={false}
          onChange={(v) => onChange({ ...value, key_from_field: v === 'field' ? (fromField || '') : undefined, key_from_static: v === 'static' ? (fromStatic || '') : undefined })} />
        {keySource === 'field' ? (
          <TextInput label="Feldname" value={fromField} ff="monospace"
            onChange={(e) => onChange({ ...value, key_from_field: e.currentTarget.value, key_from_static: undefined })} />
        ) : (
          <TextInput label="Statischer Wert" value={fromStatic}
            onChange={(e) => onChange({ ...value, key_from_static: e.currentTarget.value, key_from_field: undefined })} />
        )}
      </Group>

      <MatchEditor value={value.match} onChange={(m) => onChange({ ...value, match: m })} />

      <AssignEditor value={value.assign} onChange={(a) => onChange({ ...value, assign: a })} />
    </Stack>
  );
}

function AssignEditor({ value, onChange }: { value: Record<string, string>; onChange: (a: Record<string, string>) => void }): JSX.Element {
  const entries = Object.entries(value);
  const [newOut, setNewOut] = useState('');
  const [newCol, setNewCol] = useState('');

  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>Zuweisungen — Output-Feld ← Tabellen-Spalte</Text>
      {entries.length === 0 && <Text size="xs" c="dimmed">Noch keine Zuweisungen.</Text>}
      {entries.map(([out, col]) => (
        <Group key={out} gap="xs" wrap="nowrap">
          <TextInput size="xs" value={out} disabled style={{ flex: 1 }} />
          <Text size="xs" c="dimmed">←</Text>
          <TextInput size="xs" value={col} ff="monospace"
            onChange={(e) => onChange({ ...value, [out]: e.currentTarget.value })} style={{ flex: 1 }} />
          <ActionIcon size="xs" variant="subtle" color="red"
            onClick={() => { const { [out]: _, ...rest } = value; onChange(rest); }}><IconX size={14} /></ActionIcon>
        </Group>
      ))}
      <Group gap="xs" wrap="nowrap" mt="xs">
        <TextInput size="xs" placeholder="Output-Feld" value={newOut}
          onChange={(e) => setNewOut(e.currentTarget.value)} style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">←</Text>
        <TextInput size="xs" placeholder="Tabellen-Spalte" value={newCol} ff="monospace"
          onChange={(e) => setNewCol(e.currentTarget.value)} style={{ flex: 1 }} />
        <ActionIcon size="xs" variant="filled" color="indigo"
          onClick={() => { if (newOut.trim() && newCol.trim()) { onChange({ ...value, [newOut.trim()]: newCol.trim() }); setNewOut(''); setNewCol(''); } }}
          disabled={!newOut.trim() || !newCol.trim()}>+</ActionIcon>
      </Group>
    </Stack>
  );
}

function LookupInMatrixEditor({ value, onChange }: { value: any; onChange: (b: any) => void }): JSX.Element {
  const matrixNames = useMatrixNames();
  return (
    <Stack gap="sm">
      <Select label="Matrix" data={matrixNames} value={value.matrix}
        searchable nothingFoundMessage="Keine Matrix definiert — erst im Tab 'Matrizen' anlegen"
        onChange={(v) => onChange({ ...value, matrix: v ?? '' })} />
      <Group grow align="flex-start">
        <TextInput label="Zeile aus Feld" value={value.row_from_field ?? ''} ff="monospace"
          onChange={(e) => onChange({ ...value, row_from_field: e.currentTarget.value || undefined })} />
        <TextInput label="… oder statisch" value={value.row_from_static ?? ''}
          onChange={(e) => onChange({ ...value, row_from_static: e.currentTarget.value || undefined })} />
        <TextInput label="Spalte aus Feld" value={value.col_from_field ?? ''} ff="monospace"
          onChange={(e) => onChange({ ...value, col_from_field: e.currentTarget.value || undefined })} />
        <TextInput label="… oder statisch" value={value.col_from_static ?? ''}
          onChange={(e) => onChange({ ...value, col_from_static: e.currentTarget.value || undefined })} />
      </Group>
      <MatchEditor value={value.match ?? { mode: 'exact_normalized' }} onChange={(m) => onChange({ ...value, match: m })} />
      <TextInput label="Schreibe Ergebnis in Feld" value={value.into_field} ff="monospace"
        onChange={(e) => onChange({ ...value, into_field: e.currentTarget.value })} />
    </Stack>
  );
}

function SetEditor({ value, onChange }: { value: Record<string, Scalar>; onChange: (v: Record<string, Scalar>) => void }): JSX.Element {
  const entries = Object.entries(value);
  const [newField, setNewField] = useState('');
  const [newValue, setNewValue] = useState('');
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">Werte direkt zuweisen. Strings mit <code>{'{...}'}</code> sind Templates.</Text>
      {entries.map(([f, v]) => (
        <Group key={f} gap="xs" wrap="nowrap">
          <TextInput size="xs" value={f} disabled style={{ flex: 1 }} />
          <Text size="xs" c="dimmed">=</Text>
          <TextInput size="xs" value={String(v)}
            onChange={(e) => onChange({ ...value, [f]: e.currentTarget.value })} style={{ flex: 2 }} />
          <ActionIcon size="xs" variant="subtle" color="red"
            onClick={() => { const { [f]: _, ...rest } = value; onChange(rest); }}><IconX size={14} /></ActionIcon>
        </Group>
      ))}
      <Group gap="xs" wrap="nowrap" mt="xs">
        <TextInput size="xs" placeholder="Feldname" value={newField}
          onChange={(e) => setNewField(e.currentTarget.value)} style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">=</Text>
        <TextInput size="xs" placeholder="Wert oder Template" value={newValue}
          onChange={(e) => setNewValue(e.currentTarget.value)} style={{ flex: 2 }} />
        <ActionIcon size="xs" variant="filled" color="indigo"
          onClick={() => { if (newField.trim()) { onChange({ ...value, [newField.trim()]: newValue }); setNewField(''); setNewValue(''); } }}
          disabled={!newField.trim()}>+</ActionIcon>
      </Group>
    </Stack>
  );
}

function ConditionEditor({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }): JSX.Element {
  type Cmp = 'equals' | 'not_equals' | 'present' | 'absent' | 'greater_than' | 'less_than';
  const cmp: Cmp = 'equals' in value ? 'equals' :
    'not_equals' in value ? 'not_equals' :
    'present' in value ? 'present' :
    'absent' in value ? 'absent' :
    'greater_than' in value ? 'greater_than' : 'less_than';
  const val = cmp === 'equals' ? String((value as any).equals) :
    cmp === 'not_equals' ? String((value as any).not_equals) :
    cmp === 'greater_than' ? String((value as any).greater_than) :
    cmp === 'less_than' ? String((value as any).less_than) : '';
  const needsValue = cmp !== 'present' && cmp !== 'absent';

  const update = (newField: string, newCmp: Cmp, newVal: string): void => {
    switch (newCmp) {
      case 'equals': onChange({ field: newField, equals: newVal }); return;
      case 'not_equals': onChange({ field: newField, not_equals: newVal }); return;
      case 'present': onChange({ field: newField, present: true }); return;
      case 'absent': onChange({ field: newField, absent: true }); return;
      case 'greater_than': onChange({ field: newField, greater_than: Number(newVal) }); return;
      case 'less_than': onChange({ field: newField, less_than: Number(newVal) }); return;
    }
  };

  return (
    <Group grow align="flex-end">
      <TextInput placeholder="Feldname" value={value.field} ff="monospace"
        onChange={(e) => update(e.currentTarget.value, cmp, val)} />
      <Select data={CMP_OPTIONS} value={cmp} allowDeselect={false}
        onChange={(v) => update(value.field, (v ?? 'equals') as Cmp, val)} />
      {needsValue ? (
        <TextInput placeholder="Wert" value={val}
          onChange={(e) => update(value.field, cmp, e.currentTarget.value)} />
      ) : (
        <div />
      )}
    </Group>
  );
}

function WhenEditor({ value, onChange, depth }: { value: { condition: Condition; do: Step[] }; onChange: (v: any) => void; depth: number }): JSX.Element {
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>Wenn diese Bedingung erfüllt ist …</Text>
      <ConditionEditor value={value.condition} onChange={(c) => onChange({ ...value, condition: c })} />
      <Text size="sm" fw={600}>… dann diese Schritte ausführen:</Text>
      <StepsList steps={value.do} onChange={(s) => onChange({ ...value, do: s })} depth={depth + 1} />
    </Stack>
  );
}

function EmitRowEditor({ value, onChange, depth }: { value: { condition?: Condition; row: { steps: Step[] } }; onChange: (v: any) => void; depth: number }): JSX.Element {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>Bedingung (optional — leer = immer emittieren)</Text>
        {value.condition ? (
          <Button size="xs" variant="default" onClick={() => onChange({ ...value, condition: undefined })}>
            Bedingung entfernen
          </Button>
        ) : (
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => onChange({ ...value, condition: { field: '', absent: true } })}>
            Bedingung
          </Button>
        )}
      </Group>
      {value.condition && (
        <ConditionEditor value={value.condition} onChange={(c) => onChange({ ...value, condition: c })} />
      )}
      <Text size="sm" fw={600}>Schritte für die Zusatzzeile:</Text>
      <StepsList steps={value.row.steps} onChange={(s) => onChange({ ...value, row: { steps: s } })} depth={depth + 1} />
    </Stack>
  );
}

function ErrorIfEditor({ value, onChange }: { value: { condition: Condition; message: string; field?: string }; onChange: (v: any) => void }): JSX.Element {
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>Bedingung</Text>
      <ConditionEditor value={value.condition} onChange={(c) => onChange({ ...value, condition: c })} />
      <TextInput label="Fehlermeldung (Template)" value={value.message}
        onChange={(e) => onChange({ ...value, message: e.currentTarget.value })} />
      <TextInput label="Betroffenes Feld (Diagnose)" value={value.field ?? ''} ff="monospace"
        onChange={(e) => onChange({ ...value, field: e.currentTarget.value || undefined })} />
    </Stack>
  );
}
