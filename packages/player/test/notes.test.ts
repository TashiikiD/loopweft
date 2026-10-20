import { describe, expect, it } from 'vitest';
import {
  deckOf,
  type MdNode,
  nextLine,
  PresentationStore,
  PresenterClock,
  paceText,
  parseMarkdown,
  sceneName,
} from '../src/index.ts';
import { example, MemoryStorage } from './helpers.ts';

const project = example();
const deck = deckOf(project);

/** The tree as a short string: tags in brackets, text as it is. */
const show = (nodes: MdNode[]): string =>
  nodes
    .map((n) =>
      typeof n === 'string' ? n : `<${n.tag}${n.href ? ` ${n.href}` : ''}>${show(n.children)}</${n.tag}>`,
    )
    .join('');

describe('speaker notes in Markdown', () => {
  it('reads paragraphs, headings, bold, italics, code and links', () => {
    expect(
      show(parseMarkdown('# Key facts\n\nA **bold** and *quiet* line\nthat goes on, with `code`.')),
    ).toBe(
      '<h3>Key facts</h3><p>A <strong>bold</strong> and <em>quiet</em> line that goes on, with <code>code</code>.</p>',
    );
    expect(
      show(parseMarkdown('See [the paper](https://doi.org/10.1/x) and [this](javascript:alert(1)).')),
    ).toBe('<p>See <a https://doi.org/10.1/x>the paper</a> and [this](javascript:alert(1)).</p>');
  });

  it('reads lists, nested by indent, with continuation lines, and numbered ones', () => {
    expect(
      show(
        parseMarkdown('- one\n  more of one\n- two\n  - two a\n  - two b\n- three\n\n1. first\n2. second'),
      ),
    ).toBe(
      '<ul><li>one more of one</li><li>two<ul><li>two a</li><li>two b</li></ul></li><li>three</li></ul>' +
        '<ol><li>first</li><li>second</li></ol>',
    );
  });

  it('keeps HTML and stray marks as the text they are', () => {
    expect(show(parseMarkdown('<script>alert(1)</script> 2 * 3 * 4, snake_case_name, \\*not em\\*'))).toBe(
      '<p><script>alert(1)</script> 2 * 3 * 4, snake_case_name, *not em*</p>',
    );
    // The text stays text: the tree holds no markup, only strings.
    const tree = parseMarkdown('<b>x</b>');
    expect(tree).toEqual([{ tag: 'p', children: ['<b>x</b>'] }]);
  });

  it('reads quotes, rules and fenced code', () => {
    expect(show(parseMarkdown('> a quote\n> on two lines\n\n---\n\n```\nraw *text*\n```'))).toBe(
      '<blockquote><p>a quote on two lines</p></blockquote><hr></hr><pre><code>raw *text*</code></pre>',
    );
  });

  it("reads every scene's notes in the example", () => {
    for (const scene of project.story.scenes) {
      const tree = parseMarkdown(scene.notes ?? '');
      expect(tree.length, scene.id).toBeGreaterThan(0);
    }
    const s03 = show(parseMarkdown(project.story.scenes[3]?.notes ?? ''));
    expect(s03).toMatch(/^<p>Tone: Analytical/);
    expect(s03).toContain('<ul><li>Lawrence et al. (2024, p. 7)');
  });
});

describe('the rehearsal notes', () => {
  it('names scenes by number, or by title where they have none, and says what comes next', () => {
    expect(sceneName(deck.scenes[0] as (typeof deck.scenes)[number])).toBe(deck.scenes[0]?.title);
    expect(sceneName(deck.scenes[4] as (typeof deck.scenes)[number])).toBe('Scene 04');
    expect(nextLine(deck, { s: 4, b: 0 })).toBe(`S04.2a · ${project.story.scenes[4]?.steps[1]?.label}`);
    expect(nextLine(deck, { s: 4, b: 8 })).toBe(`Next scene: 05 · ${project.story.scenes[5]?.title}`);
    expect(nextLine(deck, { s: 10, b: 3 })).toBe('End of the presentation: hold the last step.');
  });

  it('keeps one presenter clock per presentation, counting each scene from when it came up', () => {
    let now = 0;
    const storage = new MemoryStorage();
    const store = new PresentationStore('p1', storage);
    const clock = new PresenterClock(store, deck, () => now);
    expect(paceText(clock.read({ s: 1, b: 0 }))).toBe('Clock not started');
    clock.toggle({ s: 1, b: 0 });
    now = 70_000;
    clock.noteScene({ s: 2, b: 0 });
    now = 100_000;
    const t = clock.read({ s: 2, b: 0 });
    expect([t.elapsed, t.sceneElapsed, t.pace.status]).toEqual([100, 30, 'on']);
    expect(paceText(t)).toBe('On pace (+0:10)');
    // Another window reads the same clock.
    const again = new PresenterClock(new PresentationStore('p1', storage), deck, () => now);
    expect(again.read({ s: 2, b: 0 }).sceneElapsed).toBe(30);
    again.reset({ s: 2, b: 0 });
    clock.reload();
    expect(clock.read({ s: 2, b: 0 }).started).toBe(false);
  });
});
