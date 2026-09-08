import { classable } from "./classable";
import { type Lifetime, lifetimeOf } from "./lifetime";
import type { Classable } from "./types";

type Token = Classable<unknown, unknown[], string, unknown>;

/** A frame's depth. The runtime object keeps the plain word `Frame`. */
export type FrameIndex = number;

/** Frame 0 is the application: filled at bootstrap, never torn down by a request. */
export const APP_FRAME: FrameIndex = 0;

/** Where one instance lives. Two array indices, decided at compile time. */
export interface Address {
  readonly frame: FrameIndex;
  readonly slot: number;
}

/** One of a token's own dependencies, already resolved to an address. */
export interface PlanProp extends Address {
  readonly key: string;
  readonly optional: boolean;
  /** Declared optional and no token supplied. Reads as `undefined`; nothing is built. */
  readonly absent: boolean;
}

export interface PlanEntry extends Address {
  /** For error messages. Never read on the execution path. */
  readonly token: Token;
  readonly lifetime: Lifetime;
  /** The token's own dependencies, wired after construction. */
  readonly props: readonly PlanProp[];
  /** Construction yields a Promise, so the branch reaching it must await. */
  readonly awaits: boolean;
  /** Worth putting on a dispose list at all. */
  readonly disposable: boolean;
}

export interface Plan {
  readonly frame: FrameIndex;
  /**
   * Topologically ordered: a token's dependencies always appear before it.
   *
   * A constraint, not a convenience. It buys three things — cycles are caught
   * here rather than as a stack overflow at request time, `awaits` propagates
   * in a single forward pass with no fixed point, and an eager execution is
   * one sweep.
   */
  readonly entries: readonly PlanEntry[];
  /** The keys this scope was declared with, pointing at their entries. */
  readonly byKey: ReadonlyMap<string, PlanProp>;
  /** Token identity to entry, for `link` and for nested wiring. */
  readonly index: ReadonlyMap<unknown, PlanEntry>;
  /**
   * Address to entry, as `"frame:slot"`.
   *
   * Built here rather than at execution time on purpose: a lookup table that a
   * request has to assemble is derivation smuggled back into the hot path,
   * which is the exact thing this whole plan exists to remove.
   */
  readonly byAddress: ReadonlyMap<string, PlanEntry>;
  /** Slots this plan needs in its own frame. */
  readonly slots: number;
}

export type InjectMap = Record<string, Classable<never, never[], string, never> | null | undefined>;

/** A token that declares dependencies of its own carries them here. */
export interface Declaring {
  __injects?: InjectMap;
  __optional?: readonly string[];
}

/**
 * Slot assignment for frame 0.
 *
 * An explicit object rather than a module-level Map: module-level mutable
 * state is what breaks the moment two applications, or two tests, share a
 * process. The host makes one at bootstrap and passes it in.
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

/** A factory descriptor and its target class are the same token. */
export function identityOf(token: unknown): unknown {
  return classable.getTarget(token as Token) ?? token;
}

function declarationOf(token: unknown): Declaring {
  return (identityOf(token) ?? token) as Declaring;
}

/**
 * Whether instances carry a disposal hook, read off the prototype at compile
 * time so the execution path never probes an instance it just built.
 *
 * A hook attached per instance, later, is missed on purpose: a disposal
 * contract that can appear halfway through a request is not one anything can
 * rely on.
 */
function disposableOf(token: unknown): boolean {
  const proto = (identityOf(token) as { prototype?: Record<PropertyKey, unknown> })?.prototype;
  if (!proto) return false;

  const asyncDispose = (Symbol as { asyncDispose?: symbol }).asyncDispose;
  const dispose = (Symbol as { dispose?: symbol }).dispose;

  return (
    typeof proto["onDispose"] === "function" ||
    (!!asyncDispose && typeof proto[asyncDispose] === "function") ||
    (!!dispose && typeof proto[dispose] === "function")
  );
}

/** Only a factory declaring itself async is assumed to be. */
function asyncOf(token: unknown): boolean {
  return classable.isFactory(token as Token) && (token as { async?: boolean }).async === true;
}

export interface CompileOptions {
  /** Which frame this scope executes in. 1 unless nested deeper. */
  frame?: FrameIndex;
  /** Keys whose token may be absent. */
  optional?: readonly string[];
  /** Slot assignment for frame 0. Required once any token is branded `app`. */
  app?: AppSlots;
}

/**
 * Compiles a scope's declaration into a plan.
 *
 * Walks the whole reachable graph, not just the keys handed in: a token that
 * declares dependencies of its own contributes its entry to the same frame.
 * Slots are assigned across that whole traversal, so one token gets one slot
 * however many places reach it.
 *
 * Runs once per module load. Everything derivable from the declaration is
 * derived here, so the execution path only allocates and wires.
 */
export function compile(injects: InjectMap, options: CompileOptions = {}): Plan {
  const frame = options.frame ?? 1;

  if (frame < 1) {
    throw new Error(
      `[Plan] Frame ${frame} is reserved: frame ${APP_FRAME} holds what bootstrap ` +
        `builds, and is not compiled from a declaration.`,
    );
  }

  const index = new Map<unknown, PlanEntry>();
  const entries: PlanEntry[] = [];
  const visiting: unknown[] = [];
  let nextSlot = 0;

  const addressFor = (token: unknown, lifetime: Lifetime): Address =>
    lifetime === "app"
      ? { frame: APP_FRAME, slot: options.app!.slotFor(identityOf(token)) }
      : { frame, slot: nextSlot++ };

  /**
   * Resolves one declared key, visiting its token first so the dependency's
   * entry — and therefore its `awaits` — is final before the dependent's is
   * computed.
   */
  const propFor = (
    key: string,
    token: unknown,
    optional: boolean,
  ): { prop: PlanProp; entry: PlanEntry | null } => {
    if (!token) {
      if (!optional) {
        throw new Error(
          `[Plan] "${key}" has no token. List it in \`optional\` if absence is ` +
            `acceptable.`,
        );
      }
      return { prop: { key, frame, slot: -1, optional: true, absent: true }, entry: null };
    }

    const entry = visit(token);
    return {
      prop: { key, frame: entry.frame, slot: entry.slot, optional, absent: false },
      entry,
    };
  };

  function visit(token: unknown): PlanEntry {
    const identity = identityOf(token);

    const seen = index.get(identity);
    if (seen) return seen;

    if (visiting.includes(identity)) {
      const names = [...visiting, identity].map(
        (t) => (t as { name?: string })?.name ?? String(t),
      );
      throw new Error(`[Plan] Circular dependency: ${names.join(" -> ")}`);
    }

    const lifetime = lifetimeOf(identity);

    if (lifetime === "app" && !options.app) {
      const name = (identity as { name?: string })?.name ?? "token";
      throw new Error(
        `[Plan] "${name}" is application-scoped but no AppSlots was given. ` +
          `Frame ${APP_FRAME} slots are assigned by the host, at bootstrap.`,
      );
    }

    visiting.push(identity);

    const declared = declarationOf(token);
    const optionalKeys = new Set(declared.__optional ?? []);
    const props: PlanProp[] = [];
    let dependsOnAsync = false;

    for (const [key, dep] of Object.entries(declared.__injects ?? {})) {
      const resolved = propFor(key, dep, optionalKeys.has(key));
      props.push(resolved.prop);
      if (resolved.entry?.awaits) dependsOnAsync = true;
    }

    visiting.pop();

    const entry: PlanEntry = {
      ...addressFor(token, lifetime),
      token: token as Token,
      lifetime,
      props: Object.freeze(props),
      // Async propagates forward: a branch reaching anything async must await.
      // Dependencies are visited first, so each answer is final by the time it
      // is read — which is the second reason topological order is a constraint
      // and not a convenience.
      awaits: asyncOf(token) || dependsOnAsync,
      disposable: disposableOf(token),
    };

    // Pushed after its dependencies, which is what makes `entries` topological.
    index.set(identity, entry);
    entries.push(entry);
    return entry;
  }

  const optionalKeys = new Set(options.optional ?? []);
  const byKey = new Map<string, PlanProp>();

  for (const [key, token] of Object.entries(injects)) {
    if (byKey.has(key)) throw new Error(`[Plan] Duplicate key "${key}".`);
    byKey.set(key, propFor(key, token, optionalKeys.has(key)).prop);
  }

  const byAddress = new Map<string, PlanEntry>();
  for (const entry of entries) byAddress.set(`${entry.frame}:${entry.slot}`, entry);

  return Object.freeze({
    frame,
    entries: Object.freeze(entries),
    byKey,
    index,
    byAddress,
    slots: nextSlot,
  });
}

/**
 * Re-points a plan at the ancestor frames that already provide what it needs.
 *
 * Compilation is per module, so a plan cannot know what encloses it. This is
 * the link step: any token an ancestor declares `shared` stops being built
 * here and becomes a read of that ancestor's address.
 *
 * That is what stops a nested scope from disposing something its parent still
 * holds — the failure that otherwise appears only under load, as a
 * use-after-dispose with no line to blame.
 */
export function link(plan: Plan, ancestors: readonly Plan[]): Plan {
  const provided = new Map<unknown, PlanEntry>();
  for (const ancestor of ancestors) {
    for (const [identity, entry] of ancestor.index) {
      if (entry.lifetime === "shared") provided.set(identity, entry);
    }
  }

  if (provided.size === 0) return plan;

  /** Old address to new, keyed by address so relocation is one lookup. */
  const moved = new Map<string, Address>();
  const kept: PlanEntry[] = [];

  for (const [identity, entry] of plan.index) {
    const provider = provided.get(identity);

    if (provider && provider.frame !== plan.frame) {
      moved.set(`${entry.frame}:${entry.slot}`, {
        frame: provider.frame,
        slot: provider.slot,
      });
      // Dropped from this plan's entries entirely. Leaving it would mean this
      // frame builds its own copy and disposes it — two instances of something
      // declared shared, and the deeper one tearing down while the ancestor
      // still holds its own.
      continue;
    }

    kept.push(entry);
  }

  if (moved.size === 0) return plan;

  const relocate = <P extends PlanProp>(prop: P): P => {
    if (prop.absent) return prop;
    const address = moved.get(`${prop.frame}:${prop.slot}`);
    return address ? { ...prop, ...address } : prop;
  };

  const entries = kept.map((entry) => ({ ...entry, props: entry.props.map(relocate) }));

  const index = new Map<unknown, PlanEntry>();
  const byAddress = new Map<string, PlanEntry>();
  for (const entry of entries) {
    index.set(identityOf(entry.token), entry);
    byAddress.set(`${entry.frame}:${entry.slot}`, entry);
  }

  const byKey = new Map<string, PlanProp>();
  for (const [key, prop] of plan.byKey) byKey.set(key, relocate(prop));

  return Object.freeze({
    frame: plan.frame,
    entries: Object.freeze(entries),
    byKey,
    index,
    byAddress,
    slots: plan.slots,
  });
}
