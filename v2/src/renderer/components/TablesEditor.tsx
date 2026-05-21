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
import type { EditableTable } from '../../shared/ipc-contract';
import { EditableTitle } from './EditableTitle';

export function TablesEditor(): JSX.Element {
  const [tables, setTables] = useState<Record<string, EditableTable> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('lade …');
  const [dirty, setDirty] = useState(false);
  const [newRowKey, setNewRowKey] = useState('');
  const [newColName, setNewColName] = useState('');

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async (): Promise<void> => {
    const r = await window.api.loadTables();
    if (r.ok && r.data) {
      setTables(r.data);
      setDirty(false);
      const names = Object.keys(r.data);
      if (selected === null || !names.includes(selected)) setSelected(names[0] ?? null);
      setStatus('');
    } else {
      setStatus(`Fehler: ${r.error}`);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!tables) return;
    setStatus('Speichere …');
    const r = await window.api.saveTables(tables);
    if (r.ok) {
      setDirty(false);
      setStatus(`✓ Gespeichert: ${r.filePath}`);
    } else {
      setStatus(`Fehler beim Speichern:\n${r.error}`);
    }
  };

  const updateTable = (name: string, mutator: (t: EditableTable) => EditableTable): void => {
    if (!tables) return;
    setTables({ ...tables, [name]: mutator(tables[name]!) });
    setDirty(true);
  };

  const setCell = (key: string, col: string, value: string): void => {
    if (!selected) return;
    updateTable(selected, (t) => ({
      ...t,
      rows: { ...t.rows, [key]: { ...t.rows[key], [col]: value } }
    }));
  };

  const renameRowKey = (oldKey: string, newKey: string): void => {
    if (!selected) return;
    updateTable(selected, (t) => {
      const { [oldKey]: rowData, ...rest } = t.rows;
      return { ...t, rows: { ...rest, [newKey]: rowData! } };
    });
  };

  const renameTable = (oldName: string, newName: string): void => {
    if (!tables || newName === oldName || newName in tables) return;
    const { [oldName]: t, ...rest } = tables;
    setTables({ ...rest, [newName]: t! });
    setSelected(newName);
    setDirty(true);
  };

  const deleteRow = (key: string): void => {
    if (!selected) return;
    if (!confirm(`Zeile "${key}" wirklich entfernen?`)) return;
    updateTable(selected, (t) => {
      const next = { ...t.rows };
      delete next[key];
      return { ...t, rows: next };
    });
  };

  const addRow = (): void => {
    if (!selected) return;
    const key = newRowKey.trim();
    if (!key) return;
    updateTable(selected, (t) => {
      if (t.rows[key]) return t;
      const empty: Record<string, string> = {};
      for (const c of t.columns) empty[c] = '';
      return { ...t, rows: { ...t.rows, [key]: empty } };
    });
    setNewRowKey('');
  };

  const addColumn = (): void => {
    if (!selected) return;
    const col = newColName.trim();
    if (!col) return;
    updateTable(selected, (t) => (t.columns.includes(col) ? t : { ...t, columns: [...t.columns, col] }));
    setNewColName('');
  };

  const deleteColumn = (col: string): void => {
    if (!selected) return;
    if (!confirm(`Spalte "${col}" wirklich entfernen?`)) return;
    updateTable(selected, (t) => {
      const newColumns = t.columns.filter((c) => c !== col);
      const newRows: typeof t.rows = {};
      for (const [k, row] of Object.entries(t.rows)) {
        const { [col]: _, ...rest } = row;
        newRows[k] = rest;
      }
      return { ...t, columns: newColumns, rows: newRows };
    });
  };

  const tableNames = useMemo(() => (tables ? Object.keys(tables).sort() : []), [tables]);
  const current = selected && tables ? tables[selected] : null;

  if (!tables) return <Text>{status}</Text>;
  const isError = status.toLowerCase().includes('fehler');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" pb="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <div>
          <Title order={2}>Tabellen</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Einschlüssel-Lookup-Tabellen. Werte werden beim Speichern automatisch typisiert.
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
          <Text size="sm" fw={600}>Tabellen</Text>
          {tableNames.map((n) => (
            <Button key={n} variant={n === selected ? 'light' : 'subtle'} color="indigo"
              fullWidth justify="flex-start" size="xs" ff="monospace"
              onClick={() => setSelected(n)}>
              {n}
            </Button>
          ))}
          <Alert color="gray" mt="sm" p="xs">
            <Text size="xs">Tabellen anlegen/löschen geht aktuell nur via Erweitert-Tab.</Text>
          </Alert>
        </Stack>

        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          {current && selected && (
            <>
              <EditableTitle
                value={selected}
                onChange={(n) => renameTable(selected, n)}
                validate={(n) => (tables[n] && n !== selected ? `Tabelle "${n}" existiert bereits.` : null)}
                order={3}
              />

              <ScrollArea h={500}>
                <Table withTableBorder withColumnBorders stickyHeader striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Schlüssel</Table.Th>
                      {current.columns.map((c) => (
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
                    {Object.entries(current.rows).map(([key, row]) => (
                      <Table.Tr key={key}>
                        <Table.Td>
                          <TextInput defaultValue={key} size="xs" ff="monospace"
                            onBlur={(e) => renameRowKey(key, e.currentTarget.value)} />
                        </Table.Td>
                        {current.columns.map((c) => (
                          <Table.Td key={c}>
                            <TextInput value={String(row[c] ?? '')} size="xs"
                              onChange={(e) => setCell(key, c, e.currentTarget.value)} />
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <ActionIcon variant="subtle" color="red" onClick={() => deleteRow(key)} aria-label="Zeile entfernen">
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
                <TextInput placeholder="Spaltenname" value={newColName}
                  onChange={(e) => setNewColName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addColumn()} style={{ flex: 1 }} size="xs" />
                <Button size="xs" onClick={addColumn} disabled={!newColName.trim()} leftSection={<IconPlus size={14} />}>Spalte</Button>
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
