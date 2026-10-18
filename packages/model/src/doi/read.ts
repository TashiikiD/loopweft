// Reading a DOI as people paste it: bare, as a doi.org address, or after "doi:". The result is the bare DOI
// that `sources[].doi` holds, or null when the text is not a DOI. Nothing is looked up here.

/** What `sources[].doi` accepts (the schema's rule). */
export const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

/**
 * The bare DOI in `text`, or null. Accepts `10.1017/sus.2024.1`, `https://doi.org/10.1017/sus.2024.1`,
 * `doi.org/…`, `dx.doi.org/…`, `doi:10.…` and `DOI 10.…`, with or without surrounding spaces, angle
 * brackets or quotes, and an address's percent-escapes. A full stop, comma or semicolon at the very end is
 * read as the sentence's, not the DOI's (a reference copied whole ends with one).
 */
export function readDoi(text: string): string | null {
  let doi = text.trim().replace(/^[<"'“‘]+|[>"'”’]+$/g, '');
  doi = doi.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '');
  doi = doi.replace(/^doi:?\s*/i, '');
  if (/%[0-9a-f]{2}/i.test(doi)) {
    try {
      doi = decodeURIComponent(doi);
    } catch {
      return null;
    }
  }
  doi = doi.replace(/[.,;]+$/, '');
  return DOI_PATTERN.test(doi) ? doi : null;
}
