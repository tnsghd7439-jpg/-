// §E-0 keyword matching engine.
//
// Takes the two dictionaries (already loaded/validated by build-dictionaries.mjs)
// and finds keyword matches inside a product name: normalize → longest-match,
// non-overlapping, greedy scan → cross-dictionary priority resolution.
//
// Dependency-injected on purpose (dictionaries passed in, not imported here) so
// this module works identically in the browser bundle and in `node --test`.

const MAX_KEYWORD_LEN = 19;
const MIN_KEYWORD_LEN = 2;
const INTERSECTION_PRIORITY_INTENSITY = 2.0;

/**
 * §E-0-3 step 1: normalize + keep an index map back to the original string.
 * Strips whitespace, brackets, and other punctuation; lowercases ASCII.
 * indexMap[i] = index in `raw` that norm[i] came from.
 */
export function normalizeWithIndexMap(raw) {
  let norm = '';
  const indexMap = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/[\s\[\]{}()<>.,!?~'"/\\|_+=*^%$#@`:;-]/.test(ch)) continue;
    norm += ch.toLowerCase();
    indexMap.push(i);
  }
  return { norm, indexMap };
}

/**
 * Builds the merged keyword -> {volume?, season?} lookup used by the scanner.
 * 1-char keywords are already excluded from `dictionaries.volume` at build time
 * (safety §8-14) — nothing to filter here.
 */
function buildMergedMap(dictionaries) {
  const merged = new Map();
  for (const kw of Object.keys(dictionaries.volume)) {
    merged.set(kw, { volume: dictionaries.volume[kw] });
  }
  for (const kw of Object.keys(dictionaries.season)) {
    const entry = merged.get(kw) ?? {};
    entry.season = dictionaries.season[kw];
    merged.set(kw, entry);
  }
  return merged;
}

/** §E-0-2: which side is "representative" when a keyword is in both dictionaries. */
function resolveRepresentative(entry) {
  if (!entry.volume) return 'season';
  if (!entry.season) return 'volume';
  const intensity = entry.season.seasonIntensity; // undefined for 추정 rows — falls through to default
  if (typeof intensity === 'number' && intensity >= INTERSECTION_PRIORITY_INTENSITY) return 'season';
  return 'volume';
}

export function createMatchEngine(dictionaries) {
  const merged = buildMergedMap(dictionaries);

  /**
   * §E-0-3 steps 2-4: greedy, non-overlapping, longest-match-first scan.
   * Returns matches in left-to-right order with a 1-based `order` (자리순번).
   */
  function scan(productName) {
    if (!productName) return [];
    const { norm, indexMap } = normalizeWithIndexMap(productName);
    const matches = [];
    let i = 0;
    while (i < norm.length) {
      let matched = null;
      const maxLen = Math.min(MAX_KEYWORD_LEN, norm.length - i);
      for (let len = maxLen; len >= MIN_KEYWORD_LEN; len--) {
        const candidate = norm.slice(i, i + len);
        if (merged.has(candidate)) {
          matched = { keyword: candidate, len };
          break;
        }
      }
      if (matched) {
        const entry = merged.get(matched.keyword);
        const representative = resolveRepresentative(entry);
        matches.push({
          keyword: matched.keyword,
          rawStart: indexMap[i],
          rawEnd: indexMap[i + matched.len - 1] + 1,
          volumeRecord: entry.volume ?? null,
          seasonRecord: entry.season ?? null,
          representative,
        });
        i += matched.len;
      } else {
        i += 1;
      }
    }
    matches.sort((a, b) => a.rawStart - b.rawStart);
    matches.forEach((m, idx) => {
      m.order = idx + 1;
    });
    return matches;
  }

  return { scan };
}
