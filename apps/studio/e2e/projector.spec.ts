// Send to projector against a simulated second screen: headless Chrome is given two screens (--screen-info), the
// laptop's and a projector's to its right, and the page may place windows (the Window Management permission,
// granted as the presenter grants it the first time). The console's Send to projector then opens the audience
// window on the projector, filling it, and the two windows keep in step. A real projector stays a hand check:
// this proves the placement and the link, not the projector's own display.
import { expect, test } from '@playwright/test';
import { allowWindowPlacement, openConsole, PROJECTOR, screens } from './screens.ts';

test.use(
  screens('{0,0 1440x900}', `{${PROJECTOR.left},${PROJECTOR.top} ${PROJECTOR.width}x${PROJECTOR.height}}`),
);

test('Send to projector opens the audience window filling the second screen, and the two keep in step', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await allowWindowPlacement(context, page);
  await page.goto('/?example');
  const found = await page.evaluate(async () => {
    const w = window as unknown as {
      getScreenDetails(): Promise<{ screens: { availLeft: number; availWidth: number }[] }>;
    };
    const details = await w.getScreenDetails();
    return details.screens.map((s) => ({ left: s.availLeft, width: s.availWidth }));
  });
  expect(found).toEqual([
    { left: 0, width: 1440 },
    { left: PROJECTOR.left, width: PROJECTOR.width },
  ]);
  const console_ = await openConsole(page);
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    console_.getByRole('button', { name: 'Send to projector' }).click(),
  ]);
  await expect(
    console_.getByText('Audience window opened on the projector.', { exact: false }),
  ).toBeVisible();
  await expect(audience).toHaveURL(/audience\.html\?show=[0-9a-f]{8}/);
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  // Where it opened: on the projector, filling it.
  const placed = await audience.evaluate(() => ({
    left: window.screenX,
    top: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight,
  }));
  expect(placed).toEqual(PROJECTOR);
  await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
    timeout: 10_000,
  });
  await page.keyboard.press('PageDown');
  await expect.poll(() => audience.evaluate(() => decodeURIComponent(location.hash))).toBe('#S01.1');
});
