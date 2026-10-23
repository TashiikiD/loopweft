// What the Send to projector tests share: screens given to headless Chrome (--screen-info), the permission to
// place windows, and the presenter console of the example.
import { type BrowserContext, expect, type Page } from '@playwright/test';
import { findBrowser } from '../../../tools/chrome.ts';

// The laptop at 1440 × 900, a 1920 × 1080 projector to its right.
export const PROJECTOR = { left: 1440, top: 0, width: 1920, height: 1080 };
/** Options that give the browser these screens, each `{left,top widthxheight}`. */
export const screens = (...list: string[]) => ({
  launchOptions: { executablePath: findBrowser(), args: [`--screen-info=${list.join('')}`] },
});

/** Lets the page place windows, as the presenter allows it the first time, in this test's own browser context. */
export async function allowWindowPlacement(context: BrowserContext, page: Page) {
  const { targetInfo } = await (await context.newCDPSession(page)).send('Target.getTargetInfo');
  const cdp = await context.browser()?.newBrowserCDPSession();
  await cdp?.send('Browser.setPermission', {
    permission: { name: 'window-management' },
    setting: 'granted',
    origin: 'http://localhost:5181',
    browserContextId: targetInfo.browserContextId,
  });
}

/** The example's presenter console, opened from the Present workspace. */
export async function openConsole(page: Page) {
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 1 of 1 · S00\.1/);
  return console_;
}
