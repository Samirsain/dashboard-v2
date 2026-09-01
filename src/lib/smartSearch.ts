/**
 * The small query language behind the Form Responses search bar.
 *
 * A query is a list of space-separated terms that ALL have to match (AND):
 *
 *   ravi delhi          → rows mentioning both "ravi" and "delhi" anywhere
 *   "ravi kumar"        → the phrase, spaces included
 *   name:ravi           → only in a column whose header contains "name"
 *   status:working      → the enquiry status column
 *   -complete           → rows that do NOT mention "complete"
 *   -status:complete    → rows whose status column doesn't say complete
 *   name:"ravi kumar"   → a field and a phrase together
 *
 * Everything is case-insensitive and matched as a substring, so partial words
 * work ("gma" finds "@gmail.com"). A `field:` that matches no column is not
 * treated as a failed filter — the whole token is searched as plain text
 * instead, so typing a time like `10:30` still finds what you meant.
 */

export interface SearchTerm {
  /** Lowercased column hint from `field:value`, or null when every column is searched. */
  field: string | null;
  /** Lowercased text to look for. Never empty. */
  value: string;
  /** From a leading `-`: the row must NOT match this term. */
  negated: boolean;
  /** The token as typed (minus the `-`), used when `field` matches no column. */
  raw: string;
}

/**
 * Splits a query into tokens on whitespace, keeping "quoted phrases" together.
 * The quotes themselves are dropped, so `name:"ravi kumar"` becomes the single
 * token `name:ravi kumar`.
 */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of query) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseToken(token: string): SearchTerm | null {
  let negated = false;
  let rest = token;
  if (rest.startsWith("-") && rest.length > 1) {
    negated = true;
    rest = rest.slice(1);
  }
  const raw = rest.toLowerCase();

  // A colon at position 0 is just text (":30"), not a field name.
  const colon = rest.indexOf(":");
  let field: string | null = null;
  if (colon > 0) {
    field = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }

  // Nothing after the colon yet ("name:") — someone is mid-typing, so this
  // isn't a filter. Dropping it keeps the table visible instead of emptying
  // it for every keystroke of the field name.
  const value = rest.toLowerCase().trim();
  if (!value) return null;
  return { field, value, negated, raw };
}

/** Parses a raw query string into the terms a row has to satisfy. */
export function parseSearchQuery(query: string): SearchTerm[] {
  return tokenize(query)
    .map(parseToken)
    .filter((term): term is SearchTerm => term !== null);
}

/** Column headers whose name contains the term's field hint. */
function fieldsFor(term: SearchTerm, record: Record<string, string>): string[] {
  if (!term.field) return [];
  return Object.keys(record).filter((key) => key.toLowerCase().includes(term.field!));
}

function containsIn(record: Record<string, string>, keys: string[], needle: string): boolean {
  return keys.some((key) => (record[key] ?? "").toLowerCase().includes(needle));
}

/** Whether one term is satisfied by the record, ignoring `negated`. */
function termHits(record: Record<string, string>, term: SearchTerm): boolean {
  const allKeys = Object.keys(record);
  if (term.field) {
    const keys = fieldsFor(term, record);
    // Unknown field — fall back to searching the token as ordinary text so a
    // stray colon never silently hides every row.
    return keys.length > 0
      ? containsIn(record, keys, term.value)
      : containsIn(record, allKeys, term.raw);
  }
  return containsIn(record, allKeys, term.value);
}

/** Does this record satisfy every term? An empty term list matches everything. */
export function matchesSearch(record: Record<string, string>, terms: SearchTerm[]): boolean {
  return terms.every((term) => (term.negated ? !termHits(record, term) : termHits(record, term)));
}

/**
 * The substrings to highlight inside one column's cell — the positive terms
 * that apply to it. Excluded terms are never highlighted: they mark what
 * *isn't* there.
 */
export function highlightNeedles(
  terms: SearchTerm[],
  field: string,
  record: Record<string, string>
): string[] {
  const key = field.toLowerCase();
  const needles = new Set<string>();
  for (const term of terms) {
    if (term.negated) continue;
    if (!term.field) {
      needles.add(term.value);
    } else if (key.includes(term.field)) {
      needles.add(term.value);
    } else if (fieldsFor(term, record).length === 0) {
      // Same fallback as the matcher: an unknown field searched as plain text.
      needles.add(term.raw);
    }
  }
  return [...needles].filter(Boolean);
}
