/**
 * How long an instance lives, and therefore who is responsible for ending it.
 *
 * - `scoped` — one per frame that resolves it. The default, because a class
 *   that never said it was safe to share is not assumed to be.
 * - `shared` — one per frame that DECLARES it; deeper frames borrow.
 * - `app`    — one per process, in frame 0.
 */
export type Lifetime = "scoped" | "shared" | "app";

/**
 * Keyed with `Symbol.for` so two copies of this package in one `node_modules`
 * still read the same brand. The alternative — a module-local symbol — makes a
 * duplicated install silently classify every token as `scoped`, and nothing
 * anywhere reports it.
 */
const LIFETIME = Symbol.for("@ecosy/classable:lifetime");

interface Branded {
  [LIFETIME]?: Lifetime;
}

/**
 * Tokens whose lifetime has already been read by a compile.
 *
 * A brand is one choice with many readers, and the readers run at module load —
 * so the choice has to happen earlier in the IMPORT GRAPH, not merely earlier in
 * some `main()`. Get that wrong and `lifetimeOf` answers `scoped` for something
 * meant to live in frame 0: one instance per request instead of one per process,
 * with nothing thrown and nothing logged.
 *
 * Sealing turns that into a loud failure at the moment the order is violated,
 * which is the only moment the stack still shows who violated it.
 */
const sealed = new WeakSet<object>();

/** Called by `compile` when it reads a brand: from here on the answer is fixed. */
export function sealLifetime(token: unknown): void {
  if (token && (typeof token === "object" || typeof token === "function")) {
    sealed.add(token as object);
  }
}

function brand<T>(token: T, lifetime: Lifetime): T {
  if (token && sealed.has(token as object)) {
    const name = (token as { name?: string }).name ?? "token";
    throw new Error(
      `[Lifetime] "${name}" was already compiled as ${lifetimeOf(token)}, so marking ` +
        `it ${lifetime} now would only change what later compiles see. Mark it in a ` +
        `module the compiling module imports — earlier in the import graph, not ` +
        `merely earlier in a function.`,
    );
  }

  const existing = (token as Branded)[LIFETIME];

  if (existing && existing !== lifetime) {
    throw new Error(
      `[Lifetime] Token is already ${existing} and cannot also be ${lifetime}. ` +
        `A token has one lifetime; two answers means two callers disagree about ` +
        `who ends it.`,
    );
  }

  Object.defineProperty(token, LIFETIME, {
    value: lifetime,
    enumerable: false,
    configurable: true,
  });

  return token;
}

/**
 * Marks a token as living for the whole process.
 *
 * A marker, not a base class: nothing about "lives in frame 0" needs to change
 * how the class is written, and forcing `extends` to say it puts a lifetime
 * decision into the inheritance chain, where it then constrains what else the
 * class can be.
 */
export function app<T>(token: T): T {
  return brand(token, "app");
}

/** Marks a token as owned by the frame that declares it, borrowed by deeper ones. */
export function shared<T>(token: T): T {
  return brand(token, "shared");
}

/** Reads the brand. Unbranded is `scoped`. */
export function lifetimeOf(token: unknown): Lifetime {
  return (token as Branded | null)?.[LIFETIME] ?? "scoped";
}
