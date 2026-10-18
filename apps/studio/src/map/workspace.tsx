// The Map workspace: the canvas, with the inspector beside it.
import { Canvas } from './canvas.tsx';
import { Inspector } from './inspector.tsx';

export function MapWorkspace() {
  return (
    <div className="lw-workspace">
      <Canvas />
      <aside className="lw-side" aria-label="Inspector">
        <Inspector />
      </aside>
    </div>
  );
}
