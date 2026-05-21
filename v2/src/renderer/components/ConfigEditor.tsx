import React, { useEffect, useMemo, useState } from 'react';
import type { ConfigFileId } from '../../shared/ipc-contract';

/**
 * Universal YAML editor for all eight config files. Each save triggers
 * both the file-specific Zod schema check and the full cross-reference
 * check against the other files currently on disk.
 *
 * For tables.yaml / matrices.yaml the dedicated form editors are the
 * preferred way; this editor is the power-user fallback.
 */

const FILES: { id: ConfigFileId; label: string; hint: string }[] = [
  { id: 'classes', label: 'classes.yaml', hint: 'Klassifikations-Regeln (§1)' },
  { id: 'extraction', label: 'extraction.yaml', hint: 'Feldextraktion + Transformationen (§2/§3)' },
  { id: 'tables', label: 'tables.yaml', hint: 'Einschlüssel-Tabellen (§4.1) — auch via Tabellen-Tab editierbar' },
  { id: 'matrices', label: 'matrices.yaml', hint: 'Zweischlüssel-Matrizen (§4.2) — auch via Matrizen-Tab editierbar' },
  { id: 'pipeline', label: 'pipeline.yaml', hint: 'Step-Listen pro Klasse (§5/§6)' },
  { id: 'registries', label: 'registries.yaml', hint: 'Wiederverwendbare Listen (§8)' },
  { id: 'validation', label: 'validation.yaml', hint: 'Validierungsregeln (§7/§10)' },
  { id: 'export', label: 'export.yaml', hint: 'Export-Profile (§9)' }
];

export function ConfigEditor(): JSX.Element {
  const [selected, setSelected] = useState<ConfigFileId>('classes');
  const [content, setContent] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [status, setStatus] = useState<string>('lade …');
  const [busy, setBusy] = useState(false);

  // Load whenever the selected file changes
  useEffect(() => {
    setBusy(true);
    setStatus('lade …');
    window.api.loadConfigFile(selected).then((r) => {
      setBusy(false);
      if (r.ok && r.content !== undefined) {
        setContent(r.content);
        setSavedContent(r.content);
        setStatus(`${selected}.yaml geladen.`);
      } else {
        setStatus(`Fehler: ${r.error}`);
      }
    });
  }, [selected]);

  const dirty = content !== savedContent;

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setStatus('Speichere …');
    const r = await window.api.saveConfigFile({ id: selected, content });
    setBusy(false);
    if (r.ok) {
      setSavedContent(content);
      setStatus(`✓ Gespeichert: ${r.filePath}`);
    } else {
      setStatus(`Fehler beim Speichern:\n${r.error}`);
    }
  };

  const onReload = (): void => {
    setBusy(true);
    setStatus('lade …');
    window.api.loadConfigFile(selected).then((r) => {
      setBusy(false);
      if (r.ok && r.content !== undefined) {
        setContent(r.content);
        setSavedContent(r.content);
        setStatus(`${selected}.yaml neu geladen.`);
      }
    });
  };

  const currentFile = useMemo(() => FILES.find((f) => f.id === selected)!, [selected]);
  const isError = status.startsWith('Fehler');

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <aside style={{ width: 240, borderRight: '1px solid #eee', paddingRight: 12 }}>
        <h3 style={{ marginTop: 0 }}>Dateien</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {FILES.map((f) => (
            <li key={f.id} style={{ marginBottom: 4 }}>
              <button
                onClick={() => {
                  if (dirty && !confirm('Ungespeicherte Änderungen — verwerfen?')) return;
                  setSelected(f.id);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  background: f.id === selected ? '#e8f0fe' : 'transparent',
                  border: '1px solid ' + (f.id === selected ? '#4a90e2' : 'transparent'),
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#777' }}>{f.hint}</div>
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16, padding: 8, background: '#fff5e0', borderRadius: 4, fontSize: 11, color: '#774400' }}>
          ⚠ Beim Speichern werden Schema- und Querverweis-Validierung ausgeführt. Kommentare in der YAML gehen beim Speichern verloren — nur die Daten bleiben.
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'monospace' }}>{currentFile.label}</h3>
          <div>
            <button onClick={onReload} disabled={busy} style={{ marginRight: 8 }}>
              Neu laden
            </button>
            <button
              onClick={onSave}
              disabled={busy || !dirty}
              style={{
                fontWeight: 'bold',
                background: dirty ? '#4a90e2' : '#ccc',
                color: 'white',
                padding: '6px 16px',
                border: 'none',
                borderRadius: 4,
                cursor: dirty ? 'pointer' : 'default'
              }}
            >
              Speichern{dirty ? ' *' : ''}
            </button>
          </div>
        </div>

        <textarea
          className="raw-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 500,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 13,
            padding: 12,
            border: '1px solid #ccc',
            borderRadius: 4,
            background: '#fafafa',
            tabSize: 2,
            resize: 'vertical'
          }}
        />

        <pre
          style={{
            marginTop: 8,
            padding: 8,
            background: isError ? '#fde8e8' : '#e8f5e8',
            border: '1px solid ' + (isError ? '#f5a5a5' : '#a5d5a5'),
            borderRadius: 4,
            fontSize: 12,
            color: isError ? '#900' : '#063',
            whiteSpace: 'pre-wrap',
            margin: '8px 0 0'
          }}
        >
          {status}
        </pre>
      </main>
    </div>
  );
}
