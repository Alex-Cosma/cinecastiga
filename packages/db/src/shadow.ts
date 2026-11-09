/**
 * Blue/green processing (owner, 9 November 2026). The nightly build writes into `core_next`, `marts_next` and
 * `reference_next` while the site keeps reading `core`, `marts` and `reference`; when the build is validated the schemas
 * are swapped by renaming them in one short transaction, and on a failure the site keeps yesterday's data.
 *
 * The code names these schemas in its SQL text everywhere, so the build's connection rewrites them: `shadowSql` maps
 * every schema-qualified name of the SQL text it sends (tagged templates and their fragments, `unsafe` — which drizzle
 * uses —, transactions, savepoints and reserved connections) to the shadow schema. Bind values are data and never change.
 * The build role has no privilege at all on the live schemas, so a name this misses fails loudly instead of reading
 * or writing the site's data.
 */
export const SHADOW_SCHEMAS = ["core", "marts", "reference"] as const;
export type ShadowSchema = (typeof SHADOW_SCHEMAS)[number];
export const SHADOW_SUFFIX = "_next";

// The name may continue in the text, quoted, as `*`, or in a string the query builds ('marts.' || name).
const UNQUOTED = /(?<![\w$."])(core|marts|reference)\.(?=[\w"$*'])/g;
const QUOTED = /(?<![\w$."])"(core|marts|reference)"\./g;

/** The SQL text with every live schema-qualified name of the shadow set pointed at its shadow schema. */
export function shadowText(text: string): string {
  return text.replace(UNQUOTED, `$1${SHADOW_SUFFIX}.`).replace(QUOTED, `"$1${SHADOW_SUFFIX}".`);
}

type Callable = (...args: unknown[]) => unknown;
const isTemplate = (value: unknown): value is TemplateStringsArray => Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);

function rewriteTemplate(chunks: TemplateStringsArray): TemplateStringsArray {
  const mapped = chunks.map(shadowText);
  Object.defineProperty(mapped, "raw", { value: chunks.raw.map(shadowText) });
  return mapped as unknown as TemplateStringsArray;
}

/**
 * A connection (pool, transaction, savepoint or reserved connection) whose SQL text goes to the shadow schemas.
 * Helpers that carry no SQL text (identifiers `sql("x")`, rows, `sql.array`, `sql.json`) pass through unchanged.
 */
export function shadowSql<T extends object>(connection: T): T {
  const target = connection as unknown as Callable & Record<string | symbol, unknown>;
  const wrapCallback = (fn: unknown) => (inner: unknown) => (fn as Callable)(shadowSql(inner as object));
  return new Proxy(target, {
    apply(_t, thisArg, args: unknown[]) {
      const [first, ...rest] = args;
      return Reflect.apply(target, thisArg, isTemplate(first) ? [rewriteTemplate(first), ...rest] : args);
    },
    get(t, key, receiver) {
      const value = Reflect.get(t, key, receiver);
      if (typeof value !== "function") return value;
      switch (key) {
        case "unsafe":
          return (text: string, ...rest: unknown[]) => (value as Callable).call(t, shadowText(text), ...rest);
        case "begin":
        case "savepoint":
          // (fn) or (options | name, fn): the callback is always last.
          return (...args: unknown[]) => {
            const fn = args[args.length - 1];
            return (value as Callable).call(t, ...args.slice(0, -1), wrapCallback(fn));
          };
        case "reserve":
          return async (...args: unknown[]) => shadowSql((await (value as Callable).call(t, ...args)) as object);
        case "file":
          throw new Error("sql.file is not supported on a shadow connection");
        default:
          return (value as Callable).bind(t);
      }
    },
  }) as unknown as T;
}
