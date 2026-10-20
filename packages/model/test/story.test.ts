import { describe, expect, it } from 'vitest';
import { readProject, type Scene, sceneNumbers } from '../src/index.ts';
import { repoFile } from './helpers.ts';

const scene = (captions: boolean[]): Pick<Scene, 'steps'> => ({
  steps: captions.map((caption, i) => ({
    id: String(i + 1),
    label: `Step ${i + 1}`,
    map: {},
    overlays: caption ? [{ type: 'caption' }] : [],
  })),
});

describe('sceneNumbers', () => {
  it('counts the scenes that show a caption from 1, and numbers no other scene', () => {
    expect(sceneNumbers([scene([false]), scene([true, true]), scene([false, true]), scene([])])).toEqual([
      undefined,
      1,
      2,
      undefined,
    ]);
  });

  it('starts a story that opens with a captioned scene at 1', () => {
    expect(sceneNumbers([scene([true]), scene([true])])).toEqual([1, 2]);
  });

  it("keeps the example's numbers: the title scene has none, S01 to S10 are 1 to 10", () => {
    const result = readProject(repoFile('examples/polycrisis.loopweft'));
    if (!result.ok) throw new Error('The example does not open');
    const scenes = result.project.story.scenes;
    const numbers = sceneNumbers(scenes);
    expect(scenes.map((s, i) => `${s.id}=${numbers[i] ?? '-'}`)).toEqual([
      'S00=-',
      'S01=1',
      'S02=2',
      'S03=3',
      'S04=4',
      'S05=5',
      'S06=6',
      'S07=7',
      'S08=8',
      'S09=9',
      'S10=10',
    ]);
  });
});
