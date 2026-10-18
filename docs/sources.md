# Sources and citations

A Loopweft map keeps its evidence with it: the works it draws on (its **sources**) and, on each variable,
link or loop, the **citations** that say which work supports it and where. The format is described in
[the specification](format.md#7-citations-and-sources); this page says how Loopweft works with it.

Loopweft never writes evidence for you. It does not invent a reference, a page, a strength or a citation;
what it fills in comes from you or from a lookup it names, and what it cannot fill in it says is missing.

## Sources

A source is one work: an article, a book, a chapter, a report, a web page. It holds:

- its **id**, a short tag that citations use (`L`, `RI`, `lawrence2024`). A new source gets one from its
  reference, the first author's family name and the year (`lawrence2024`; `lawrence2024b` when that is
  taken, as APA tells same-year works apart), or `source1` when the reference does not start with an author
  and a year. You can choose another when adding it; after that the id stays, so citations never lose it;
- its **reference**, in full, as APA 7 writes it, with `*asterisks*` for italics;
- optionally its in-text **label** (`Lawrence et al. (2024)`), its **DOI** (bare: `10.1017/sus.2024.1`), a
  web address, the licence it states, a summary of what the map draws from it, and the work it is a
  supplement of.

Two sources cannot share a DOI (DOIs are compared ignoring case) or the same reference text.

A source that is still cited is not removed, unless you ask for its citations to go with it (`cascade`):
then every citation of it, on the map and in the story, and every scene's listing of it go too. A work that
has supplements is never removed while they point to it; remove them first, or make them part of no work.

## Citations

A citation on a variable, link or loop names a source and may add:

| Field | Meaning |
|---|---|
| `pages` | Pages or another locator: `7`, `11–12`, `e11`, `S4`. Kept exactly as written. |
| `strength` | How strongly the source supports this element, in your judgement: `strong`, `moderate` or `weak`. Left out, it is unrated; Loopweft never rates evidence. |
| `note` | A figure, table or short quotation: `Fig. 6c`. |

One source can be cited on many elements at once. An element that already cites that source at the same
pages is left as it was (and named), so citing a selection twice never adds a citation twice. The same
element may cite one source more than once, for different pages.

## Coverage

Loopweft counts, for the whole map:

- the variables, links and loops that cite something, and those that cite nothing;
- the citations by strength (strong, moderate, weak, unrated), and those without pages;
- for each source, how many citations and elements use it, and how often the story does.

A link that cites nothing is a warning (`uncitedLink`): a causal claim with no evidence shown. Variables
and loops without citations are counted but are not warnings, because a variable's definition or a loop
made of cited links often needs no source of its own. A source that nothing cites is a warning too
(`unusedSource`).

## The reference list

The reference list is made from the sources, never typed separately: alphabetical by first author as APA
orders it (italics marks ignored; accented names sort with their letter), each supplement under its work,
and each with the scenes that draw on it.
