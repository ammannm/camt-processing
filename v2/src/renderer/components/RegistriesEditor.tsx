import React, { useState } from 'react';
import { ActionIcon, Button, Group, List, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { Card, EditorHeader, StatusBox, useYamlConfig } from './form-helpers';
import { EditableTitle } from './EditableTitle';

interface RegistriesData {
  registries: Record<string, string[]>;
}
const EMPTY: RegistriesData = { registries: {} };

export function RegistriesEditor(): JSX.Element {
  const { data, setData, dirty, status, busy, refresh, save } = useYamlConfig<RegistriesData>('registries', EMPTY);
  const [newListName, setNewListName] = useState('');

  if (!data) return <Text>{status}</Text>;

  const regs = data.registries ?? {};
  const names = Object.keys(regs);

  const updateList = (name: string, items: string[]): void => {
    setData({ registries: { ...regs, [name]: items } });
  };
  const renameList = (oldName: string, newName: string): void => {
    if (newName === oldName || newName in regs) return;
    const { [oldName]: items, ...rest } = regs;
    setData({ registries: { ...rest, [newName]: items! } });
  };
  const removeList = (name: string): void => {
    if (!confirm(`Liste "${name}" wirklich entfernen?`)) return;
    const { [name]: _, ...rest } = regs;
    setData({ registries: rest });
  };
  const addList = (): void => {
    const n = newListName.trim();
    if (!n || n in regs) return;
    setData({ registries: { ...regs, [n]: [] } });
    setNewListName('');
  };

  return (
    <Stack gap="md">
      <EditorHeader
        title="Wiederverwendbare Listen"
        subtitle="Benannte String-Listen. Werden z.B. zum Erkennen anonymisierter Wortanfänge benutzt."
        dirty={dirty}
        busy={busy}
        onSave={save}
        onReload={refresh}
      />

      {names.map((name) => (
        <Card key={name}>
          <Group justify="space-between" mb="sm">
            <EditableTitle
              value={name}
              onChange={(n) => renameList(name, n)}
              validate={(n) => (n in regs && n !== name ? `Liste "${n}" existiert bereits.` : null)}
            />
            <Tooltip label="Liste entfernen">
              <ActionIcon color="red" variant="light" onClick={() => removeList(name)} aria-label="Liste entfernen">
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <ListEditor items={regs[name] ?? []} onChange={(items) => updateList(name, items)} />
        </Card>
      ))}

      <Card>
        <Group>
          <TextInput
            placeholder="Name der neuen Liste"
            value={newListName}
            onChange={(e) => setNewListName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && addList()}
            style={{ flex: 1 }}
          />
          <Button onClick={addList} disabled={!newListName.trim()} leftSection={<IconPlus size={14} />}>
            Liste anlegen
          </Button>
        </Group>
      </Card>

      <StatusBox status={status} />
    </Stack>
  );
}

/**
 * List editor: each item is a row with a delete-X. New items are added
 * via a dedicated input row that resets after each commit.
 */
function ListEditor({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }): JSX.Element {
  const [draft, setDraft] = useState('');

  const updateItem = (idx: number, value: string): void => {
    onChange(items.map((it, i) => (i === idx ? value : it)));
  };
  const removeItem = (idx: number): void => {
    if (!confirm(`Eintrag "${items[idx] ?? ''}" wirklich entfernen?`)) return;
    onChange(items.filter((_, i) => i !== idx));
  };
  const addItem = (): void => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  };

  return (
    <Stack gap={4}>
      {items.length === 0 && (
        <Text size="xs" c="dimmed">
          Noch keine Einträge.
        </Text>
      )}
      {items.map((item, idx) => (
        <Group key={idx} gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" w={24}>
            {idx + 1}.
          </Text>
          <TextInput
            value={item}
            onChange={(e) => updateItem(idx, e.currentTarget.value)}
            style={{ flex: 1 }}
            size="xs"
          />
          <ActionIcon variant="subtle" color="red" onClick={() => removeItem(idx)} aria-label="Eintrag entfernen">
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Group gap="xs" wrap="nowrap" mt="xs">
        <Text size="xs" c="dimmed" w={24}>
          +
        </Text>
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="Neuen Eintrag eingeben und Enter drücken"
          style={{ flex: 1 }}
          size="xs"
        />
        <ActionIcon variant="filled" color="indigo" onClick={addItem} disabled={!draft.trim()} aria-label="Hinzufügen">
          <IconCheck size={14} />
        </ActionIcon>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        {items.length} Eintrag/Einträge
      </Text>
    </Stack>
  );
}
