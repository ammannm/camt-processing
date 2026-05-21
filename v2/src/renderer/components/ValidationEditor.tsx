import React from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { Card, EditorHeader, StatusBox, useYamlConfig } from './form-helpers';
import { useClassNames } from './useReferences';

type Comparator = 'equals' | 'not_equals' | 'present' | 'absent' | 'greater_than' | 'less_than';

interface SimpleCondition {
  field: string;
  equals?: string | number | boolean;
  not_equals?: string | number | boolean;
  present?: true;
  absent?: true;
  greater_than?: number;
  less_than?: number;
}
interface ValidationRule {
  condition: SimpleCondition | { any_of?: unknown[]; all_of?: unknown[] };
  message: string;
  field?: string;
  applies_to?: string[];
  exclude_classes?: string[];
}
interface ValidationData { validation: { rules: ValidationRule[] }; }
const EMPTY: ValidationData = { validation: { rules: [] } };

function isComposite(c: ValidationRule['condition']): boolean {
  return typeof c === 'object' && ('any_of' in c || 'all_of' in c);
}
function detectComparator(c: SimpleCondition): Comparator {
  if (c.equals !== undefined) return 'equals';
  if (c.not_equals !== undefined) return 'not_equals';
  if (c.present) return 'present';
  if (c.absent) return 'absent';
  if (c.greater_than !== undefined) return 'greater_than';
  if (c.less_than !== undefined) return 'less_than';
  return 'present';
}
function readValue(c: SimpleCondition): string {
  if (c.equals !== undefined) return String(c.equals);
  if (c.not_equals !== undefined) return String(c.not_equals);
  if (c.greater_than !== undefined) return String(c.greater_than);
  if (c.less_than !== undefined) return String(c.less_than);
  return '';
}
function buildCondition(field: string, cmp: Comparator, value: string): SimpleCondition {
  switch (cmp) {
    case 'equals': return { field, equals: value };
    case 'not_equals': return { field, not_equals: value };
    case 'present': return { field, present: true };
    case 'absent': return { field, absent: true };
    case 'greater_than': return { field, greater_than: Number(value) };
    case 'less_than': return { field, less_than: Number(value) };
  }
}

const CMP_OPTIONS: { value: Comparator; label: string }[] = [
  { value: 'equals', label: 'ist gleich' },
  { value: 'not_equals', label: 'ist nicht gleich' },
  { value: 'present', label: 'ist vorhanden' },
  { value: 'absent', label: 'fehlt / ist leer' },
  { value: 'greater_than', label: 'grösser als' },
  { value: 'less_than', label: 'kleiner als' }
];

const UNCLASSIFIED = '_unclassified';

export function ValidationEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<ValidationData>('validation', EMPTY);
  const classNames = useClassNames();
  const classOptions = [...classNames, UNCLASSIFIED].map((c) => ({ value: c, label: c }));

  if (!data) return <Text>{status}</Text>;

  const rules = data.validation?.rules ?? [];
  const updateRule = (idx: number, patch: Partial<ValidationRule>): void =>
    setData({ validation: { rules: rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)) } });
  const addRule = (): void =>
    setData({
      validation: {
        rules: [
          ...rules,
          { condition: { field: 'out_credit', absent: true }, message: 'Habenkonto fehlt', field: 'out_credit' }
        ]
      }
    });
  const removeRule = (idx: number): void => {
    if (!confirm('Validierungsregel wirklich entfernen?')) return;
    setData({ validation: { rules: rules.filter((_, i) => i !== idx) } });
  };

  return (
    <Stack gap="md">
      <EditorHeader
        title="Validierungsregeln"
        subtitle="Klassenagnostische Regeln, die nach der Pipeline gegen jede Zeile geprüft werden."
        dirty={dirty} busy={busy} onSave={save} onReload={refresh}
      />

      {rules.map((rule, idx) => {
        if (isComposite(rule.condition)) {
          return (
            <Card key={idx}>
              <Group justify="space-between" mb="sm">
                <Title order={4}>#{idx + 1} · zusammengesetzte Bedingung</Title>
                <Tooltip label="Entfernen">
                  <ActionIcon color="red" variant="light" onClick={() => removeRule(idx)} aria-label="Entfernen">
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Alert color="yellow" mb="sm">
                Diese Regel hat eine zusammengesetzte Bedingung (any_of / all_of). Bearbeite sie über
                den <strong>Erweitert</strong>-Tab. Die Meldung lässt sich hier trotzdem ändern.
              </Alert>
              <TextInput label="Fehlermeldung" value={rule.message}
                onChange={(e) => updateRule(idx, { message: e.currentTarget.value })} />
            </Card>
          );
        }

        const c = rule.condition as SimpleCondition;
        const cmp = detectComparator(c);
        const needsValue = cmp !== 'present' && cmp !== 'absent';

        return (
          <Card key={idx}>
            <Group justify="space-between" mb="sm">
              <Title order={4}>#{idx + 1}{rule.message ? ` · ${rule.message}` : ''}</Title>
              <Tooltip label="Entfernen">
                <ActionIcon color="red" variant="light" onClick={() => removeRule(idx)} aria-label="Entfernen">
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Stack gap={4} mb="md">
              <Text size="sm" fw={600}>Bedingung — wann gilt diese Regel?</Text>
              <Group grow align="flex-end">
                <TextInput placeholder="Feldname" value={c.field}
                  onChange={(e) => updateRule(idx, { condition: buildCondition(e.currentTarget.value, cmp, readValue(c)) })} />
                <Select data={CMP_OPTIONS} value={cmp} allowDeselect={false}
                  onChange={(v) => updateRule(idx, { condition: buildCondition(c.field, (v ?? 'equals') as Comparator, readValue(c)) })} />
                {needsValue ? (
                  <TextInput placeholder="Wert" value={readValue(c)}
                    onChange={(e) => updateRule(idx, { condition: buildCondition(c.field, cmp, e.currentTarget.value) })} />
                ) : (
                  <div />
                )}
              </Group>
            </Stack>

            <TextInput label="Fehlermeldung"
              description="Darf Platzhalter wie {out_credit} oder {_class} enthalten"
              mb="md" value={rule.message}
              onChange={(e) => updateRule(idx, { message: e.currentTarget.value })} />

            <Group grow align="flex-start">
              <TextInput label="Betroffenes Feld (Diagnose)"
                value={rule.field ?? ''}
                onChange={(e) => updateRule(idx, { field: e.currentTarget.value || undefined })} />
              <MultiSelect label="Nur für Klassen" description="leer = alle Klassen"
                data={classOptions} value={rule.applies_to ?? []}
                onChange={(v) => updateRule(idx, { applies_to: v.length === 0 ? undefined : v })}
                searchable clearable />
              <MultiSelect label="Klassen ausschliessen"
                data={classOptions} value={rule.exclude_classes ?? []}
                onChange={(v) => updateRule(idx, { exclude_classes: v.length === 0 ? undefined : v })}
                searchable clearable />
            </Group>
          </Card>
        );
      })}

      <Button onClick={addRule} variant="light" leftSection="+">Regel hinzufügen</Button>

      <StatusBox status={status} />
    </Stack>
  );
}
