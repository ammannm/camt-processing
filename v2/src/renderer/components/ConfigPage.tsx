import React from 'react';
import { Box, Tabs } from '@mantine/core';
import { ClassesEditor } from './ClassesEditor';
import { ExtractionEditor } from './ExtractionEditor';
import { TablesEditor } from './TablesEditor';
import { MatricesEditor } from './MatricesEditor';
import { PipelineEditor } from './PipelineEditor';
import { RegistriesEditor } from './RegistriesEditor';
import { ValidationEditor } from './ValidationEditor';
import { ExportProfilesEditor } from './ExportProfilesEditor';
import { ConfigEditor } from './ConfigEditor';

const ENTRIES = [
  { id: 'classes', label: 'Klassen', hint: 'Welche Eingangszeilen welcher Klasse zugeordnet werden' },
  { id: 'extraction', label: 'Extraktion', hint: 'Welche Felder pro Klasse aus dem Text extrahiert werden' },
  { id: 'pipeline', label: 'Pipeline', hint: 'Schritte pro Klasse — wie aus den Feldern die Buchung wird' },
  { id: 'tables', label: 'Tabellen', hint: 'Einschlüssel-Lookup-Tabellen' },
  { id: 'matrices', label: 'Matrizen', hint: 'Zweischlüssel-Matrizen' },
  { id: 'registries', label: 'Listen', hint: 'Wiederverwendbare String-Listen' },
  { id: 'validation', label: 'Validierung', hint: 'Qualitätsregeln für die Output-Zeilen' },
  { id: 'export', label: 'Export', hint: 'Profile mit Format und Spalten' },
  { id: 'advanced', label: 'Erweitert', hint: 'Direkter YAML-Editor (Power-User)' }
] as const;

export function ConfigPage(): JSX.Element {
  return (
    <Tabs
      defaultValue="classes"
      orientation="horizontal"
      keepMounted={false}
      styles={{
        list: {
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'var(--mantine-color-body)',
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          paddingLeft: 'var(--mantine-spacing-lg)',
          paddingRight: 'var(--mantine-spacing-lg)'
        },
        tab: {
          fontSize: 15,
          fontWeight: 500,
          padding: '14px 20px'
        },
        panel: {
          paddingLeft: 'var(--mantine-spacing-lg)',
          paddingRight: 'var(--mantine-spacing-lg)',
          paddingBottom: 'var(--mantine-spacing-lg)'
        }
      }}
    >
      <Tabs.List>
        {ENTRIES.map((e) => (
          <Tabs.Tab key={e.id} value={e.id} title={e.hint}>
            {e.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Box>
        <Tabs.Panel value="classes"><ClassesEditor /></Tabs.Panel>
        <Tabs.Panel value="extraction"><ExtractionEditor /></Tabs.Panel>
        <Tabs.Panel value="pipeline"><PipelineEditor /></Tabs.Panel>
        <Tabs.Panel value="tables"><TablesEditor /></Tabs.Panel>
        <Tabs.Panel value="matrices"><MatricesEditor /></Tabs.Panel>
        <Tabs.Panel value="registries"><RegistriesEditor /></Tabs.Panel>
        <Tabs.Panel value="validation"><ValidationEditor /></Tabs.Panel>
        <Tabs.Panel value="export"><ExportProfilesEditor /></Tabs.Panel>
        <Tabs.Panel value="advanced"><ConfigEditor /></Tabs.Panel>
      </Box>
    </Tabs>
  );
}
