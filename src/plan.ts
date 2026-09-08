import { classable } from "./classable";
import type { Classable } from "./types";

/**
 * Where an instance comes from — decided once, at compile time, from the
 * lifetime brand declared on the token itself.
 *
 * This is the whole point of the plan. Deciding it per request means scanning
 * and guessing; deciding it here means every request already knows, for every
 * key, whether it must build the thing or borrow it. Borrowing is also what
 * makes disposal safe: you only ever dispose what you built.
 *
 * - `scoped`   — built and owned by the portal that resolves it.
 * - `shared`   — built and owned by the nearest ancestor portal that DECLARES
 *                it; descendants borrow. (`deepalive`)
 * - `global`   — built and owned by the root portal. (`globally`)
 */
export type Lifetime = "scoped" | "shared" | "global";

/** One resolved slot: a property name, the token behind it, and where it lives. */
export interface PlanEntry {
  readonly key: string;
  readonly token: Classable<unknown, unknown[], string, unknown>;
  readonly lifetime: Lifetime;
}

/**
 * A compiled construction plan.
 *
 * A plan holds NO instances. It is derived once, when the module is loaded,
 * and is then read-only for the life of the process — the dependency graph
 * does not change between requests, only the objects filling it do.
 *
 * That sentence is the entire architecture. Everything static lives here;
 * everything with a lifetime lives in a Portal.
 */
export interface Plan {
  readonly entries: readonly PlanEntry[];
  readonly byKey: ReadonlyMap<string, PlanEntry>;
  /** Tokens this plan declares as `shared`, so a portal knows what it provides. */
  readonly provides: ReadonlySet<unknown>;
}

/** Map of property name to token. The authoring surface; `compile` turns it into a Plan. */
export type InjectMap = Record<string, Classable<never, never[], string, never>>;

/**
 * Reads the lifetime brand off a token.
 *
 * `Global()` and `Transient()` have always written these brands and their own
 * docs called them "advisory marker, not enforced behavior" — nothing read
 * them. This function is the reader. `Transient` maps to `scoped` because
 * that is what transient always meant: fresh per execution unit.
 *
 * An unbranded token is `scoped`. That default is deliberate: a class that
 * never said it was safe to share is not assumed to be.
 */
export function lifetimeOf(token: unknown): Lifetime {
  const target = classable.getTarget(
    token as Classable<unknown, unknown[], string, unknown>,
  ) as { __global?: boolean; __shared?: boolean } | undefined;

  const brand = (target ?? token) as { __global?: boolean; __shared?: boolean };

  if (brand?.__global) return "global";
  if (brand?.__shared) return "shared";
  return "scoped";
}

/**
 * Compiles an inject map into a plan.
 *
 * Runs once per `Injectable(...)` call — that is, once per module load, not
 * once per request. Anything expensive belongs here rather than in the
 * execute path, which is why key validation and lifetime resolution happen
 * up front instead of being re-derived on every construction.
 */
export function compile(injects: InjectMap): Plan {
  const entries: PlanEntry[] = [];
  const byKey = new Map<string, PlanEntry>();
  const provides = new Set<unknown>();

  for (const [key, token] of Object.entries(injects)) {
    if (byKey.has(key)) {
      // Object.entries cannot produce this, but a hand-built map or a merge
      // can. Failing loudly here beats one silently shadowing the other.
      throw new Error(`[Plan] Duplicate inject key "${key}".`);
    }

    if (!token) {
      throw new Error(`[Plan] Inject key "${key}" has no token.`);
    }

    const entry: PlanEntry = {
      key,
      token: token as unknown as Classable<unknown, unknown[], string, unknown>,
      lifetime: lifetimeOf(token),
    };

    entries.push(entry);
    byKey.set(key, entry);
    if (entry.lifetime === "shared") provides.add(classable.getTarget(entry.token) ?? entry.token);
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    byKey,
    provides,
  });
}
