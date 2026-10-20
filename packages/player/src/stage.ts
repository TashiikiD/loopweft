// Source: PolycrisisPresentation src/audience/audience.ts (its render) @ 3e5da10 (private): how a change of
// the show moves the stage. Taken out of the audience window so the console's live preview moves the same way.
import type { Motion } from '@loopweft/motion';
import type { StoryView, Transition } from '@loopweft/render';
import { renderMode } from './chrome.ts';
import { type Deck, type Pos, prevPos, sceneAt, stepAt } from './deck.ts';
import type { ChangeReason } from './session.ts';
import type { ShowState } from './show.ts';

export interface StageDriverOptions {
  story: StoryView;
  motion: Motion;
  deck: Deck;
  /** The element that blacks the stage out, if this stage shows the blackout. */
  blackout?: HTMLElement;
}

/** A function that moves a story view to each new show state. */
export function stageDriver(
  o: StageDriverOptions,
): (next: ShowState, prev: ShowState | null, reason: ChangeReason) => void {
  const index = (pos: Pos) => sceneAt(o.deck, pos).index;
  return (next, prev, reason) => {
    if (o.deck.scenes.length === 0) return;
    const mode = renderMode(next, prev, reason);
    if (prev && next.skipToken !== prev.skipToken && reason !== 'sync') o.motion.landAll();
    o.motion.setPaused(next.paused);
    o.blackout?.classList.toggle('on', next.blackout);
    o.story.setLowPower(next.lowPower);
    o.story.setCategoryWords(next.categoryWords);
    // Blackout, pause or skip alone must not restart or snap the map.
    const moved = !prev || prev.pos.s !== next.pos.s || prev.pos.b !== next.pos.b;
    if (!moved && mode !== 'replay') return;
    if (mode === 'replay') {
      // Back to the step before at once (before the very first step, an empty stage), then this one again.
      const before = prevPos(o.deck, next.pos);
      if (before) o.story.show(index(before), before.b, 'instant');
      else
        o.story.showStep(
          sceneAt(o.deck, next.pos),
          undefined,
          { ...stepAt(o.deck, next.pos).step, map: { show: false }, overlays: [] },
          'instant',
        );
    }
    const transition: Transition =
      mode === 'instant' ? 'instant' : mode === 'forward' || mode === 'replay' ? 'smooth' : 'quick';
    o.story.show(index(next.pos), next.pos.b, transition);
  };
}
