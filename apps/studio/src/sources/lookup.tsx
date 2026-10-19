// The DOI lookup the Studio uses: the model's (Loopweft's only network call), or one a test gives instead.
import { type LookupFailure, type LookupResult, lookupDoi } from '@loopweft/model';
import { createContext, useContext } from 'react';

export type Lookup = (doi: string, signal: AbortSignal) => Promise<LookupResult>;

export const crossrefLookup: Lookup = (doi, signal) => lookupDoi(doi, { signal });

export const LookupContext = createContext<Lookup>(crossrefLookup);

export const useLookup = (): Lookup => useContext(LookupContext);

/**
 * The heading of a failed lookup. Only "not found" says there is no record: offline, a timeout, a busy agency
 * or an unreadable answer say nothing about whether the DOI has one.
 */
export function failureTitle(failure: LookupFailure): string {
  switch (failure.kind) {
    case 'notFound':
      return 'No reference found';
    case 'invalidDoi':
      return 'Not a DOI';
    case 'cancelled':
      return 'Lookup stopped';
    default:
      return 'DOI lookup failed';
  }
}
