// Send to projector with one screen: it says only one screen was found (and how to extend the desktop onto a
// projector), and opens no window.
import { expect, test } from '@playwright/test';
import { allowWindowPlacement, openConsole, screens } from './screens.ts';

test.use(screens('{0,0 1440x900}'));

test('Send to projector says only one screen was found, and opens nothing', async ({ page, context }) => {
  await allowWindowPlacement(context, page);
  const console_ = await openConsole(page);
  // Any attempt to open a window is marked the moment it is made (a new page's event comes only once it starts
  // loading, too late to be sure of), and still opens it.
  await page.evaluate(() => {
    const open = window.open.bind(window);
    window.open = (...args) => {
      document.documentElement.dataset.popupAttempted = 'true';
      return open(...args);
    };
  });
  let opened = false;
  context.on('page', () => {
    opened = true;
  });
  await console_.getByRole('button', { name: 'Send to projector' }).click();
  // The whole message: what is wrong, and how to put the desktop onto a projector.
  await expect(console_.locator('.lp-toast')).toHaveText(
    'Only one screen found. Connect the projector and choose “Extend” (Windows key + P).',
  );
  await expect(page.locator('html')).not.toHaveAttribute('data-popup-attempted', 'true');
  expect(opened).toBe(false);
});
