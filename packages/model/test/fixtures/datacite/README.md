# Recorded DataCite replies

Replies of DataCite's REST API (`https://api.datacite.org/dois/<DOI>`), recorded on 2026-10-18, so the DOI
lookup's tests never use the network. DataCite makes its metadata available without restriction (CC0).

Each file is named after its DOI (lower case, every run of other characters as `_`). To keep them small and
free of what the lookup does not read, these parts of each record were removed when it was recorded: the
descriptions (abstracts), the full XML, subjects, funding, places, sizes, formats, related items, alternate
identifiers, usage counts, the relationships block, and each person's affiliations and identifiers (such as
ORCID iDs). Everything the lookup reads is as DataCite sent it.

The records cover: the polycrisis example's supplement (a figshare collection, JS), data sets from Zenodo,
figshare and Mendeley Data, software with a version, a journal article DataCite files as text, an arXiv
preprint, and a preprint whose title says it was withdrawn. `10_9999_not_registered_anywhere.json` records
DataCite's refusal of a DOI no agency holds (Crossref refuses it too).
