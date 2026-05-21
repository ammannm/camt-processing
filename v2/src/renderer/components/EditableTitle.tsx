import React, { useEffect, useState } from 'react';
import { ActionIcon, Group, TextInput, Title, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

/**
 * View/edit toggle for a renamable key. Shows the value as a heading with
 * a pencil icon. Clicking the pencil swaps the heading for a TextInput
 * with Check/Cancel actions. Save commits via onChange.
 */
export function EditableTitle({
  value,
  onChange,
  order = 4,
  placeholder,
  mono = true,
  validate
}: {
  value: string;
  onChange: (next: string) => void;
  order?: 1 | 2 | 3 | 4 | 5 | 6;
  placeholder?: string;
  mono?: boolean;
  /** Return error message or null. Called on submit. */
  validate?: (next: string) => string | null;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setError(null);
      return;
    }
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    onChange(trimmed);
    setEditing(false);
    setError(null);
  };
  const cancel = (): void => {
    setDraft(value);
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <TextInput
          value={draft}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
            setError(null);
          }}
          placeholder={placeholder}
          autoFocus
          error={error}
          styles={{ input: { fontFamily: mono ? 'ui-monospace, monospace' : undefined, fontWeight: 600 } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          style={{ minWidth: 240 }}
        />
        <Tooltip label="Speichern (Enter)">
          <ActionIcon variant="filled" color="indigo" onClick={commit}>
            <IconCheck size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Abbrechen (Esc)">
          <ActionIcon variant="default" onClick={cancel}>
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Group gap="xs" align="center">
      <Title order={order} style={{ fontFamily: mono ? 'ui-monospace, monospace' : undefined, margin: 0 }}>
        {value || <span style={{ color: '#94a3b8' }}>{placeholder ?? '(unbenannt)'}</span>}
      </Title>
      <Tooltip label="Umbenennen">
        <ActionIcon variant="subtle" size="sm" onClick={() => setEditing(true)} aria-label="Umbenennen">
          ✎
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
