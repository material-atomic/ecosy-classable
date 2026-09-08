import { classable } from "./classable";
import type { Classable } from "./types";

/** A token, however it was authored. Kept opaque — the plan never calls it, only records it. */
type Token = Classable<unknown, unknown[], string, unknown>;

/**
 * Frame 0 is the application: built once at bootstrap, read-only afterwards.
 * Frames 1..n are the scope chain inside one execution — route, handler,
 * anything nested. Every frame above 0 dies when its scope settles.
 *
 * A number rather than a label because a label only says "not mine"; it still
 * leaves the runtime walking a chain to find out whose. An index is one lookup.
 */
export const APP_FRAME: FrameIndex = 0;

/** A frame's depth. Named so the runtime `Frame` object can keep the plain word. */
export type FrameIndex = number;

/**
 * Where an instance lives, decided at compile time.
 *
 * - `app`    — frame 0. One per process.
 * - `shared` — the frame that DECLARES it; deeper frames borrow.
 * - `scoped` — the frame that resolves it. Fresh per scope.
 */
export type Lifetime = "app" | "shared" | "scoped";

export interface PlanEntry {
  /** Index into the owning frame's slot array. */
  readonly slot: number;
  readonly key: string;
  /** For error messages and debugging. Never read on the execution path. */
  readonly token: Token;
  readonly frame: FrameIndex;
  readonly lifetime: Lifetime;
  /** Does the frame that resolves this own it — and therefore have to dispose it. */
  readonly owns: boolean;
  /** Construction returns a Promise, so the whole branch reaching it must await. */
  readonly awaits: boolean;
  /** Worth putting on the dispose list at all. */
  readonly disposable: boolean;
  /**
   * Absence is acceptable.
   *
   * Narrow on purpose: it only ever covers a token that is not there. A token
   * that IS there and throws still throws, and so does anything it depends on
   * — "may be missing" is not "may fail". It does not propagate either: an
   * optional dependency on something that itself requires a missing token is
   * a failure, not an absence.
   */
  readonly optional: boolean;
  /** Nothing to build: an optional key whose token was not supplied. Resolves to `undefined`. */
  readonly absent: boolean;
}

export interface Plan {
  readonly frame: FrameIndex;
  readonly entries: readonly PlanEntry[];
  readonly byKey: ReadonlyMap<string, PlanEntry>;
  /** How many slots this plan needs in its own frame. */
  readonly slots: number;
}

export type InjectMap = Record<string, Classable<never, never[], string, never> | null | undefined>;

/**
 * Slot assignment for frame 0.
 *
 * An explicit object rather than a module-level Map, because module-level
 * mutable state is exactly what breaks once two applications (or two tests)
 * share a process. The host creates one at bootstrap and passes it in.
 */
export class AppSlots {
  private readonly slots = new Map<unknown, number>();

  slotFor(identity: unknown): number {
    const existing = this.slots.get(identity);
    if (existing !== undefined) return existing;

    const slot = this.slots.size;
    this.slots.set(identity, slot);
    return slot;
  }

  get size(): number {
    return this.slots.size;
  }
}

/** Token identity: a factory descriptor and its target class are the same thing. */
export function identityOf(token: unknown): unknown {
  return classable.getTarget(token as Token) ?? token;
}

function lifetimeOf(token: unknown): Lifetime {
  const brand = (identityOf(token) ?? token) as {
    __global?: boolean;
    __shared?: boolean;
  };

  if (brand?.__global) return "app";
  if (brand?.__shared) return "shared";
  return "scoped";
}

/**
 * True when the token's instances carry a disposal hook.
 *
 * Read off the prototype at compile time so the execution path never has to
 * probe an instance it just built. A token whose hook is attached later, per
 * instance, is missed — deliberately: a disposal contract that can appear
 * halfway through a request is not a contract anyone can rely on.
 */
function disposableOf(token: unknown): boolean {
  const target = identityOf(token) as { prototype?: Record<PropertyKey, unknown> } | undefined;
  const proto = target?.prototype;
  if (!proto) return false;

  const asyncDispose = (Symbol as { asyncDispose?: symbol }).asyncDispose;
  const sync = (Symbol as { dispose?: symbol }).dispose;

  return (
    typeof proto["onDispose"] === "function" ||
    (!!asyncDispose && typeof proto[asyncDispose] === "function") ||
    (!!sync && typeof proto[sync] === "function")
  );
}

/**
 * True when construction yields a Promise.
 *
 * Known here so a branch that is entirely synchronous can stay synchronous.
 * Wrapping every construction in `await` to accommodate the few that need it
 * makes every request pay for the exception.
 */
function awaitsOf(token: unknown): boolean {
  return classable.isFactory(token as Token) && (token as { async?: boolean }).async === true;
}

export interface CompileOptions {
  /** Which frame this plan executes in. 1 unless it is nested deeper. */
  frame?: FrameIndex;
  /**
   * Keys whose token may be absent. Listed here rather than wrapped at the
   * authoring site so the inject map stays a plain map of key to token — and
   * so a key can be optional even when there is no token to wrap.
   */
  optional?: readonly string[];
  /** Slot assignment for frame 0. Required once any token is branded app-wide. */
  app?: AppSlots;
}

/**
 * Compiles an inject map into a plan.
 *
 * Runs once per `compile(...)` call — once per module load, not once per
 * request. Everything derivable from the declaration is derived here, so the
 * execution path only ever allocates and wires.
 */
export function compile(injects: InjectMap, options: CompileOptions = {}): Plan {
  const frame = options.frame ?? 1;

  if (frame < 1) {
    throw new Error(
      `[Plan] Frame ${frame} is reserved: frame ${APP_FRAME} is the application ` +
        `frame and is filled at bootstrap, not compiled from an inject map.`,
    );
  }

  const optionalKeys = new Set(options.optional ?? []);
  const entries: PlanEntry[] = [];
  const byKey = new Map<string, PlanEntry>();
  let nextSlot = 0;

  for (const [key, token] of Object.entries(injects)) {
    if (byKey.has(key)) {
      throw new Error(`[Plan] Duplicate inject key "${key}".`);
    }

    const optional = optionalKeys.has(key);

    if (!token) {
      if (!optional) {
        throw new Error(
          `[Plan] Inject key "${key}" has no token. List it in \`optional\` if ` +
            `absence is acceptable.`,
        );
      }

      // Nothing to build, so no slot is spent and no lifetime applies.
      const absent: PlanEntry = {
        key,
        token: undefined as unknown as Token,
        lifetime: "scoped",
        frame,
        slot: -1,
        owns: false,
        awaits: false,
        disposable: false,
        optional: true,
        absent: true,
      };
      entries.push(absent);
      byKey.set(key, absent);
      continue;
    }

    const lifetime = lifetimeOf(token);

    if (lifetime === "app" && !options.app) {
      throw new Error(
        `[Plan] Inject key "${key}" is application-scoped but no AppSlots was ` +
          `given. Frame ${APP_FRAME} slots are assigned at bootstrap, by the host.`,
      );
    }

    const entry: PlanEntry = {
      key,
      token: token as unknown as Token,
      lifetime,
      frame: lifetime === "app" ? APP_FRAME : frame,
      slot:
        lifetime === "app"
          ? options.app!.slotFor(identityOf(token))
          : nextSlot++,
      // The frame that DECLARES something owns it. `app` lives in frame 0 and
      // is never this frame's to destroy; `shared` is owned right here and
      // borrowed by deeper frames — see `link`, which is what turns a deeper
      // plan's copy of the entry into a borrow.
      owns: lifetime !== "app",
      awaits: awaitsOf(token),
      disposable: disposableOf(token),
      optional,
      absent: false,
    };

    entries.push(entry);
    byKey.set(key, entry);
  }

  return Object.freeze({
    frame,
    entries: Object.freeze(entries),
    byKey,
    slots: nextSlot,
  });
}

/**
 * Re-points a plan's entries at the ancestor frames that already provide them.
 *
 * Compilation happens per module, so a plan cannot know what encloses it. This
 * is the link step: given the ancestor plans, innermost last, any entry whose
 * token an ancestor declares as `shared` stops being built here and becomes a
 * read of that ancestor's frame and slot, with `owns` cleared.
 *
 * Clearing `owns` is the part that matters. It is what stops a nested scope
 * from disposing something its parent is still holding — the failure that
 * would otherwise surface as a use-after-dispose under load, and only there.
 *
 * `scoped` entries are untouched however deep the chain goes: declaring
 * something scoped is declaring that every frame gets its own.
 */
export function link(plan: Plan, ancestors: readonly Plan[]): Plan {
  if (ancestors.length === 0) return plan;

  const provided = new Map<unknown, PlanEntry>();
  for (const ancestor of ancestors) {
    for (const entry of ancestor.entries) {
      if (entry.lifetime === "shared") {
        provided.set(identityOf(entry.token), entry);
      }
    }
  }

  if (provided.size === 0) return plan;

  const entries: PlanEntry[] = [];
  const byKey = new Map<string, PlanEntry>();
  let changed = false;

  for (const entry of plan.entries) {
    if (entry.absent) {
      entries.push(entry);
      byKey.set(entry.key, entry);
      continue;
    }

    const provider = entry.lifetime === "shared" ? provided.get(identityOf(entry.token)) : undefined;

    // An entry already at this frame is the declaration itself, not a borrow.
    const borrowed =
      provider && provider.frame !== plan.frame
        ? { ...entry, frame: provider.frame, slot: provider.slot, owns: false }
        : entry;

    if (borrowed !== entry) changed = true;
    entries.push(borrowed);
    byKey.set(entry.key, borrowed);
  }

  if (!changed) return plan;

  return Object.freeze({
    frame: plan.frame,
    entries: Object.freeze(entries),
    byKey,
    slots: plan.slots,
  });
}
