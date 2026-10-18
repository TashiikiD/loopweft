import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  // Visible focus for keyboard users only.
  focusRing: 'auto',
  fontFamily: "'Inter Variable', Inter, 'Segoe UI', system-ui, sans-serif",
  headings: { fontFamily: "'Fraunces Variable', Fraunces, Georgia, serif" },
});

/** Mantine (light or dark, as the system has it) and its notifications. */
export function Providers({ children, env = 'default' }: { children: ReactNode; env?: 'default' | 'test' }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" env={env}>
      <Notifications position="bottom-right" limit={4} />
      {children}
    </MantineProvider>
  );
}
