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

function brand<T>(token: T, lifetime: Lifetime): T {
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
