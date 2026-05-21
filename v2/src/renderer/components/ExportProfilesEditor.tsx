import React, { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconMinus, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { Card, EditorHeader, StatusBox, useYamlConfig } from './form-helpers';
import { EditableTitle } from './EditableTitle';

const FORMATS = ['xlsx', 'csv', 'json'] as const;
type Format = (typeof FORMATS)[number];
const FORMAT_OPTIONS = FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));

const COLUMN_FORMATS = ['date_ddmmyyyy', 'number_two_decimals', 'number_no_decimals', 'uppercase', 'lowercase', 'trim'] as const;
type ColumnFormat = (typeof COLUMN_FORMATS)[number];
const COLUMN_FORMAT_OPTIONS = [
  { value: '', label: '(kein Formatter)' },
  ...COLUMN_FORMATS.map((f) => ({ value: f, label: f }))
];

interface ExportColumn { header: string; from_field: string; format?: ColumnFormat; }
interface ExportOutput { name?: string; columns: ExportColumn[]; }
interface ExportProfile { description?: string; format: Format; outputs: ExportOutput[]; }
interface ExportData { export_profiles: Record<string, ExportProfile>; }
const EMPTY: ExportData = { export_profiles: {} };

export function ExportProfilesEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<ExportData>('export', EMPTY);
  const [newProfileName, setNewProfileName] = useState('');

  if (!data) return <Text>{status}</Text>;
  const profiles = data.export_profiles ?? {};
  const names = Object.keys(profiles);

  const updateProfile = (name: string, patch: Partial<ExportProfile>): void => {
    setData({ export_profiles: { ...profiles, [name]: { ...profiles[name]!, ...patch } } });
  };
  const renameProfile = (oldName: string, newName: string): void => {
    if (newName === oldName || newName in profiles) return;
    const { [oldName]: prof, ...rest } = profiles;
    setData({ export_profiles: { ...rest, [newName]: prof! } });
  };
  const removeProfile = (name: string): void => {
    if (!confirm(`Profil "${name}" wirklich entfernen?`)) return;
    const { [name]: _, ...rest } = profiles;
    setData({ export_profiles: rest });
  };
  const addProfile = (): void => {
    const n = newProfileName.trim();
    if (!n || n in profiles) return;
    setData({
      export_profiles: { ...profiles, [n]: { format: 'xlsx', outputs: [{ columns: [] }] } }
    });
    setNewProfileName('');
  };

  return (
    <Stack gap="md">
      <EditorHeader
        title="Export-Profile"
        subtitle="Jedes Profil = ein eigenständiges Ausgabeziel (Format + Spaltenlayout)."
        dirty={dirty} busy={busy} onSave={save} onReload={refresh}
      />

      {names.map((name) => {
        const profile = profiles[name]!;
        return (
          <Card key={name}>
            <Group justify="space-between" mb="md">
              <EditableTitle
                value={name}
                onChange={(n) => renameProfile(name, n)}
                validate={(n) => (n in profiles && n !== name ? `Profil "${n}" existiert bereits.` : null)}
                order={4}
              />
              <Tooltip label="Profil entfernen">
                <ActionIcon color="red" variant="light" onClick={() => removeProfile(name)} aria-label="Profil entfernen">
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Group grow align="flex-start" mb="md">
              <TextInput label="Beschreibung" value={profile.description ?? ''}
                onChange={(e) => updateProfile(name, { description: e.currentTarget.value || undefined })} />
              <Select label="Format" data={FORMAT_OPTIONS} value={profile.format} allowDeselect={false}
                onChange={(v) => updateProfile(name, { format: (v ?? 'xlsx') as Format })} />
            </Group>

            {profile.outputs.map((output, outIdx) => (
              <Stack key={outIdx} mt="md" p="md" gap="sm" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
                <TextInput label={`Output-Suffix${profile.outputs.length > 1 ? ' (erforderlich)' : ' (optional)'}`}
                  description={profile.outputs.length > 1 ? 'Wird vor der Endung an den Pfad angehängt' : 'Leer = an gewählten Pfad direkt'}
                  value={output.name ?? ''}
                  onChange={(e) =>
                    updateProfile(name, {
                      outputs: profile.outputs.map((o, i) => (i === outIdx ? { ...o, name: e.currentTarget.value || undefined } : o))
                    })
                  } />
                <ColumnsTable
                  columns={output.columns}
                  onChange={(cols) =>
                    updateProfile(name, {
                      outputs: profile.outputs.map((o, i) => (i === outIdx ? { ...o, columns: cols } : o))
                    })
                  }
                />
              </Stack>
            ))}

            <Group mt="md">
              <Button variant="light" size="xs" leftSection={<IconPlus size={14} />}
                onClick={() => updateProfile(name, { outputs: [...profile.outputs, { columns: [] }] })}>
                Weiteren Output anlegen
              </Button>
              {profile.outputs.length > 1 && (
                <Tooltip label="Letzten Output entfernen">
                  <ActionIcon color="red" variant="light" size="lg"
                    onClick={() => {
                      if (!confirm('Letzten Output wirklich entfernen?')) return;
                      updateProfile(name, { outputs: profile.outputs.slice(0, -1) });
                    }}
                    aria-label="Letzten Output entfernen">
                    <IconMinus size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Card>
        );
      })}

      <Card>
        <Group>
          <TextInput placeholder="Name des neuen Profils" value={newProfileName}
            onChange={(e) => setNewProfileName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProfile()} style={{ flex: 1 }} />
          <Button onClick={addProfile} disabled={!newProfileName.trim()} leftSection={<IconPlus size={14} />}>Profil anlegen</Button>
        </Group>
      </Card>

      <StatusBox status={status} />
    </Stack>
  );
}

function ColumnsTable({
  columns,
  onChange
}: {
  columns: ExportColumn[];
  onChange: (cols: ExportColumn[]) => void;
}): JSX.Element {
  const update = (idx: number, patch: Partial<ExportColumn>): void =>
    onChange(columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const move = (idx: number, dir: -1 | 1): void => {
    const next = [...columns];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };
  const remove = (idx: number): void => {
    if (!confirm('Spalte wirklich entfernen?')) return;
    onChange(columns.filter((_, i) => i !== idx));
  };
  const add = (): void => onChange([...columns, { header: '', from_field: '' }]);

  return (
    <div>
      <Text size="sm" fw={600} mb="xs">Spalten</Text>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>#</Table.Th>
            <Table.Th>Header (sichtbar in der Datei)</Table.Th>
            <Table.Th>Quellfeld (Engine)</Table.Th>
            <Table.Th>Formatter</Table.Th>
            <Table.Th w={120}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {columns.map((c, i) => (
            <Table.Tr key={i}>
              <Table.Td><Text size="xs" c="dimmed">{i + 1}</Text></Table.Td>
              <Table.Td>
                <TextInput size="xs" value={c.header} onChange={(e) => update(i, { header: e.currentTarget.value })} />
              </Table.Td>
              <Table.Td>
                <TextInput size="xs" ff="monospace" value={c.from_field} onChange={(e) => update(i, { from_field: e.currentTarget.value })} />
              </Table.Td>
              <Table.Td>
                <Select size="xs" data={COLUMN_FORMAT_OPTIONS} value={c.format ?? ''} allowDeselect={false}
                  onChange={(v) => update(i, { format: (v === '' ? undefined : (v as ColumnFormat)) })} />
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon size="xs" variant="default" onClick={() => move(i, -1)} disabled={i === 0}><IconArrowUp size={14} /></ActionIcon>
                  <ActionIcon size="xs" variant="default" onClick={() => move(i, 1)} disabled={i === columns.length - 1}><IconArrowDown size={14} /></ActionIcon>
                  <ActionIcon size="xs" variant="subtle" color="red" onClick={() => remove(i)}><IconX size={14} /></ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Button mt="xs" size="xs" variant="light" onClick={add} leftSection={<IconPlus size={14} />}>Spalte hinzufügen</Button>
    </div>
  );
}
