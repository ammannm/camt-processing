import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import type { PreviewRow, PreviewSummary, ProfileInfo } from '../../shared/ipc-contract';

type Filter = 'all' | 'errors' | 'valid';

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return String(v);
  return String(v);
}

export function PipelinePage(): JSX.Element {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Bereit. Datei wählen oder per Drag-&-Drop ablegen.');
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});

  const [outputs, setOutputs] = useState<
    Array<{ profile: string; bucket: string; rowCount: number; filePath?: string }>
  >([]);

  useEffect(() => {
    window.api.listProfiles().then((p) => {
      setProfiles(p);
      setSelected(new Set(p.map((x) => x.name)));
    });
  }, []);

  const setInput = (p: string): void => {
    setInputPath(p);
    setStatus('Eingangsdatei gewählt — bereit für Vorschau.');
    setPreviewRows(null);
    setPreviewSummary(null);
    setEdits({});
    setOutputs([]);
  };

  const onChooseInput = async (): Promise<void> => {
    const p = await window.api.chooseInputFile();
    if (p) setInput(p);
  };

  const onChooseOutput = async (): Promise<void> => {
    const p = await window.api.chooseOutputFile();
    if (p) {
      setOutputPath(p);
      setStatus('Ausgabedatei gewählt.');
    }
  };

  const onPreview = async (): Promise<void> => {
    if (!inputPath) return;
    setRunning(true);
    setStatus('Vorschau wird erzeugt …');
    setExpanded(null);
    setEdits({});
    const resp = await window.api.previewRun(inputPath);
    setRunning(false);
    if (resp.ok && resp.rows && resp.summary) {
      setPreviewRows(resp.rows);
      setPreviewSummary(resp.summary);
      setStatus(`Vorschau bereit — ${resp.summary.total} Zeilen, davon ${resp.summary.withErrors} mit Hinweisen.`);
    } else {
      setStatus(`Fehler: ${resp.error}`);
    }
  };

  const onRun = async (): Promise<void> => {
    if (!outputPath || selected.size === 0) return;
    setRunning(true);
    setOutputs([]);

    let resp;
    if (previewRows) {
      setStatus('Export läuft (mit Vorschau-Daten) …');
      const rowsToExport = previewRows.map((r, idx) => {
        const ed = edits[idx];
        if (!ed) return r;
        return { ...r, fields: { ...r.fields, ...ed } };
      });
      resp = await window.api.exportPreviewedRows({
        rows: rowsToExport,
        outputFilePath: outputPath,
        profiles: Array.from(selected)
      });
    } else {
      if (!inputPath) return;
      setStatus('Export läuft …');
      resp = await window.api.runPipeline({
        inputFilePath: inputPath,
        outputFilePath: outputPath,
        profiles: Array.from(selected)
      });
    }

    setRunning(false);
    if (resp.ok && resp.summary) {
      const s = resp.summary;
      setOutputs(s.outputs);
      const written = s.outputs.filter((o) => o.filePath).length;
      const editCount = Object.keys(edits).length;
      const editNote = editCount > 0 ? ` (mit ${editCount} manuellen Korrektur(en))` : '';
      setStatus(`✓ Fertig — ${s.exportedRows} Zeilen in ${written} Datei(en) exportiert${editNote}.`);
    } else {
      setStatus(`Fehler: ${resp.error}`);
    }
  };

  const toggleProfile = (name: string): void => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const filePath = (file as File & { path?: string }).path;
    if (filePath && filePath.toLowerCase().endsWith('.xml')) setInput(filePath);
    else setStatus('Bitte nur .xml-Dateien per Drag-&-Drop ablegen.');
  };

  const getCell = (idx: number, fieldName: string, fallback: unknown): string => {
    const ed = edits[idx];
    if (ed && fieldName in ed) return ed[fieldName] ?? '';
    return fmt(fallback);
  };
  const setCell = (idx: number, fieldName: string, value: string): void => {
    setEdits((prev) => ({ ...prev, [idx]: { ...prev[idx], [fieldName]: value } }));
  };

  const filteredRows = useMemo((): { row: PreviewRow; idx: number }[] => {
    if (!previewRows) return [];
    return previewRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) =>
        filter === 'all' ? true :
        filter === 'errors' ? row.errors.length > 0 :
        row.errors.length === 0
      );
  }, [previewRows, filter]);

  const canExport = outputPath !== null && selected.size > 0 && !running && (previewRows !== null || inputPath !== null);
  const editCount = Object.keys(edits).length;
  const isError = status.toLowerCase().includes('fehler');
  const isSuccess = status.startsWith('✓');

  return (
    <Stack gap="xl" p="lg">
      {/* ----- Step 1: input ----- */}
      <Stack gap="md">
        <StepHeader number={1} title="Eingangsdatei" />
        <Box
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? 'var(--mantine-color-indigo-5)' : 'var(--mantine-color-gray-4)'}`,
            borderRadius: 8,
            padding: 32,
            textAlign: 'center',
            background: dragging ? 'var(--mantine-color-indigo-0)' : 'var(--mantine-color-gray-0)',
            transition: 'all 150ms'
          }}
        >
          <Text size="xl" mb="xs">📄</Text>
          <Text size="sm" c="dimmed" mb="md">
            XML-Datei hier ablegen oder
          </Text>
          <Button variant="default" onClick={onChooseInput}>Datei auswählen</Button>
          {inputPath && (
            <Code block mt="md" style={{ background: 'transparent', textAlign: 'left' }}>
              {inputPath}
            </Code>
          )}
        </Box>
      </Stack>

      {/* ----- Step 2: preview ----- */}
      <Stack gap="md">
        <StepHeader number={2} title="Vorschau" aside={
          <Button color="indigo" onClick={onPreview} disabled={!inputPath || running}>
            Vorschau erzeugen
          </Button>
        } />

        {previewSummary && (
          <Stack gap="md">
            <Card withBorder p="md">
              <Group gap="xl">
                <Stat label="Total" value={previewSummary.total} />
                <Stat label="Mit Hinweisen" value={previewSummary.withErrors}
                  color={previewSummary.withErrors > 0 ? 'red' : 'green'} />
                <Box style={{ flex: 1 }}>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>Pro Klasse</Text>
                  <Group gap="xs">
                    {Object.entries(previewSummary.byClass).map(([k, v]) => (
                      <Badge key={k} variant="light" color="gray">
                        <Code>{k}</Code> · {v}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              </Group>
            </Card>

            <Group justify="space-between" wrap="wrap">
              <SegmentedControl
                value={filter}
                onChange={(v) => setFilter(v as Filter)}
                data={[
                  { value: 'all', label: 'Alle' },
                  { value: 'errors', label: 'Nur mit Hinweisen' },
                  { value: 'valid', label: 'Nur sauber' }
                ]}
              />
              {editCount > 0 ? (
                <Group gap="xs">
                  <Badge color="yellow" variant="light">
                    ✎ {editCount} Zeile(n) bearbeitet
                  </Badge>
                  <Button size="xs" variant="default" onClick={() => setEdits({})}>
                    Korrekturen verwerfen
                  </Button>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  Tipp: Konto-Felder und Text in der Tabelle sind editierbar
                </Text>
              )}
            </Group>

            <Card withBorder p={0}>
              <ScrollArea h={480}>
                <Table striped highlightOnHover stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40}>#</Table.Th>
                      <Table.Th>Klasse</Table.Th>
                      <Table.Th>Datum</Table.Th>
                      <Table.Th w={90}>Soll</Table.Th>
                      <Table.Th w={90}>Haben</Table.Th>
                      <Table.Th w={100} style={{ textAlign: 'right' }}>Betrag</Table.Th>
                      <Table.Th>Text</Table.Th>
                      <Table.Th>Hinweis</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredRows.map(({ row, idx }) => {
                      const hasErr = row.errors.length > 0;
                      const isEdited = edits[idx] !== undefined;
                      const isOpen = expanded === idx;
                      const rowStyle: React.CSSProperties = isEdited
                        ? { background: 'var(--mantine-color-yellow-1)' }
                        : hasErr
                        ? { background: 'var(--mantine-color-red-0)' }
                        : {};
                      return (
                        <React.Fragment key={idx}>
                          <Table.Tr style={rowStyle}>
                            <Table.Td onClick={() => setExpanded(isOpen ? null : idx)} style={{ cursor: 'pointer' }}>
                              <Text size="xs" c="dimmed">{idx + 1}</Text>
                            </Table.Td>
                            <Table.Td><Code>{row.classKey}</Code></Table.Td>
                            <Table.Td><Text size="xs">{fmt(row.sourceFields.booking_date)}</Text></Table.Td>
                            <Table.Td>
                              <TextInput size="xs" variant="unstyled" ff="monospace"
                                value={getCell(idx, 'out_debit', row.fields.out_debit)}
                                onChange={(e) => setCell(idx, 'out_debit', e.currentTarget.value)} />
                            </Table.Td>
                            <Table.Td>
                              <TextInput size="xs" variant="unstyled" ff="monospace"
                                value={getCell(idx, 'out_credit', row.fields.out_credit)}
                                onChange={(e) => setCell(idx, 'out_credit', e.currentTarget.value)} />
                            </Table.Td>
                            <Table.Td>
                              <TextInput size="xs" variant="unstyled" ff="monospace" ta="right"
                                value={getCell(idx, 'out_amount', row.fields.out_amount ?? row.sourceFields.amount)}
                                onChange={(e) => setCell(idx, 'out_amount', e.currentTarget.value)} />
                            </Table.Td>
                            <Table.Td style={{ maxWidth: 240 }}>
                              <TextInput size="xs" variant="unstyled"
                                value={getCell(idx, 'out_text', row.fields.out_text)}
                                onChange={(e) => setCell(idx, 'out_text', e.currentTarget.value)}
                                title={fmt(row.fields.out_text)} />
                            </Table.Td>
                            <Table.Td onClick={() => setExpanded(isOpen ? null : idx)}
                              style={{ cursor: 'pointer', maxWidth: 280 }}>
                              {row.errors.length > 0 && (
                                <Text size="xs" c="red" lineClamp={1}
                                  title={row.errors.map((e) => e.message).join('; ')}>
                                  ⚠ {row.errors[0]!.message}
                                  {row.errors.length > 1 && ` (+${row.errors.length - 1})`}
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                          {isOpen && (
                            <Table.Tr style={{ background: 'var(--mantine-color-gray-1)' }}>
                              <Table.Td colSpan={8} style={{ padding: 16 }}>
                                <Stack gap="xs">
                                  <Group gap="xs">
                                    <Text size="xs" fw={600}>Original-Text:</Text>
                                    <Code block style={{ flex: 1 }}>{fmt(row.sourceFields.source_text)}</Code>
                                  </Group>
                                  {row.errors.length > 0 && (
                                    <div>
                                      <Text size="xs" fw={600} c="red" mb={4}>Hinweise:</Text>
                                      <Stack gap={2} pl="md">
                                        {row.errors.map((e, i) => (
                                          <Text size="xs" c="red" key={i}>
                                            {e.field && <Code>{e.field}</Code>}: {e.message}
                                          </Text>
                                        ))}
                                      </Stack>
                                    </div>
                                  )}
                                  <Group gap="xs">
                                    <Text size="xs" fw={600}>Felder:</Text>
                                    <Code block style={{ flex: 1, fontSize: 10 }}>{JSON.stringify(row.fields, null, 0)}</Code>
                                  </Group>
                                </Stack>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
          </Stack>
        )}
      </Stack>

      {/* ----- Step 3: export ----- */}
      <Stack gap="md">
        <StepHeader number={3} title="Export" />
        <Group grow align="stretch">
          <Card withBorder p="md">
            <Text size="sm" fw={600} mb="xs">Ausgabedatei</Text>
            <Button variant="default" onClick={onChooseOutput} mb="sm">Datei wählen …</Button>
            {outputPath && <Code block style={{ background: 'transparent', fontSize: 11 }}>{outputPath}</Code>}
          </Card>
          <Card withBorder p="md">
            <Text size="sm" fw={600} mb="xs">Profile</Text>
            {profiles.length === 0 ? (
              <Text size="xs" c="dimmed">Keine Profile konfiguriert.</Text>
            ) : (
              <Stack gap={6}>
                {profiles.map((p) => (
                  <Checkbox key={p.name}
                    checked={selected.has(p.name)}
                    onChange={() => toggleProfile(p.name)}
                    label={
                      <span>
                        <Text component="span" size="sm" fw={500}>{p.name}</Text>{' '}
                        <Badge size="xs" variant="default">{p.format}</Badge>
                        {p.description && <Text component="span" size="xs" c="dimmed" ml={6}>· {p.description}</Text>}
                      </span>
                    } />
                ))}
              </Stack>
            )}
          </Card>
        </Group>

        <Group justify="flex-end">
          <Button size="md" color="indigo" onClick={onRun} disabled={!canExport}>
            Verarbeitung starten
          </Button>
        </Group>
      </Stack>

      {/* ----- status ----- */}
      <Alert color={isError ? 'red' : isSuccess ? 'green' : 'gray'}
        title={isError ? 'Fehler' : isSuccess ? 'Fertig' : 'Status'}>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{status}</Text>
      </Alert>

      {/* ----- output files ----- */}
      {outputs.length > 0 && (
        <Stack gap="xs">
          <Title order={3}>Erzeugte Dateien</Title>
          {outputs.map((o, i) => (
            <Card key={i} withBorder p="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="sm" fw={600}>{o.profile}</Text>
                  {o.bucket && <Badge size="xs" variant="default">{o.bucket}</Badge>}
                  <Text size="xs" c="dimmed">· {o.rowCount} Zeile(n)</Text>
                </Group>
                {o.filePath ? (
                  <Code style={{ fontSize: 11 }}>{o.filePath}</Code>
                ) : (
                  <Text size="xs" c="dimmed">leer</Text>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function StepHeader({ number, title, aside }: { number: number; title: string; aside?: React.ReactNode }): JSX.Element {
  return (
    <Group justify="space-between" align="center">
      <Group gap="md">
        <ThemeIcon size={32} radius="xl" color="indigo" variant="light">{number}</ThemeIcon>
        <Title order={2}>{title}</Title>
      </Group>
      {aside}
    </Group>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }): JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">{label}</Text>
      <Text size="xl" fw={700} c={color}>{value}</Text>
    </div>
  );
}
