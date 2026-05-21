import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import type { EditableMatrix } from '../../shared/ipc-contract';
import { EditableTitle } from './EditableTitle';

export function MatricesEditor(): JSX.Element {
  const [matrices, setMatrices] = useState<Record<string, EditableMatrix> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('lade …');
  const [dirty, setDirty] = useState(false);
  const [newRowKey, setNewRowKey] = useState('');
  const [newColKey, setNewColKey] = useState('');

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async (): Promise<void> => {
    const r = await window.api.loadMatrices();
    if (r.ok && r.data) {
      setMatrices(r.data);
      setDirty(false);
      const names = Object.keys(r.data);
      if (selected === null || !names.includes(selected)) setSelected(names[0] ?? null);
      setStatus('');
    } else {
      setStatus(`Fehler: ${r.error}`);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!matrices) return;
    setStatus('Speichere …');
    const r = await window.api.saveMatrices(matrices);
    if (r.ok) {
      setDirty(false);
      setStatus(`✓ Gespeichert: ${r.filePath}`);
    } else {
      setStatus(`Fehler beim Speichern:\n${r.error}`);
    }
  };

  const updateMatrix = (name: string, mutator: (m: EditableMatrix) => EditableMatrix): void => {
    if (!matrices) return;
    setMatrices({ ...matrices, [name]: mutator(matrices[name]!) });
    setDirty(true);
  };

  const renameMatrix = (oldName: string, newName: string): void => {
    if (!matrices || newName === oldName || newName in matrices) return;
    const { [oldName]: m, ...rest } = matrices;
    setMatrices({ ...rest, [newName]: m! });
    setSelected(newName);
    setDirty(true);
  };

  const columnKeys = useMemo((): string[] => {
    if (!selected || !matrices) return [];
    const m = matrices[selected];
    if (!m) return [];
    const cols = new Set<string>();
    for (const row of Object.values(m.cells)) for (const c of Object.keys(row)) cols.add(c);
    return Array.from(cols);
  }, [matrices, selected]);

  const setCell = (rowKey: string, colKey: string, value: string): void => {
    if (!selected) return;
    updateMatrix(selected, (m) => ({
      ...m,
      cells: { ...m.cells, [rowKey]: { ...(m.cells[rowKey] ?? {}), [colKey]: value } }
    }));
  };

  const renameRowKey = (oldKey: string, newKey: string): void => {
    if (!selected) return;
    updateMatrix(selected, (m) => {
      const { [oldKey]: row, ...rest } = m.cells;
      return { ...m, cells: { ...rest, [newKey]: row! } };
    });
  };

  const deleteRow = (key: string): void => {
    if (!selected) return;
    if (!confirm(`Zeile "${key}" wirklich entfernen?`)) return;
    updateMatrix(selected, (m) => {
      const next = { ...m.cells };
      delete next[key];
      return { ...m, cells: next };
    });
  };

  const addRow = (): void => {
    if (!selected || !newRowKey.trim()) return;
    const key = newRowKey.trim();
    updateMatrix(selected, (m) => {
      if (m.cells[key]) return m;
      const empty: Record<string, string> = {};
      for (const c of columnKeys) empty[c] = '';
      return { ...m, cells: { ...m.cells, [key]: empty } };
    });
    setNewRowKey('');
  };

  const addColumn = (): void => {
    if (!selected) return;
    const col = newColKey.trim();
    if (!col || columnKeys.includes(col)) return;
    updateMatrix(selected, (m) => {
      const newCells: typeof m.cells = {};
      for (const [k, row] of Object.entries(m.cells)) newCells[k] = { ...row, [col]: '' };
      return { ...m, cells: newCells };
    });
    setNewColKey('');
  };

  const deleteColumn = (col: string): void => {
    if (!selected) return;
    if (!confirm(`Spalte "${col}" wirklich entfernen?`)) return;
    updateMatrix(selected, (m) => {
      const newCells: typeof m.cells = {};
      for (const [k, row] of Object.entries(m.cells)) {
        const { [col]: _, ...rest } = row;
        newCells[k] = rest;
      }
      return { ...m, cells: newCells };
    });
  };

  const matrixNames = useMemo(() => (matrices ? Object.keys(matrices).sort() : []), [matrices]);
  const current = selected && matrices ? matrices[selected] : null;

  if (!matrices) return <Text>{status}</Text>;
  const isError = status.toLowerCase().includes('fehler');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" pb="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <div>
          <Title order={2}>Matrizen</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Zweischlüssel-Lookups (Zeile × Spalte → Wert).
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" onClick={refresh}>Neu laden</Button>
          <Button color="indigo" onClick={onSave} disabled={!dirty}>
            {dirty ? 'Änderungen speichern' : 'Gespeichert'}
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="xs" style={{ width: 240, flexShrink: 0 }}>
          <Text size="sm" fw={600}>Matrizen</Text>
          {matrixNames.map((n) => (
            <Button key={n} variant={n === selected ? 'light' : 'subtle'} color="indigo"
              fullWidth justify="flex-start" size="xs" ff="monospace"
              onClick={() => setSelected(n)}>
              {n}
            </Button>
          ))}
        </Stack>

        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          {current && selected && (
            <>
              <EditableTitle
                value={selected}
                onChange={(n) => renameMatrix(selected, n)}
                validate={(n) => (matrices[n] && n !== selected ? `Matrix "${n}" existiert bereits.` : null)}
                order={3}
              />
              {(current.row_label || current.col_label) && (
                <Text size="xs" c="dimmed">
                  Zeilen-Label: <code>{current.row_label ?? '—'}</code> · Spalten-Label: <code>{current.col_label ?? '—'}</code>
                </Text>
              )}

              <ScrollArea h={500}>
                <Table withTableBorder withColumnBorders stickyHeader striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Zeile</Table.Th>
                      {columnKeys.map((c) => (
                        <Table.Th key={c}>
                          <Group gap={4} justify="space-between">
                            <Text size="xs" fw={600}>{c}</Text>
                            <ActionIcon size="xs" variant="subtle" color="red" onClick={() => deleteColumn(c)} aria-label={`Spalte ${c} entfernen`}>
                              <IconX size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Th>
                      ))}
                      <Table.Th w={50}></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {Object.entries(current.cells).map(([rowKey, row]) => (
                      <Table.Tr key={rowKey}>
                        <Table.Td>
                          <TextInput defaultValue={rowKey} size="xs" ff="monospace"
                            onBlur={(e) => renameRowKey(rowKey, e.currentTarget.value)} />
                        </Table.Td>
                        {columnKeys.map((c) => (
                          <Table.Td key={c}>
                            <TextInput value={String(row[c] ?? '')} size="xs"
                              onChange={(e) => setCell(rowKey, c, e.currentTarget.value)} />
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <ActionIcon variant="subtle" color="red" onClick={() => deleteRow(rowKey)} aria-label="Zeile entfernen">
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              <Group>
                <TextInput placeholder="Schlüssel für neue Zeile" value={newRowKey}
                  onChange={(e) => setNewRowKey(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addRow()} style={{ flex: 1 }} size="xs" />
                <Button size="xs" onClick={addRow} disabled={!newRowKey.trim()} leftSection={<IconPlus size={14} />}>Zeile</Button>
                <TextInput placeholder="Spalten-Schlüssel" value={newColKey}
                  onChange={(e) => setNewColKey(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addColumn()} style={{ flex: 1 }} size="xs" />
                <Button size="xs" onClick={addColumn} disabled={!newColKey.trim()} leftSection={<IconPlus size={14} />}>Spalte</Button>
              </Group>
            </>
          )}
        </Stack>
      </Group>

      {status && (
        <Alert color={isError ? 'red' : status.startsWith('✓') ? 'green' : 'gray'} title={isError ? 'Fehler' : 'Status'}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{status}</Text>
        </Alert>
      )}
    </Stack>
  );
}
