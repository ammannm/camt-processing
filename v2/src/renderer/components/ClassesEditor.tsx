import React from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { Card, EditorHeader, StatusBox, useYamlConfig } from './form-helpers';

interface ClassRule {
  id: string;
  match_against: string;
  keyword: string;
  min_similarity: number;
  class: string;
  priority?: number;
  filter?: { field: string; equals: string | number | boolean };
}
interface ClassesData { classes: ClassRule[]; }
const EMPTY: ClassesData = { classes: [] };

export function ClassesEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<ClassesData>('classes', EMPTY);
  if (!data) return <Text>{status}</Text>;
  const classes = data.classes ?? [];

  const updateRule = (idx: number, patch: Partial<ClassRule>): void =>
    setData({ classes: classes.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });

  const move = (idx: number, dir: -1 | 1): void => {
    const next = [...classes];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setData({ classes: next });
  };

  const addRule = (): void => {
    setData({
      classes: [
        ...classes,
        { id: `r_new_${classes.length + 1}`, match_against: 'source_text', keyword: '', min_similarity: 95, class: 'new_class' }
      ]
    });
  };

  const removeRule = (idx: number): void => {
    if (!confirm(`Regel "${classes[idx]?.keyword ?? ''}" wirklich entfernen?`)) return;
    setData({ classes: classes.filter((_, i) => i !== idx) });
  };

  return (
    <Stack gap="md">
      <EditorHeader
        title="Klassifikations-Regeln"
        subtitle="Bestimmen, welche Klasse einer Eingangszeile zugewiesen wird. Höchster Score gewinnt; Priorität ist Tiebreaker."
        dirty={dirty} busy={busy} onSave={save} onReload={refresh}
      />

      {classes.map((rule, idx) => (
        <Card key={idx}>
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Text size="sm" c="dimmed" fw={500}>#{idx + 1}</Text>
              <Title order={4} ff="monospace">{rule.id}</Title>
            </Group>
            <Group gap="xs">
              <ActionIcon variant="default" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Hoch"><IconArrowUp size={14} /></ActionIcon>
              <ActionIcon variant="default" onClick={() => move(idx, 1)} disabled={idx === classes.length - 1} aria-label="Runter"><IconArrowDown size={14} /></ActionIcon>
              <Tooltip label="Entfernen">
                <ActionIcon color="red" variant="light" onClick={() => removeRule(idx)} aria-label="Entfernen">
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Group grow align="flex-start" mb="md">
            <TextInput label="ID (Diagnose-Name)" description="z.B. r_twint"
              value={rule.id} onChange={(e) => updateRule(idx, { id: e.currentTarget.value })} />
            <TextInput label="Klassen-ID" description="Wird in Extraktion/Pipeline referenziert"
              value={rule.class} onChange={(e) => updateRule(idx, { class: e.currentTarget.value })} />
          </Group>

          <Group grow align="flex-start" mb="md">
            <TextInput label="Vergleichsfeld" description="Feld der Rohzeile, gegen das gematcht wird (Default: source_text)"
              value={rule.match_against} onChange={(e) => updateRule(idx, { match_against: e.currentTarget.value })} />
            <NumberInput label="Priorität (optional)" description="Höhere Priorität gewinnt bei Score-Gleichstand"
              value={rule.priority ?? ''} onChange={(v) => updateRule(idx, { priority: v === '' ? undefined : Number(v) })} />
          </Group>

          <TextInput label="Schlüsselwort" description="Wird per Fuzzy-Match im Vergleichsfeld gesucht"
            mb="md" value={rule.keyword} onChange={(e) => updateRule(idx, { keyword: e.currentTarget.value })} />

          <Stack gap={4} mb="md">
            <Text size="sm" fw={600}>Mindest-Ähnlichkeit: <Text component="span" c="indigo" fw={700}>{rule.min_similarity}%</Text></Text>
            <Slider value={rule.min_similarity} onChange={(v) => updateRule(idx, { min_similarity: v })}
              min={0} max={100} step={1}
              marks={[{ value: 0, label: '0' }, { value: 50, label: '50' }, { value: 95, label: '95' }, { value: 100, label: '100' }]} />
          </Stack>

          <Checkbox label="Vorfilter (Regel greift nur bei bestimmtem Feldwert)"
            checked={rule.filter !== undefined}
            onChange={(e) =>
              updateRule(idx, {
                filter: e.currentTarget.checked ? { field: 'direction', equals: 'CRDT' } : undefined
              })
            }
            mb="xs"
          />
          {rule.filter && (
            <Group grow>
              <TextInput label="Feldname" value={rule.filter.field}
                onChange={(e) => updateRule(idx, { filter: { ...rule.filter!, field: e.currentTarget.value } })} />
              <TextInput label="Erwarteter Wert" value={String(rule.filter.equals)}
                onChange={(e) => updateRule(idx, { filter: { ...rule.filter!, equals: e.currentTarget.value } })} />
            </Group>
          )}
        </Card>
      ))}

      <Button onClick={addRule} variant="light" leftSection={<IconPlus size={14} />}>Regel hinzufügen</Button>

      <StatusBox status={status} />
    </Stack>
  );
}
