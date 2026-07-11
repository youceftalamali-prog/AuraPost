# New File: server/db/postgres/namedParams.ts

This file did not exist in the original upload. Full contents:

```ts
/**
 * PHASE 2 — POSTGRESQL CUTOVER
 *
 * The pre-cutover codebase (sql.js/SQLite) used named parameters throughout
 * (`$paramName`, bound via `.bind({ $paramName: value })`), matching SQLite's
 * named-parameter syntax. node-postgres (`pg`) only supports positional
 * parameters (`$1`, `$2`, ...). Rather than hand-rewriting ~200 unique
 * parameter names across ~150 methods and hundreds of SQL statements (a huge
 * manual-transcription risk surface), this helper mechanically converts named
 * parameters to positional ones at call time, preserving every existing SQL
 * string and parameter object literally unchanged throughout db.ts.
 *
 * Same parameter name reused multiple times in one statement maps to the same
 * positional index (matching sql.js's own named-parameter semantics), so
 * Postgres receives the minimum necessary distinct values.
 */

const NAMED_PARAM_PATTERN = /\$[a-zA-Z_][a-zA-Z0-9_]*/g;

export interface PositionalQuery {
  text: string;
  values: unknown[];
}

export function namedToPositional(sql: string, params: Record<string, unknown> = {}): PositionalQuery {
  const indexByName = new Map<string, number>();
  const values: unknown[] = [];

  const text = sql.replace(NAMED_PARAM_PATTERN, (token) => {
    // CRITICAL: params object keys throughout the codebase are written as
    // `{ $paramName: value }` (matching sql.js's native bind() convention,
    // preserved verbatim across the cutover), so the KEY actually stored on
    // the params object includes the leading '$' — e.g. the key is literally
    // "$workspaceId", not "workspaceId". Looking up by the stripped name
    // (as an earlier version of this function did) silently returned
    // `undefined` for every single parameter in the entire application,
    // which normalizeParamValue then converted to `null` — meaning every
    // parameterized query silently wrote/matched on NULL instead of the
    // real value, with no compile-time or type-level signal. Caught only by
    // booting against a real PostgreSQL database (see POSTGRESQL_CUTOVER_REPORT.md).
    let index = indexByName.get(token);
    if (index === undefined) {
      values.push(normalizeParamValue(params[token]));
      index = values.length;
      indexByName.set(token, index);
    }
    return `$${index}`;
  });

  return { text, values };
}

/**
 * sql.js accepted `undefined` bind values by treating them as SQL NULL, and
 * silently accepted booleans by storing them (SQLite is dynamically typed).
 * pg is stricter: `undefined` throws, and our schema stores boolean-style
 * flags as INTEGER (0/1) for compatibility (see schema.sql header). Normalize
 * both here so every existing call site keeps working unchanged.
 */
function normalizeParamValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}
```
