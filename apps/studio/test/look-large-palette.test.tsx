// A palette too large to check by hand in the Look panel: valid, used in full by the map, but neither
// checked pair by pair nor drawn swatch by swatch there, so the panel stays quick.
import { createProject, type Project } from '@loopweft/model';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { CHECKED_COLOURS } from '../src/map/look-panel.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore } from '../src/state/store.ts';

const checked = vi.hoisted(() => [] as number[]);
vi.mock('@loopweft/render', async (original) => {
  const actual = await original<typeof import('@loopweft/render')>();
  return {
    ...actual,
    checkPalette: (colours: readonly string[], base: Parameters<typeof actual.checkPalette>[1]) => {
      checked.push(colours.length);
      return actual.checkPalette(colours, base);
    },
  };
});

describe('a large palette in the Look panel', () => {
  it('is not checked or drawn in full, chosen or not, and the map keeps every colour', async () => {
    const project: Project = createProject({ title: 'Many colours' });
    const many = Array.from({ length: 2000 }, () => '#336699');
    project.theme.palettes = [
      { id: 'many', name: 'Many', colours: many },
      { id: 'many_too', name: 'Many too', colours: [...many] },
    ];
    project.theme.palette = 'many';
    const store = createStudioStore(project, { name: 'many.loopweft' });
    render(<App store={store} recovery={memoryRecovery()} env="test" />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Look' }));

    expect(checked.length).toBeGreaterThan(0);
    expect(Math.max(...checked)).toBeLessThanOrEqual(CHECKED_COLOURS);
    for (const name of [/^Many(?! too)/, /^Many too/]) {
      const card = screen.getByRole('radio', { name }).closest('.lw-palette');
      expect(card?.textContent).toContain(
        `Not checked: 2000 colours, more than the ${CHECKED_COLOURS} checked here.`,
      );
      expect(card?.textContent).toContain(`and ${2000 - CHECKED_COLOURS} more colours`);
      expect(card?.querySelectorAll('.mantine-ColorSwatch-root')).toHaveLength(CHECKED_COLOURS);
    }
    // The chosen one is edited as text, not colour by colour.
    expect(screen.queryByRole('textbox', { name: 'Colour 1' })).toBeNull();
    expect(
      screen.getByText('2000 colours: too many to edit one by one here. Edit them as text, below.'),
    ).toBeTruthy();
    expect(store.getState().project.theme.palettes?.[0]?.colours).toHaveLength(2000);
  });
});
