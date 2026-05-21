import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import './styles/styles.css';
import { AppShell, Group, MantineProvider, NavLink, Stack, Text, Title, createTheme } from '@mantine/core';
import { IconPlayerPlayFilled, IconSettings } from '@tabler/icons-react';
import { PipelinePage } from './components/PipelinePage';
import { ConfigPage } from './components/ConfigPage';

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.2' },
      h2: { fontSize: '20px', lineHeight: '1.3' },
      h3: { fontSize: '16px', lineHeight: '1.4' }
    }
  }
});

type View = 'pipeline' | 'config';

function App(): JSX.Element {
  const [view, setView] = useState<View>('pipeline');

  return (
    <AppShell navbar={{ width: 240, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar p="md">
        <Stack gap={4} mb="lg">
          <Title order={3}>CAMT Konverter</Title>
          <Text c="dimmed" size="xs">v2 · konfigurationsgetrieben</Text>
        </Stack>
        <Stack gap={4}>
          <NavLink
            label="Verarbeitung"
            leftSection={<IconPlayerPlayFilled size={18} />}
            active={view === 'pipeline'}
            onClick={() => setView('pipeline')}
            variant="filled"
          />
          <NavLink
            label="Konfiguration"
            leftSection={<IconSettings size={18} />}
            active={view === 'config'}
            onClick={() => setView('config')}
            variant="filled"
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        {view === 'pipeline' ? <PipelinePage /> : <ConfigPage />}
      </AppShell.Main>
    </AppShell>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <MantineProvider theme={theme}>
    <App />
  </MantineProvider>
);
