// The Map workspace: the map as a canvas or as a table, with the side panel beside it.
import { SegmentedControl } from '@mantine/core';
import { useRef, useState } from 'react';
import { TableView } from '../table/table-view.tsx';
import { Canvas, type CanvasMemory } from './canvas.tsx';
import { SidePanel } from './side.tsx';

type View = 'canvas' | 'table';

export function MapWorkspace() {
  const [view, setView] = useState<View>('canvas');
  // The canvas's pan and zoom, kept while the table is shown.
  const memory = useRef<CanvasMemory | null>(null);
  const switcher = (
    <SegmentedControl
      size="xs"
      value={view}
      onChange={(value) => setView(value as View)}
      data={[
        { value: 'canvas', label: 'Canvas' },
        { value: 'table', label: 'Table' },
      ]}
      aria-label="Show the map as"
    />
  );
  return (
    <div className="lw-workspace">
      <div className="lw-view">
        {view === 'canvas' ? (
          <>
            <div className="lw-viewbar">{switcher}</div>
            <Canvas memory={memory} />
          </>
        ) : (
          <TableView switcher={switcher} />
        )}
      </div>
      <SidePanel />
    </div>
  );
}
