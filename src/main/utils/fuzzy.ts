import { partial_ratio } from 'fuzzball';

export function partialRatio(first: string, second: string): number {
  // Keep preprocessing disabled to mirror Python rapidfuzz.fuzz.partial_ratio.
  return partial_ratio(first, second, { full_process: false, force_ascii: false });
}
