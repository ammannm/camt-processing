import React, { useCallback, useEffect, useState } from 'react';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Alert, Button, Card as MCard, Group, Stack, Text, Title } from '@mantine/core';
import type { ConfigFileId } from '../../shared/ipc-contract';

/**
 * Shared load/save lifecycle hook for form editors.
 */
export function useYamlConfig<T>(id: ConfigFileId, emptyDefault: T) {
  const [data, setData] = useState<T | null>(null);
  const [savedData, setSavedData] = useState<T | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    setStatus('lade …');
    const r = await window.api.loadConfigFile(id);
    setBusy(false);
    if (r.ok && r.content !== undefined) {
      const parsed = (r.content.trim() === '' ? emptyDefault : parseYaml(r.content)) as T;
      setData(parsed);
      setSavedData(parsed);
      setStatus('');
    } else {
      setStatus(`Fehler: ${r.error}`);
    }
  }, [id, emptyDefault]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (): Promise<boolean> => {
    if (data === null) return false;
    setBusy(true);
    setStatus('speichere …');
    const content = stringifyYaml(data);
    const r = await window.api.saveConfigFile({ id, content });
    setBusy(false);
    if (r.ok) {
      setSavedData(data);
      setStatus(`✓ Gespeichert: ${r.filePath}`);
      return true;
    }
    setStatus(`Fehler beim Speichern:\n${r.error}`);
    return false;
  }, [data, id]);

  const dirty =
    data !== null && savedData !== null && JSON.stringify(data) !== JSON.stringify(savedData);

  return { data, setData, dirty, status, busy, refresh, save };
}

// ---------- UI primitives ----------

export function EditorHeader({
  title,
  subtitle,
  dirty,
  busy,
  onSave,
  onReload
}: {
  title: string;
  subtitle?: string;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onReload: () => void;
}): JSX.Element {
  return (
    <Group
      justify="space-between"
      align="flex-start"
      mb="md"
      style={{
        position: 'sticky',
        top: 49,
        zIndex: 20,
        background: 'var(--mantine-color-body)',
        borderBottom: '1px solid var(--mantine-color-gray-3)',
        marginInline: 'calc(-1 * var(--mantine-spacing-lg))',
        paddingInline: 'var(--mantine-spacing-lg)',
        paddingBlock: 'var(--mantine-spacing-md)'
      }}
    >
      <Stack gap={4}>
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Stack>
      <Group gap="xs">
        <Button variant="default" onClick={onReload} disabled={busy}>
          Neu laden
        </Button>
        <Button color="indigo" onClick={onSave} disabled={busy || !dirty}>
          {dirty ? 'Änderungen speichern' : 'Gespeichert'}
        </Button>
      </Group>
    </Group>
  );
}

export function StatusBox({ status }: { status: string }): JSX.Element | null {
  if (!status) return null;
  const isError = status.toLowerCase().includes('fehler');
  const isSuccess = status.startsWith('✓');
  return (
    <Alert
      color={isError ? 'red' : isSuccess ? 'green' : 'gray'}
      mt="md"
      title={isError ? 'Fehler' : isSuccess ? 'Erfolg' : 'Status'}
      withCloseButton={false}
    >
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {status}
      </Text>
    </Alert>
  );
}

export function Card({
  children,
  style
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <MCard withBorder shadow="xs" radius="md" padding="md" mb="sm" style={style}>
      {children}
    </MCard>
  );
}

/** Legacy alias kept for components that still reference these. Mantine
 *  inputs/buttons render themselves; these stay as no-op style objects so
 *  imports don't break during migration. */
export const inp: React.CSSProperties = {};
export const sel: React.CSSProperties = {};
export const smallBtn: React.CSSProperties = {};
export const dangerBtn: React.CSSProperties = {};

/** No-op field wrapper kept for backwards compatibility; new editors
 *  should use Mantine's built-in label support on TextInput/Select etc. */
export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <Text component="label" size="sm" fw={600} display="block" mb={4}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      )}
    </div>
  );
}
