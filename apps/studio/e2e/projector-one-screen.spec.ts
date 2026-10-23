// Send to projector with one screen: it says only one screen was found (and how to extend the desktop onto a
// projector), and opens no window.
import { expect, test } from '@playwright/test';
import { allowWindowPlacement, openConsole, screens } from './screens.ts';

test.use(screens('{0,0 1440x900}'));

test('Send to projector says only one screen was found, and opens nothing', async ({ page, context }) => {
  await allowWindowPlacement(context, page);
  const console_ = await openConsole(page);
  let opened = false;
  context.on('page', () => {
    opened = true;
  });
  await console_.getByRole('button', { name: 'Send to projector' }).click();
  await expect(console_.getByText('Only one screen found.', { exact: false })).toBeVisible();
  expect(opened).toBe(false);
});
