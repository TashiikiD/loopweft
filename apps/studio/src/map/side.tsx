// The panel beside the canvas or the table, with a rail to switch it: the inspector, and the shorthand box.
import { Tabs } from '@mantine/core';
import { IconAdjustmentsHorizontal, IconCursorText } from '@tabler/icons-react';
import { useState } from 'react';
import { Inspector } from './inspector.tsx';
import { ShorthandPanel } from './shorthand.tsx';

const PANELS = [
  { id: 'inspector', label: 'Inspector', Icon: IconAdjustmentsHorizontal },
  { id: 'shorthand', label: 'Shorthand', Icon: IconCursorText },
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
        <Tabs.Panel value="inspector">
          <Inspector />
        </Tabs.Panel>
        <Tabs.Panel value="shorthand">
          <ShorthandPanel />
        </Tabs.Panel>
      </Tabs>
    </aside>
  );
}
