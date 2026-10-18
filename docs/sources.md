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

Two sources cannot share a DOI (DOIs are compared ignoring case) or the same reference text. A supplement
may share its work's DOI, since one published with the work often has none of its own.

A source that is still cited is not removed, unless you ask for its citations to go with it (`cascade`):
then every citation of it, on the map and in the story, and every scene's listing of it go too. A work that
has supplements is never removed while they point to it; remove them first, or make them part of no work.

## Looking up a DOI

Given a DOI, Loopweft asks Crossref for the work's record (`https://api.crossref.org/works/<DOI>`) and
drafts its APA reference, its in-text label and, when the publisher recorded one, its Creative Commons
licence. This is Loopweft's only network call. It sends the DOI and nothing else: no account, no email
address, nothing about the map. Entering a reference by hand needs no network and always works.

A DOI can be pasted bare (`10.1017/sus.2024.1`), as an address (`https://doi.org/10.1017/sus.2024.1`), or
after `doi:`. A full stop at the end is read as the sentence's.

The draft is shown before anything is added, with notes of three kinds:

- **warnings**: Crossref records a retraction, withdrawal or expression of concern for the work, or the DOI
  is the notice itself rather than the work;
- **missing**: a part APA asks for that Crossref does not give (a date, the book's editors, pages or an
  article number). It is left out, never filled in;
- **to check**: things Loopweft cannot settle, such as capitals, the year of an article published online
  before its issue, or a kind of work Crossref names loosely.

How the draft is written, following the APA Publication Manual (7th ed.):

| Part | Rule |
|---|---|
| Authors | Family name and initials (`Donges, J. F.`; `Crépin, A.-S.`); `&` before the last; up to 20, then the first 19, `. . .` and the last. An organisation is written as Crossref names it. With no author, the title comes first; for a book, its editors (`(Ed.)`, `(Eds.)`). |
| Year | For a journal article in an issue, the issue's year; otherwise the earliest date Crossref gives. No date: `(n.d.)`. |
| Title | As Crossref writes it, except the first word after a colon, which APA capitalizes. Loopweft cannot tell proper nouns from other words, so it does not change a title in title case into APA's sentence case; it says so, for you to correct. Italics marked in the title are kept, and digits set as sub- or superscripts (CO₂). |
| Journal articles | `*Journal*, *volume*(issue), pages` or `Article <number>`. |
| Chapters | `In A. Editor (Ed.), *Book* (pp. 21–25). Publisher.` Crossref seldom lists a book's editors: the draft says when they are missing. |
| Books and reports | `*Title* (2nd ed.). Publisher.` |
| Preprints, dissertations, datasets | `[Preprint]`, `[Dissertation, Institution]` (APA names the kind: say "Doctoral dissertation" or "Master's thesis"), `[Data set]`. |
| Other kinds | Written as a stand-alone work, with a note to check them against APA's rules. |
| DOI | `https://doi.org/<DOI>` at the end. |
| In-text label | `Brosig (2025)`, `Liu and Renn (2025)`, `Lawrence et al. (2024)`. |
| Licence | Only a Creative Commons licence the publisher recorded for the published version, by its name (`CC BY 4.0`); anything else is left out. |

When the lookup fails, it says why and what to do: the text is not a DOI; Crossref cannot be reached
(offline) or does not answer within 20 seconds; Crossref has no record of the DOI (it may be registered
with another agency: DataCite registers many datasets and supplements, such as the polycrisis example's
figshare supplement); Crossref is busy; or its answer cannot be read. In each case the reference can be
entered by hand.

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

## In the Studio

- **Sources** workspace:
  - **Library**: every source in reference-list order, with how often it is cited; the chosen source's
    fields, a check of its reference against Crossref, and everything that cites it, each one click from the
    map. **Add a source** looks up a DOI (the draft and its notes are shown, to correct before adding) or
    takes a reference by hand.
  - **Coverage**: how many links, variables and named loops cite a source, the citations by strength, and
    the list of what cites nothing; choose rows and cite a source on all of them at once, or select them on
    the map.
  - **Reference list**: the APA list, to copy as plain text or with its italics.
- **Map** workspace: the inspector shows a variable's or link's citations, to change (pages, strength,
  note) or remove, and cites a source on it; with several selected, it cites one source on all of them. The
  Loops panel does the same for a named loop.

On the command line, `loopweft source`, `cite` and `references` do the same ([the CLI](../packages/cli/README.md)).
