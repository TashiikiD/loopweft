# Importing maps into Loopweft

Loopweft makes a new `.loopweft` project from three kinds of file: tables (CSV, TSV, Excel), a Kumu map
and a DataViz project. The Studio's import wizard and `loopweft import <file> -o <project>` run the same
importers (`@loopweft/model`), so both give the same project.

Every import follows the same rules:

- **Nothing is invented.** A value is read only when it can be read one way: a sign that is not +, − or ?,
  a weight that is not a number, or a choice that does not exist stops the import, and every such problem is
  listed at once with where it is (`links.csv, row 4, sign`). An empty sign is recorded as unknown (`?`) and
  flagged, as the shorthand does.
- **Nothing is dropped silently.** A column or field that is not one of Loopweft's own becomes a custom
  field, so its values come across as they were. What cannot come across is named in the import's notes.
- **No citations are made up.** None of these files holds full references, so an import cites no sources;
  text a file holds about its sources is kept in a custom field, to cite properly later.
- **The same file gives the same project, byte for byte.** Variables without a position are laid out with
  the seeded force layout (`--layout` chooses another, or `none`).

## Tables: CSV, TSV and Excel

A table of links (one per row: a cause and an effect), and optionally a table of variables. In a workbook,
each sheet is a table; a sheet named like `Variables`, `Nodes` or `Elements` holds variables, one named like
`Links`, `Edges` or `Connections` holds links, and otherwise a table with a cause and an effect column is
read as links. Variables are read first, so link ends find them by id or name; a link end that names no
variable makes one.

Headers are matched to Loopweft's fields, ignoring case:

| Field | Headers |
|---|---|
| Variable `id`, `label`, `mapLabel` | id, key, code · label, name, variable, title, node, element, factor · map label, short name |
| `category`, `role`, `definition`, `size` | category, group, domain, cluster, sector · role · definition, description, notes · size |
| Link `from`, `to` | from, source, cause, driver · to, target, effect, outcome |
| `sign` | sign, polarity, link sign, +/- (values: +, -, ?, or words such as positive, negative, same, opposite) |
| `type`, `conditional` | type, link type, connection type · conditional |
| `delay`, `delayLabel` | delay, lag · delay label, delay time, lag time (a delay label alone means there is a delay) |
| `confidence`, `weight`, `rationale` | confidence, certainty (low, medium, high or L, M, H) · weight, strength · rationale, mechanism, explanation |

Any other column with a value becomes a custom field: numbers, true or false, a few short values that repeat
(a choice), or text. Categories, roles and link types are made from the values that name them; a role takes
the next shape in the list, which the notes give. The CLI's `--map Column=target`, `--sheet Name=kind` and
`--header-row` change what is guessed.

## Kumu

Loopweft reads the two layouts Kumu documents, a JSON blueprint (`{ "elements": [...], "connections":
[...] }`) and a spreadsheet whose sheets hold elements (Label, Type, Description, Tags…) and connections
(From, To, Type, Direction, Label, Strength…), and Kumu's own JSON export (Export to JSON). Kumu does not
document its export; Loopweft reads it as Kumu writes it, which was checked on real exports.

| Kumu | Loopweft |
|---|---|
| element label, description | variable label, definition |
| element type | category |
| connection description, strength | link rationale, weight |
| connection type | link type, unless it holds the signs (below) |
| a delayed connection (export) | a delayed link |
| a "To" cell naming several elements, separated by `\|` | one link to each |
| a mutual connection | two links, one each way |
| tags, connection labels, any other field with a value | custom fields, named as Kumu names them |

Kumu links have no sign. A connection field named sign or polarity gives the sign; else a connection type
that reads as a sign everywhere (+, -, positive…) does; else every link is recorded as unknown (`?`) and the
notes say so (`--sign-field` names the field instead). An undirected connection cannot be a causal link and
is left out, counted in the notes; one that gives no direction is read from → to. A connection reversed
with Kumu's direction menu runs the way Kumu draws it, from its To to its From.

Kumu's spreadsheets give both sheets every column; a column without a value on a sheet makes no field.
JSON and spreadsheet exports of the same map give the same variables, links and fields. Only the JSON export
holds the rest:

- **What the map shows.** Kumu keeps in a project what was removed from a map, and the export holds it
  too. Loopweft takes only the elements, connections and loops the export's maps show, as Kumu's own
  spreadsheet export does, and names what it leaves out. A connection to an element id the export does
  not have stops the import: it is never made into a new variable.
- **The title and description** of the Kumu project.
- **Places.** When the default map places every element, each is placed there, moved and scaled (the same
  across as down) to fill Loopweft's view, and pinned when Kumu pins it. When some element has no place,
  the map is laid out around the elements Kumu pins, which keep their places, so the pins alone are scaled
  to fill the view (the others' places, scaled the same way, are kept only when the map is not laid out:
  `--layout none`, or None in the Studio). A blueprint or a spreadsheet holds no places, so the whole map
  is laid out.
- **Named loops.** A loop of the map whose connections close one loop becomes a named loop, named by its
  Kumu label. Its polarity follows its links' signs; a label of R or B that says otherwise is named in the
  notes. A loop without a label, or whose connections do not close one loop, is left out and named.
- **Metrics.** Fields Kumu computed (degree, betweenness and the like) are kept as custom fields, and the
  notes say they do not change as the map does.

Kumu's perspectives (its colours, sizes and filters), the look of single elements and connections,
connection curves and where loop labels sit are not carried across; the notes name those the export has.

## DataViz

A DataViz project (`.dataviz.json`, format version 1):

| DataViz | Loopweft |
|---|---|
| title, description | meta title, description |
| the group vocabulary (its order, labels and colours) | categories |
| entity id, label, group, description | variable id, label, category, definition |
| relation id, from, to, sign | link id, from, to, sign |
| delay, delay label, confidence (L, M, H), strength, mechanism | delay, delay label, confidence, weight, rationale |
| custom columns | custom fields (dates as text; categorical and ordinal columns as choices) |
| rubric dimensions | a choice field each |
| relation labels | the custom field "DataViz label" (Loopweft links have no labels) |
| relation sources (citation and locator) | the custom field "DataViz sources", as DataViz wrote them (turning them into sources is planned after version 1.0) |
| the first CLD view's pinned variables | positions, pinned |

An entity id that Loopweft cannot use (with a dot or a space) gets a new one, named in the notes. Left out,
and named in the notes: DataViz's raw tables, its normalization log and suggestions, and its views (filters,
outputs, look, link bend points and curvature).
