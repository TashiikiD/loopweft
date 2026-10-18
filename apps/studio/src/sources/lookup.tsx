// The DOI lookup the Studio uses: the model's (Loopweft's only network call), or one a test gives instead.
import { type LookupResult, lookupDoi } from '@loopweft/model';
import { createContext, useContext } from 'react';

export type Lookup = (doi: string, signal: AbortSignal) => Promise<LookupResult>;

export const crossrefLookup: Lookup = (doi, signal) => lookupDoi(doi, { signal });

export const LookupContext = createContext<Lookup>(crossrefLookup);

export const useLookup = (): Lookup => useContext(LookupContext);
