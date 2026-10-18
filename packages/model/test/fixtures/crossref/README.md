# Recorded Crossref replies

Replies of Crossref's REST API (`https://api.crossref.org/works/<DOI>`), recorded on 2026-10-18, so the DOI
lookup's tests never use the network. Crossref makes its metadata available without restriction (CC0).

Each file is named after its DOI (lower case, every run of other characters as `_`). To keep them small and
free of what the lookup does not read, these parts of each record were removed when it was recorded: the
abstract (the publisher's text), the reference list, funders, assertions, links, `content-domain`,
`resource`, `relation`, `indexed`, `deposited`, `score`, and each person's affiliations and ORCID iD.
Everything the lookup reads is as Crossref sent it.

`10_6084_m9_figshare_c_6858564.json` records a refusal: the example's supplement has a DataCite DOI, which
Crossref does not hold (`404 Resource not found.`).

The works were chosen to cover the kinds of record Crossref holds: most of the example's articles, and a chapter, a
conference paper, a book, an edited book, a report with and without an author, a preprint, a dissertation,
a dataset, an article Crossref records as retracted, and a chapter Crossref files as an edited book.
