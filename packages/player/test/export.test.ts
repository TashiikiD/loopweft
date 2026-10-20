import { type Project, readProject, serializeProject } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { buildPlayerTemplate, playerTemplate } from '../build/template.ts';
import { exportHtml, hasNotes, SIZE_WARNING_BYTES, SLOT, withoutNotes } from '../src/index.ts';
import { example } from './helpers.ts';

const project = example();

/** The project text a page holds, read back as the page reads it. */
function embedded(html: string): { text: string; notes: string | null } {
  const m =
    /<script type="application\/json" id="loopweft-project" data-notes="([^"]+)">([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (!m) throw new Error('no project in the page');
  // The page reads the element's text, which JSON then reads: an escaped "<" is "<" again.
  return { notes: m[1] ?? null, text: m[2] ?? '' };
}

describe('the player template', () => {
  it('is one file: the script, styles and fonts inside it, nothing loaded from elsewhere, and no project', async () => {
    const template = await playerTemplate();
    expect(template).toContain(SLOT);
    expect(template).toMatch(/<script type="module">/);
    expect(template).toMatch(/<style>/);
    expect(template).toContain('data:font/woff2;base64,');
    expect(template).not.toMatch(/(?:src|href)=["']\.?\/?assets\//);
    expect(template).not.toMatch(/<script[^>]+src=/);
    // The example is played only by the page served on this machine, never built in.
    expect(template).not.toContain('Global Polycrisis');
  });

  it('builds to the same bytes every time', async () => {
    expect(await buildPlayerTemplate()).toBe(await playerTemplate());
  });
});

describe('exporting a project', () => {
  it('puts the project in the page, the same bytes every time, readable again', async () => {
    const template = await playerTemplate();
    const one = exportHtml(project, template, { notes: true });
    expect(exportHtml(project, template, { notes: true }).html).toBe(one.html);
    expect(one.bytes).toBe(new TextEncoder().encode(one.html).length);
    const { text, notes } = embedded(one.html);
    expect(notes).toBe('included');
    expect(JSON.parse(text)).toEqual(JSON.parse(serializeProject(project)));
    const read = readProject(JSON.stringify(JSON.parse(text)));
    expect(read.ok).toBe(true);
    expect(one.html).toContain('<title>Global Polycrisis - The Connections That Change Everything</title>');
    expect(one.images).toEqual([{ id: 'richards_2021_fig5', type: 'image/webp', bytes: 204394 }]);
    expect(one.warnings).toEqual([]);
  });

  it('leaves out the speaker notes, the script and the cues on request, and nothing else', () => {
    expect(hasNotes(project)).toBe(true);
    const bare = withoutNotes(project);
    expect(hasNotes(bare)).toBe(false);
    const scrub = (p: Project) =>
      p.story.scenes.map(({ notes: _n, script: _s, ...scene }) => ({
        ...scene,
        steps: scene.steps.map(({ cue: _c, ...step }) => step),
      }));
    expect(scrub(bare)).toEqual(scrub(project));
    expect({ ...bare, story: null }).toEqual({ ...project, story: null });
    const made = exportHtml(project, SLOT, { notes: false });
    const { text, notes } = embedded(made.html);
    expect(notes).toBe('left-out');
    expect(JSON.parse(text)).toEqual(JSON.parse(serializeProject(bare)));
  });

  it('keeps anything in a project from closing the script it sits in, or the title', () => {
    const tricky: Project = {
      ...project,
      meta: { ...project.meta, title: 'A & B </title><script>alert(1)</script>' },
      variables: project.variables.map((v, i) =>
        i === 0 ? { ...v, label: '</script><img src=x onerror=alert(1)><!--' } : v,
      ),
    };
    const made = exportHtml(tricky, `<title>Loopweft</title>${SLOT}`, { notes: true });
    expect(made.html).toContain(
      '<title>A &amp; B &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>',
    );
    const body = made.html.slice(made.html.indexOf('data-notes'));
    // Only the slot's own closing tag closes it, and no comment opens inside it.
    expect(body.match(/<\/script/g)).toHaveLength(1);
    expect(body).not.toContain('<!--');
    expect(JSON.parse(embedded(made.html).text).variables[0].label).toBe(
      '</script><img src=x onerror=alert(1)><!--',
    );
  });

  it('warns past 20 MB, naming the largest images, and names fonts it does not carry', () => {
    const big = `<title>t</title>${SLOT}${'x'.repeat(SIZE_WARNING_BYTES)}`;
    const made = exportHtml(project, big, { notes: true });
    expect(made.warnings).toEqual([
      expect.stringMatching(
        /^The file is 2\d\.\d MB: many email services refuse attachments of 20 to 25 MB\. The largest images: richards_2021_fig5 \(0\.2 MB\)\.$/,
      ),
    ]);
    const styled = {
      ...project,
      theme: { ...project.theme, fonts: { heading: 'Georgia', body: 'Inter Variable' } },
    };
    const fonts = exportHtml(styled, SLOT, { notes: true });
    expect(fonts.fontsLeftOut).toEqual(['Georgia']);
    expect(fonts.warnings).toEqual([
      'The font "Georgia" is not included: it shows only on computers where it is installed.',
    ]);
  });

  it('refuses a template without a project slot', () => {
    expect(() => exportHtml(project, '<html></html>', { notes: true })).toThrow('no project slot');
  });
});
