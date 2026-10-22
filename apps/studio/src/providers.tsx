import { createTheme, Drawer, MantineProvider, Modal, Notification } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { createContext, type ReactNode } from 'react';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  // Visible focus for keyboard users only.
  focusRing: 'auto',
  fontFamily: "'Inter Variable', Inter, 'Segoe UI', system-ui, sans-serif",
  headings: { fontFamily: "'Fraunces Variable', Fraunces, Georgia, serif" },
  // Every × says what it does: a screen reader would otherwise announce only "button".
  components: {
    Modal: Modal.extend({ defaultProps: { closeButtonProps: { 'aria-label': 'Close' } } }),
    Drawer: Drawer.extend({ defaultProps: { closeButtonProps: { 'aria-label': 'Close' } } }),
    Notification: Notification.extend({ defaultProps: { closeButtonProps: { 'aria-label': 'Close' } } }),
  },
});

export type StudioEnv = 'default' | 'test';

/** `test` in component tests (jsdom), where nothing has a size: the table then draws every row. */
export const StudioEnvContext = createContext<StudioEnv>('default');

/** Mantine (light or dark, as the system has it) and its notifications. */
export function Providers({ children, env = 'default' }: { children: ReactNode; env?: StudioEnv }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" env={env}>
      <StudioEnvContext.Provider value={env}>
        <Notifications position="bottom-right" limit={4} />
        {children}
      </StudioEnvContext.Provider>
    </MantineProvider>
  );
}
