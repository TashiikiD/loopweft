// The `.loopweft` file format, version 1, as zod schemas. docs/format.md is the human-readable
// specification of the same thing; `npm run schema` writes the JSON Schema generated from here.
//
// Conventions:
// - Objects are strict: an unknown field is an error, so a typo never passes silently.
// - Collections default to empty, so a minimal file is short; canonical files (serialize.ts) write them all.
// - Optional scalars are left out when absent; their documented default applies (e.g. `sign` has none).
// - Shape order here is the key order of canonical files.
import { z } from 'zod';
import { ID_PATTERN } from './text/ids.ts';

export const FORMAT = 'loopweft';
export const FORMAT_VERSION = 1;
/** Where the JSON Schema for version 1 is published. */
export const SCHEMA_URL = 'https://tashiikid.github.io/loopweft/schema/v1.json';

// ----- Building blocks -----

export const IdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(ID_PATTERN, { error: 'Use letters, digits, "_" and "-" only (no spaces or dots).' })
  .meta({ id: 'Id', description: 'An identifier: letters, digits, "_" and "-".' });

const Ids = z.array(IdSchema);
const Text = z.string().min(1);

export const ColourSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Write colours as #rrggbb, e.g. #5ECBA9.' })
  .meta({ id: 'Colour', description: 'A colour as #rrggbb.' });

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/, {
  error: 'Write dates as YYYY-MM-DD, or a full ISO 8601 date-time.',
});

const NonNegative = z.number().min(0);

/** Link signs: `+` same direction, `-` opposite direction, `?` not known (allowed, but flagged). */
export const SignSchema = z.enum(['+', '-', '?']).meta({
  id: 'Sign',
  description:
    '+ : the target tends to move in the same direction as the source; - : the opposite; ? : unknown.',
});
export type Sign = z.infer<typeof SignSchema>;

export const CitationSchema = z
  .strictObject({
    source: IdSchema.describe('The id of a source in `sources`.'),
    pages: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe('Pages or another locator in the source, e.g. "7", "11–12", "e11", "S4".'),
    strength: z
      .enum(['strong', 'moderate', 'weak'])
      .optional()
      .describe("How strongly this source supports the element: the author's judgement."),
    note: Text.optional().describe('A figure, table or short quotation the citation points to.'),
  })
  .meta({ id: 'Citation', description: 'A source cited for a variable, link, loop or overlay.' });
export type Citation = z.infer<typeof CitationSchema>;

const Citations = z.array(CitationSchema);

export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

const FieldValues = z
  .record(IdSchema, FieldValueSchema)
  .describe('Values of custom fields (see `types.fields`), by field id.');

// ----- meta, theme -----

export const MetaSchema = z
  .strictObject({
    title: Text.describe('The title of the map and its story.'),
    description: Text.optional().describe(
      'What the map is and is not, e.g. "a qualitative synthesis, not a model".',
    ),
    author: Text.optional(),
    course: Text.optional(),
    created: IsoDate.optional(),
    modified: IsoDate.optional(),
  })
  .meta({ id: 'Meta', description: 'About the project.' });
export type Meta = z.infer<typeof MetaSchema>;

export const ThemeSchema = z
  .strictObject({
    base: z
      .enum(['cinematic-dark', 'light', 'high-contrast'])
      .default('cinematic-dark')
      .describe('The look the map is drawn in.'),
    palette: IdSchema.optional().describe('A named palette preset (defined in Phase 1).'),
    fonts: z
      .strictObject({
        heading: Text.optional(),
        body: Text.optional(),
      })
      .optional()
      .describe('Font families for headings and body text.'),
  })
  .meta({ id: 'Theme', description: 'How the project looks.' });
export type Theme = z.infer<typeof ThemeSchema>;

// ----- types -----

export const CategorySchema = z
  .strictObject({
    id: IdSchema,
    name: Text,
    colour: ColourSchema.optional().describe('Absent: the theme palette assigns one.'),
    description: Text.optional(),
  })
  .meta({
    id: 'Category',
    description: 'A category of variables, drawn in its colour (e.g. a domain such as "Earth systems").',
  });
export type Category = z.infer<typeof CategorySchema>;

export const SHAPES = [
  'circle',
  'ring',
  'square',
  'rounded-square',
  'octagon',
  'diamond',
  'triangle',
  'hexagon',
] as const;

export const RoleSchema = z
  .strictObject({
    id: IdSchema,
    name: Text,
    shape: z.enum(SHAPES),
    description: Text.optional(),
  })
  .meta({
    id: 'Role',
    description: 'A role a variable plays (e.g. stress, trigger, crisis), drawn as its shape.',
  });
export type Role = z.infer<typeof RoleSchema>;

export const LinkTypeSchema = z
  .strictObject({
    id: IdSchema,
    name: Text,
    description: Text.optional(),
    style: z.enum(['solid', 'dashed', 'dotted']).optional().describe('Line style. Absent: solid.'),
    marker: z.enum(['none', 'flag']).optional().describe('A mark at the middle of the link. Absent: none.'),
    optional: z
      .boolean()
      .optional()
      .describe(
        'Links of an optional type (e.g. documented possible side-effects) are not part of the main ' +
          'structure: hidden until a step names them, and left out of automatic loop counts. Absent: false.',
      ),
  })
  .meta({
    id: 'LinkType',
    description: 'A kind of link (e.g. a mechanism such as "cascade" or "side-effect").',
  });
export type LinkType = z.infer<typeof LinkTypeSchema>;

export const FieldOptionSchema = z.strictObject({
  id: IdSchema,
  name: Text,
  description: Text.optional(),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

export const FieldSchema = z
  .strictObject({
    id: IdSchema,
    name: Text,
    kind: z.enum(['text', 'number', 'choice', 'boolean']),
    appliesTo: z
      .enum(['variables', 'links', 'both'])
      .optional()
      .describe('Which elements may carry the field. Absent: both.'),
    options: z.array(FieldOptionSchema).optional().describe('The choices, for a field of kind "choice".'),
    description: Text.optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === 'choice' && !field.options?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `Field ${field.id} is a choice, so it needs options.`,
        params: { code: 'choiceWithoutOptions' },
      });
    }
    if (field.kind !== 'choice' && field.options !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `Field ${field.id} is of kind "${field.kind}"; only choice fields have options.`,
        params: { code: 'optionsWithoutChoice' },
      });
    }
  })
  .meta({ id: 'Field', description: 'A custom field that variables or links can carry.' });
export type Field = z.infer<typeof FieldSchema>;

export const TypesSchema = z
  .strictObject({
    categories: z.array(CategorySchema).default(() => []),
    roles: z.array(RoleSchema).default(() => []),
    linkTypes: z.array(LinkTypeSchema).default(() => []),
    fields: z.array(FieldSchema).default(() => []),
  })
  .meta({
    id: 'Types',
    description: 'The vocabulary of the map: categories, roles, link types and custom fields.',
  });
export type Types = z.infer<typeof TypesSchema>;

// ----- the map -----

export const VariableSchema = z
  .strictObject({
    id: IdSchema,
    label: Text.describe('The full name.'),
    mapLabel: Text.optional().describe('A shorter name drawn on the map; "\\n" breaks the line.'),
    category: IdSchema.optional(),
    role: IdSchema.optional(),
    definition: Text.optional().describe('What the variable means: what rises or falls.'),
    size: z.enum(['normal', 'large']).optional().describe('Glyph size; large marks a hub. Absent: normal.'),
    fields: FieldValues.optional(),
    citations: Citations.default(() => []),
  })
  .meta({ id: 'Variable', description: 'A variable: something that can rise or fall.' });
export type Variable = z.infer<typeof VariableSchema>;

export const LinkSchema = z
  .strictObject({
    id: IdSchema,
    from: IdSchema.describe('The id of the cause.'),
    to: IdSchema.describe('The id of the effect.'),
    sign: SignSchema,
    type: IdSchema.optional().describe('The id of a link type in `types.linkTypes`.'),
    conditional: z
      .boolean()
      .optional()
      .describe('True when the effect holds only under some conditions (drawn dashed). Absent: false.'),
    delay: z.boolean().optional().describe('True when the effect takes notably long. Absent: false.'),
    delayLabel: Text.optional().describe('How long, e.g. "5 yrs" (needs `delay`).'),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    weight: NonNegative.optional().describe('Relative strength of influence, for line thickness. No units.'),
    rationale: Text.optional().describe(
      'Why the cause moves the effect: the mechanism, in a sentence or two.',
    ),
    fields: FieldValues.optional(),
    citations: Citations.default(() => []),
  })
  .superRefine((link, ctx) => {
    if (link.delayLabel !== undefined && link.delay !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['delayLabel'],
        message: `Link ${link.id} has a delayLabel but no "delay": true.`,
        params: { code: 'delayLabelWithoutDelay' },
      });
    }
  })
  .meta({
    id: 'Link',
    description: 'A causal link: a change in `from` tends to change `to`, in the direction its sign gives.',
  });
export type Link = z.infer<typeof LinkSchema>;

const Point = z.strictObject({ x: z.number(), y: z.number() });

export const PositionSchema = z
  .strictObject({
    x: z.number(),
    y: z.number(),
    labelSide: z
      .enum(['above', 'below', 'left', 'right'])
      .optional()
      .describe('Absent: placed automatically.'),
    pinned: z.boolean().optional().describe('True: automatic layouts leave it where it is. Absent: false.'),
  })
  .meta({ id: 'Position', description: 'Where a variable sits on the map.' });
export type Position = z.infer<typeof PositionSchema>;

export const GroupSchema = z
  .strictObject({
    id: IdSchema,
    category: IdSchema.optional().describe('Draws the halo and label in this category’s colour.'),
    label: Text.optional(),
    halo: z
      .strictObject({ x: z.number(), y: z.number(), r: z.number().positive() })
      .optional()
      .describe('A soft circle behind the group.'),
    labelAt: Point.optional().describe('Where the group label is drawn.'),
  })
  .meta({
    id: 'Group',
    description: 'A visual group on the map: a halo and a label, usually for one category.',
  });
export type Group = z.infer<typeof GroupSchema>;

export const LayoutSchema = z
  .strictObject({
    positions: z
      .record(IdSchema, PositionSchema)
      .default(() => ({}))
      .describe(
        'Where each variable sits, by variable id, in map units (the full view is about 1920 × 1080).',
      ),
    groups: z.array(GroupSchema).default(() => []),
    bends: z
      .record(IdSchema, z.number().min(-1).max(1))
      .default(() => ({}))
      .describe('Curvature overrides by link id: the bow as a fraction of the link’s length; + bends left.'),
  })
  .meta({ id: 'Layout', description: 'Where things are drawn.' });
export type Layout = z.infer<typeof LayoutSchema>;

export const LoopSchema = z
  .strictObject({
    id: IdSchema,
    name: Text,
    links: z
      .array(IdSchema)
      .min(1)
      .describe('The links of the loop, in order: each one starts where the previous one ends.'),
    archetype: Text.optional().describe('A system archetype it follows, e.g. "Fixes that fail".'),
    description: Text.optional(),
    caution: Text.optional().describe(
      'What the loop does not show, e.g. "a conceptual archetype, not measured".',
    ),
    citations: Citations.default(() => []),
  })
  .meta({
    id: 'Loop',
    description: 'A named feedback loop. Reinforcing or balancing follows from its link signs.',
  });
export type Loop = z.infer<typeof LoopSchema>;

export const SourceSchema = z
  .strictObject({
    id: IdSchema,
    label: Text.optional().describe('The short in-text form, e.g. "Lawrence et al. (2024)".'),
    apa: Text.describe('The full APA 7 reference; *asterisks* mark italics.'),
    doi: z
      .string()
      .regex(/^10\.\d{4,9}\/\S+$/, { error: 'Write the bare DOI, e.g. 10.1017/sus.2024.1.' })
      .optional(),
    url: z
      .string()
      .regex(/^https?:\/\/\S+$/, { error: 'Write a full web address starting with https://.' })
      .optional(),
    licence: Text.optional().describe('The licence the source states, e.g. "CC BY 4.0".'),
    summary: Text.optional().describe('What the map draws from it.'),
    partOf: IdSchema.optional().describe('For a supplement: the id of the work it belongs to.'),
  })
  .meta({ id: 'Source', description: 'A work the map cites.' });
export type Source = z.infer<typeof SourceSchema>;

// ----- the story -----

export const LEVELS = ['hidden', 'ghost', 'dim', 'normal', 'focus', 'active'] as const;
export const LevelSchema = z.enum(LEVELS).meta({ id: 'Level' });
export type Level = z.infer<typeof LevelSchema>;

const LevelListsSchema = z
  .strictObject({
    base: LevelSchema.optional().describe('The level of every element not listed. Absent: normal.'),
    hidden: Ids.optional(),
    ghost: Ids.optional(),
    dim: Ids.optional(),
    normal: Ids.optional(),
    focus: Ids.optional(),
    active: Ids.optional(),
  })
  .meta({
    id: 'LevelLists',
    description: 'Emphasis levels, from hidden to active. An id listed at two levels takes the higher one.',
  });
export type LevelLists = z.infer<typeof LevelListsSchema>;

export const TrendSchema = z.enum(['up', 'down', 'mixed']).meta({ id: 'Trend' });
export type Trend = z.infer<typeof TrendSchema>;

export const FRAMES = ['full', 'center', 'left', 'right', 'lower', 'inset'] as const;

export const MapStateSchema = z
  .strictObject({
    show: z.boolean().optional().describe('False hides the whole map. Absent: true.'),
    opacity: z.number().min(0).max(1).optional().describe('Absent: 1.'),
    camera: z
      .strictObject({
        fit: Ids.min(1)
          .optional()
          .describe('Fit these variables (with room for labels). Absent: the whole map.'),
        frame: z
          .enum(FRAMES)
          .optional()
          .describe(
            'Where on the stage the subject goes; "inset" shrinks the map into the centre. Absent: center.',
          ),
        maxZoom: z.number().positive().optional(),
      })
      .optional(),
    variables: LevelListsSchema.optional(),
    links: LevelListsSchema.optional().describe('Links of an optional type stay hidden unless listed here.'),
    labels: z
      .enum(['none', 'focus', 'view', 'all'])
      .optional()
      .describe(
        'Which variable labels show: focus = those at focus or active; view = those in view. Absent: view.',
      ),
    categoryLabels: z.boolean().optional().describe('Show group labels. Absent: false.'),
    labelText: z.record(IdSchema, Text).optional().describe('Label text for this step only, by variable id.'),
    trends: z.record(IdSchema, TrendSchema).optional().describe('▲ up, ▼ down or ± mixed, by variable id.'),
    loops: Ids.optional().describe('Loops whose R/B badge shows.'),
    loopNames: Ids.optional().describe('Loops whose name shows beside the badge.'),
    reveal: z
      .strictObject({
        mode: z
          .enum(['draw', 'bloom'])
          .optional()
          .describe('draw: new links trace in; bloom: the map fades in ring by ring.'),
        from: Ids.optional().describe('Variables the reveal grows out from.'),
        sequence: Ids.optional().describe('Exact order, one beat each: variable ids appear, link ids trace.'),
        stagger: NonNegative.optional().describe('Seconds between beats.'),
        delay: NonNegative.optional().describe('Seconds before the first beat.'),
      })
      .optional()
      .describe('How newly shown elements arrive.'),
    pulses: z
      .strictObject({
        hops: z.array(Ids.min(1)).min(1).describe('Links pulsed together, hop after hop.'),
        repeat: z.int().min(0).optional().describe('Extra passes, e.g. going round a loop again.'),
        delay: NonNegative.optional(),
        tone: z
          .enum(['harm', 'relief', 'mixed'])
          .optional()
          .describe('Absent: each pulse follows its target’s trend.'),
      })
      .optional()
      .describe('Glows that travel along links.'),
    ambient: z
      .strictObject({
        from: Ids.min(1),
        tone: z.enum(['harm', 'relief']),
        every: z.tuple([NonNegative, NonNegative]).optional().describe('Seconds between walks: [min, max].'),
        hops: z
          .tuple([z.int().min(1), z.int().min(1)])
          .optional()
          .describe('Links per walk: [min, max].'),
        delay: NonNegative.optional(),
      })
      .optional()
      .describe(
        'Pulses that keep wandering the lit map while the step is held, along links whose signs fit the tone.',
      ),
    clusters: z.enum(['show', 'dim', 'hide']).optional().describe('Group halos. Absent: show.'),
    minimap: z.boolean().optional().describe('Absent: shown when zoomed in.'),
  })
  .meta({
    id: 'MapState',
    description: 'What the map shows in one step. Every step states its whole map; transitions animate.',
  });
export type MapState = z.infer<typeof MapStateSchema>;

export const PLACES = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
const Place = z
  .enum(PLACES)
  .optional()
  .describe('Where on the stage. Absent: the default for the overlay type.');

export const OverlaySchema = z
  .discriminatedUnion('type', [
    z
      .strictObject({ type: z.literal('caption') })
      .describe("The scene's caption band: its title and headline."),
    z
      .strictObject({
        type: z.literal('title'),
        title: Text,
        subtitle: Text.optional(),
        lines: z.array(Text).optional().describe('Further lines, e.g. author and course.'),
      })
      .describe('A title page over the map.'),
    z
      .strictObject({
        type: z.literal('statement'),
        lines: z.array(Text).min(1),
        kicker: Text.optional().describe('A small line above, e.g. "INTERVENTION A".'),
        style: z.enum(['hero', 'question', 'closing', 'title', 'note']).optional(),
        place: Place,
        citations: Citations.optional(),
      })
      .describe('Large type over the stage: a question, a closing line, a short title or a caveat.'),
    z
      .strictObject({
        type: z.literal('cards'),
        title: Text.optional(),
        items: z.array(z.strictObject({ title: Text, sub: Text.optional() })).min(1),
        active: z.array(z.int().min(0)).optional().describe('Highlighted cards, from 0; the rest recede.'),
        place: Place,
        citations: Citations.optional(),
      })
      .describe('A row of cards.'),
    z
      .strictObject({
        type: z.literal('legend'),
        place: Place,
        citations: Citations.optional(),
      })
      .describe("A legend of the project's roles and link styles."),
    z
      .strictObject({
        type: z.literal('image'),
        asset: IdSchema.describe('The id of an image in `assets`.'),
        alt: Text.describe('What the image shows, for people who cannot see it.'),
        caption: Text.optional(),
        credit: Text.optional(),
        place: Place,
        citations: Citations.optional(),
      })
      .describe('An embedded image.'),
  ])
  .meta({
    id: 'Overlay',
    description: 'Something drawn over the map. Overlays draw in list order, later ones on top.',
  });
export type Overlay = z.infer<typeof OverlaySchema>;

export const StepSchema = z
  .strictObject({
    id: IdSchema.describe('Unique within its scene.'),
    label: Text.describe('A short name for the step, shown to the presenter.'),
    at: NonNegative.optional().describe('Seconds into the scene when the step should arrive, for pacing.'),
    cue: Text.optional().describe('What happens on this step, for the presenter.'),
    map: MapStateSchema,
    overlays: z.array(OverlaySchema).default(() => []),
  })
  .meta({ id: 'Step', description: 'One keypress of the story.' });
export type Step = z.infer<typeof StepSchema>;

export const SceneSchema = z
  .strictObject({
    id: IdSchema,
    title: Text,
    headline: Text.optional().describe('The one-line message, shown in the caption.'),
    targetSeconds: z.number().positive().optional().describe('Target length. Absent: untimed.'),
    notes: Text.optional().describe('Speaker notes (Markdown): private to the presenter.'),
    script: Text.optional().describe('A full script; "[>]" marks each keypress. Private to the presenter.'),
    sources: Ids.default(() => []).describe('Sources the scene draws on beyond those its links cite.'),
    steps: z.array(StepSchema),
  })
  .meta({ id: 'Scene', description: 'A scene: a run of steps with one message.' });
export type Scene = z.infer<typeof SceneSchema>;

export const StorySchema = z
  .strictObject({
    scenes: z.array(SceneSchema).default(() => []),
  })
  .meta({ id: 'Story', description: 'The animated story: scenes of steps, one keypress each.' });
export type Story = z.infer<typeof StorySchema>;

const AssetSchema = z.string().regex(/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/, {
  error: 'Embed images as base64 data URIs (PNG, JPEG, GIF, WebP or SVG).',
});

// ----- the project -----

export const ProjectSchema = z
  .strictObject({
    $schema: z.string().optional().describe('The JSON Schema this file follows (for editors).'),
    format: z.literal(FORMAT),
    version: z.literal(FORMAT_VERSION),
    meta: MetaSchema,
    theme: ThemeSchema.default(() => ({ base: 'cinematic-dark' as const })),
    types: TypesSchema.default(() => ({ categories: [], roles: [], linkTypes: [], fields: [] })),
    variables: z.array(VariableSchema).default(() => []),
    links: z.array(LinkSchema).default(() => []),
    layout: LayoutSchema.default(() => ({ positions: {}, groups: [], bends: {} })),
    loops: z.array(LoopSchema).default(() => []),
    sources: z.array(SourceSchema).default(() => []),
    story: StorySchema.default(() => ({ scenes: [] })),
    assets: z
      .record(IdSchema, AssetSchema)
      .default(() => ({}))
      .describe('Embedded images, by id.'),
  })
  .describe('A Loopweft project: a causal map, its evidence and its story.');

/** A parsed project: every collection present. */
export type Project = z.infer<typeof ProjectSchema>;
/** A project as a file may hold it: collections may be left out. */
export type ProjectInput = z.input<typeof ProjectSchema>;
