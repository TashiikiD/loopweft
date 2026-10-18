// The panel beside the canvas or the table, with a rail to switch it: the inspector, the shorthand box, the
// map's types and its look, its layout, its loops and the what-if ripple.
import { Tabs } from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconCursorText,
  IconLayoutDashboard,
  IconPalette,
  IconRepeat,
  IconRipple,
  IconTags,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Inspector } from './inspector.tsx';
import { LayoutPanel } from './layout-panel.tsx';
import { LookPanel } from './look-panel.tsx';
import { LoopsPanel } from './loops-panel.tsx';
import { RipplePanel } from './ripple-panel.tsx';
import { ShorthandPanel } from './shorthand.tsx';
import { TypesPanel } from './types-panel.tsx';

const PANELS = [
  { id: 'inspector', label: 'Inspector', Icon: IconAdjustmentsHorizontal, Panel: Inspector },
  { id: 'shorthand', label: 'Shorthand', Icon: IconCursorText, Panel: ShorthandPanel },
  { id: 'types', label: 'Types', Icon: IconTags, Panel: TypesPanel },
  { id: 'look', label: 'Look', Icon: IconPalette, Panel: LookPanel },
  { id: 'layout', label: 'Layout', Icon: IconLayoutDashboard, Panel: LayoutPanel },
  { id: 'loops', label: 'Loops', Icon: IconRepeat, Panel: LoopsPanel },
  { id: 'ripple', label: 'Ripple', Icon: IconRipple, Panel: RipplePanel },
] as const;

export type PanelId = (typeof PANELS)[number]['id'];

export function SidePanel() {
  const [panel, setPanel] = useState<PanelId>('inspector');
  return (
    <aside className="lw-side" aria-label="Side panel">
      <Tabs
        value={panel}
        onChange={(value) => value && setPanel(value as PanelId)}
        orientation="vertical"
        placement="right"
        keepMounted={false}
        classNames={{ root: 'lw-side-tabs', list: 'lw-rail', tab: 'lw-rail-tab', panel: 'lw-side-panel' }}
      >
        <Tabs.List aria-label="Panels">
          {PANELS.map(({ id, label, Icon }) => (
            <Tabs.Tab key={id} value={id} leftSection={<Icon size={20} stroke={1.6} aria-hidden />}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {PANELS.map(({ id, Panel }) => (
          <Tabs.Panel key={id} value={id}>
            <Panel />
          </Tabs.Panel>
        ))}
      </Tabs>
    </aside>
  );
}
