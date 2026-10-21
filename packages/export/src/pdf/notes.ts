// The speaker notes as a PDF, as the polycrisis talk's notes were: each scene on a page of its own, with its
// number and title, its headline, its target time and when it starts in the talk, and the slides it covers;
// its steps, each with its slide number, cue and due time; the speaker notes; the script with "▶ 23" where a
// key press brings up slide 23 (the slides PDF has one page per step, in this order); and its sources. Only
// what the project holds is shown: no heading for notes a scene does not have.
import { type Project, sceneSources, scriptSegments } from '@loopweft/model';
import { deckOf, fmt, sceneTag } from '@loopweft/player';
import { type DocumentPdfOptions, makePdf, type PdfResult } from './document.ts';
import { markdownBlocks } from './markdown.ts';
import { type Block, INK, type Inline, para, run } from './typeset.ts';

const BODY = 11.5;

const label = (text: string): Block =>
  para({
    inlines: [run(text.toUpperCase(), 'sansBold', 8.5, INK.muted)],
    before: 10,
    after: 3,
    keepWithNext: true,
  });

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The blocks of the speaker notes. */
export function notesBlocks(project: Project): Block[] {
  const deck = deckOf(project);
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const scripts = deck.scenes.some((s) => s.scene.script?.trim());
  const blocks: Block[] = [];

  const intro: Inline[][] = [
    [
      { chip: '12', size: 9.5 },
      run(
        'marks where slide 12 of the slides PDF comes up: it has one page per step, in this order.',
        'sans',
        9.5,
        INK.muted,
      ),
    ],
    [
      run(
        `Each scene starts a new page, with its steps${project.story.scenes.some((s) => s.notes?.trim()) ? ', its speaker notes' : ''}${scripts ? ', its script' : ''} and its sources. The full references are in the references PDF.`,
        'sans',
        9.5,
        INK.muted,
      ),
    ],
  ];
  blocks.push(para({ inlines: [run(project.meta.title, 'sansBold', 20, INK.text)], after: 2 }));
  blocks.push(para({ inlines: [run('Speaker notes', 'sans', 13, INK.heading)], after: 4 }));
  const byline = [project.meta.author, project.meta.course].filter(Boolean).join(' · ');
  if (byline) blocks.push(para({ inlines: [run(byline, 'sans', 10, INK.muted)], after: 2 }));
  for (const inlines of intro) blocks.push(para({ inlines, after: 1 }));
  blocks.push({ kind: 'rule', before: 6, after: 14 });

  let slide = 0;
  const firstSlide = deck.scenes.map((scene) => {
    const at = slide + 1;
    slide += scene.steps.length;
    return at;
  });

  deck.scenes.forEach((dscene, k) => {
    const scene = dscene.scene;
    const first = firstSlide[k] as number;
    const last = first + dscene.steps.length - 1;
    if (k > 0) blocks.push({ kind: 'page' });
    const heading =
      dscene.number === undefined ? dscene.title : `Scene ${sceneTag(dscene)} · ${dscene.title}`;
    blocks.push({ kind: 'bookmark', title: heading });
    blocks.push(para({ inlines: [run(heading, 'sansBold', 16, INK.heading)], after: 2, keepWithNext: true }));
    if (dscene.headline)
      blocks.push(para({ inlines: [run(dscene.headline, 'serifItalic', 12.5)], after: 2 }));
    const slides = first === last ? `Slide ${first}` : `Slides ${first}–${last}`;
    const timing =
      dscene.targetSeconds > 0
        ? `${fmt(dscene.targetSeconds)} of the talk (${fmt(dscene.clockStart)} to ${fmt(dscene.clockEnd)})`
        : 'untimed';
    blocks.push(para({ inlines: [run(`${slides} · ${timing}`, 'sans', 9.5, INK.muted)], after: 2 }));

    blocks.push(label(plural(dscene.steps.length, 'Step', 'Steps')));
    dscene.steps.forEach((dstep, i) => {
      const step = dstep.step;
      const inlines: Inline[] = [
        { chip: String(first + i), size: 10 },
        run(dstep.key, 'sansBold', 10),
        run(` · ${step.label}`, 'sans', 10),
      ];
      if (step.at !== undefined) inlines.push(run(` (due at ${fmt(step.at)})`, 'sans', 10, INK.muted));
      blocks.push(para({ inlines, indent: 0, hanging: 0, after: step.cue ? 0 : 3, leading: 1.5 }));
      if (step.cue) blocks.push(para({ inlines: [run(step.cue, 'serif', 10.5)], indent: 30, after: 4 }));
    });

    if (scene.notes?.trim()) {
      blocks.push(label('Speaker notes'));
      blocks.push(...markdownBlocks(scene.notes, BODY));
    }

    if (scene.script?.trim()) {
      blocks.push(label('Script'));
      const segments = scriptSegments(scene.script);
      const next = firstSlide[k + 1];
      const inlines: Inline[] = [];
      segments.forEach((text, i) => {
        if (text.trim()) inlines.push(run(text.trim(), 'serif', BODY));
        if (i === segments.length - 1) return;
        // Mark n brings up the scene's step n + 1; the one after the last step moves on to the next scene.
        const target =
          i + 1 < dscene.steps.length ? first + i + 1 : i + 1 === dscene.steps.length ? next : undefined;
        inlines.push({ chip: target === undefined ? '' : String(target), size: BODY });
      });
      blocks.push(para({ inlines, after: 4, leading: 1.6 }));
    }

    const ids = sceneSources(project, scene);
    if (ids.length) {
      blocks.push(label(plural(ids.length, 'Source', 'Sources')));
      const names = ids.map((id) => sources.get(id)?.label ?? id);
      blocks.push(para({ inlines: [run(names.join(' · '), 'sans', 10, INK.text)], after: 2 }));
    }
  });
  return blocks;
}

/** The speaker notes PDF of a project. */
export function notesPdf(project: Project, options: DocumentPdfOptions): Promise<PdfResult> {
  return makePdf(project, notesBlocks(project), {
    ...options,
    subject: 'Speaker notes',
    footer: `${project.meta.title} · speaker notes`,
  });
}
