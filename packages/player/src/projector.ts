// Source: PolycrisisPresentation src/presenter/projector.ts @ 3e5da10 (private), adapted for Loopweft: the
// audience window's address and name are given (one window name per presentation), and the window opened is
// handed back so the console can talk to it directly.
//
// Opening the audience window, straight onto the projector where the browser can place windows (Chrome and
// Edge, through the Window Management API). Everything falls back to "open a window, drag it over, press F".

interface ScreenDetailed {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isInternal?: boolean;
}

interface ScreenDetails {
  screens: ScreenDetailed[];
  currentScreen: ScreenDetailed;
}

type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

export type ProjectorResult =
  | 'opened'
  | 'permission-granted'
  | 'single-screen'
  | 'unsupported'
  | 'denied'
  | 'blocked';

export interface AudienceTarget {
  /** The audience window's address. */
  url: string;
  /** Its window name: opening it again reuses the same window. */
  name: string;
}

export function openAudienceWindow(win: Window, target: AudienceTarget): Window | null {
  return win.open(target.url, target.name, 'popup,width=1280,height=720');
}

async function permissionState(win: Window): Promise<PermissionState | 'unknown'> {
  for (const name of ['window-management', 'window-placement']) {
    try {
      const status = await win.navigator.permissions.query({ name: name as PermissionName });
      return status.state;
    } catch {
      // A name this browser does not know: try the older one.
    }
  }
  return 'unknown';
}

/**
 * Opens the audience window filling the other screen. The first use asks for permission (the browser's
 * question takes the click, so the presenter clicks again); after that it opens in one click.
 */
export async function sendToProjector(
  win: Window,
  target: AudienceTarget,
): Promise<{ result: ProjectorResult; window: Window | null }> {
  const w = win as WindowWithScreens;
  if (typeof w.getScreenDetails !== 'function') return { result: 'unsupported', window: null };
  const state = await permissionState(win);
  if (state === 'denied') return { result: 'denied', window: null };
  let details: ScreenDetails;
  try {
    details = await w.getScreenDetails();
  } catch {
    return { result: 'denied', window: null };
  }
  if (state === 'prompt') return { result: 'permission-granted', window: null };
  const others = details.screens.filter((s) => s !== details.currentScreen);
  const screen = others.find((s) => s.isInternal === false) ?? others[0];
  if (!screen) return { result: 'single-screen', window: null };
  const features = [
    'popup',
    `left=${screen.availLeft}`,
    `top=${screen.availTop}`,
    `width=${screen.availWidth}`,
    `height=${screen.availHeight}`,
  ].join(',');
  const opened = win.open(target.url, target.name, features);
  return { result: opened ? 'opened' : 'blocked', window: opened };
}

export const PROJECTOR_MESSAGES: Record<ProjectorResult, string> = {
  opened: 'Audience window opened on the projector. Click it once, then press F for full screen.',
  'permission-granted': 'Screen access granted. Click “Send to projector” again.',
  'single-screen': 'Only one screen found. Connect the projector and choose “Extend” (Windows key + P).',
  unsupported: 'This browser cannot place windows. Use “Open audience window” and drag it to the projector.',
  denied: 'Screen access was refused. Use “Open audience window” and drag it to the projector.',
  blocked: 'The browser blocked the new window. Allow pop-ups for this page, then try again.',
};
