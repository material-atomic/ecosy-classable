import { classable } from "./classable";
import type { Address, Plan, PlanEntry, PlanProp } from "./plan";
import type { Classable } from "./types";

const ASYNC_DISPOSE: symbol =
  (Symbol as { asyncDispose?: symbol }).asyncDispose ?? Symbol.for("Symbol.asyncDispose");
const SYNC_DISPOSE: symbol =
  (Symbol as { dispose?: symbol }).dispose ?? Symbol.for("Symbol.dispose");

interface DisposeHooks {
  [ASYNC_DISPOSE]?: () => void | Promise<void>;
  [SYNC_DISPOSE]?: () => void;
  onDispose?: () => void | Promise<void>;
}

/**
 * One level of storage.
 *
 * `slots` is a flat array, not a Map: the index came out of the plan, so there
 * is nothing to hash and nothing to compare. `undefined` means not built yet,
 * which is the whole of the laziness mechanism.
 *
 * `owned` is separate, and must be. Plan entries are topologically ordered and
 * under lazy resolution most are never built, so disposing by walking the plan
 * backwards would reach for instances that never existed. `owned` holds what
 * this frame actually constructed, in construction order.
 */
export class Frame {
  readonly slots: unknown[];
  readonly owned: object[] = [];

  constructor(size: number) {
    this.slots = new Array<unknown>(size);
  }
}

/**
 * The per-execution object — the thing Nest never had.
 *
 * Nest keys request instances by `ContextId` in a `WeakMap` on every
 * `InstanceWrapper`, so one request's instances end up scattered across every
 * provider that built one. You can look one up; you can never enumerate the
 * set. Disposal needs the set, which is why there is no end-of-request hook
 * anywhere in its core: there is no object to hang one on.
 *
 * Identity is the object itself — no key, no registry, no `globalThis` slot.
 * A string key plus first-write-wins is how one request ends up holding
 * another request's instances, with nothing in the logs to show for it.
 */
export class ExecContext {
  private readonly frames: Frame[];
  private readonly plans: (Plan | null)[];
  private readonly building = new Set<string>();

  private settled = false;

  private constructor(frames: Frame[], plans: (Plan | null)[]) {
    this.frames = frames;
    this.plans = plans;
  }

  /** Opens frame 0. Built once at bootstrap, shared by every execution after. */
  static application(slots = 0): ExecContext {
    return new ExecContext([new Frame(slots)], [null]);
  }

  /** Opens a scope inside this one. Ancestor frames are shared by reference. */
  open(plan: Plan): ExecContext {
    if (plan.frame !== this.frames.length) {
      throw new Error(
        `[ExecContext] Plan compiled for frame ${plan.frame} cannot open at depth ` +
          `${this.frames.length}. Compile it with { frame: ${this.frames.length} }.`,
      );
    }

    return new ExecContext([...this.frames, new Frame(plan.slots)], [...this.plans, plan]);
  }

  private get depth(): number {
    return this.frames.length - 1;
  }

  /** Part of the `ActiveScope` contract the injector layer expects. */
  hasKey(key: string): boolean {
    return this.plans[this.depth]?.byKey.has(key) ?? false;
  }

  /**
   * Finds the entry at an address.
   *
   * Innermost first, because a linked plan drops what an ancestor provides —
   * so anything not here belongs to something enclosing. The walk is bounded
   * by scope depth, which is two or three, and every level is a Map lookup.
   */
  private entryAt(address: Address): PlanEntry | null {
    const at = `${address.frame}:${address.slot}`;
    for (let level = this.depth; level >= 0; level--) {
      const entry = this.plans[level]?.byAddress.get(at);
      if (entry) return entry;
    }
    return null;
  }

  private propFor(key: string): PlanProp {
    const prop = this.plans[this.depth]?.byKey.get(key);
    if (!prop) throw new Error(`[ExecContext] No inject declared for key "${key}".`);
    return prop;
  }

  /**
   * Resolves one declared key.
   *
   * Two array indices decide where the instance lives; nothing is searched and
   * no `instanceof` is consulted, so two tokens sharing a base class can no
   * longer be mistaken for one another — they are two different numbers.
   */
  resolve<T = unknown>(key: string): T {
    return this.read(this.propFor(key)) as T;
  }

  /** As {@link resolve}, but awaits anything the plan marked `awaits`. */
  async resolveAsync<T = unknown>(key: string): Promise<T> {
    return (await this.readAsync(this.propFor(key))) as T;
  }

  private read(prop: PlanProp): unknown {
    if (prop.absent) return undefined;

    const existing = this.frames[prop.frame]?.slots[prop.slot];
    if (existing !== undefined) return existing;

    const entry = this.entryAt(prop);
    if (!entry) {
      if (prop.optional) return undefined;
      throw new Error(
        `[ExecContext] Nothing provides "${prop.key}" at frame ${prop.frame} ` +
          `slot ${prop.slot}.`,
      );
    }

    if (entry.awaits) {
      throw new Error(
        `[ExecContext] "${prop.key}" is built asynchronously. Use resolveAsync — a ` +
          `synchronous resolve cannot await it, and storing the promise would hand ` +
          `callers something that only looks built.`,
      );
    }

    return this.build(entry);
  }

  private async readAsync(prop: PlanProp): Promise<unknown> {
    if (prop.absent) return undefined;

    const existing = this.frames[prop.frame]?.slots[prop.slot];
    if (existing !== undefined) return existing;

    const entry = this.entryAt(prop);
    if (!entry) {
      if (prop.optional) return undefined;
      throw new Error(
        `[ExecContext] Nothing provides "${prop.key}" at frame ${prop.frame} ` +
          `slot ${prop.slot}.`,
      );
    }

    return await this.build(entry, true);
  }

  private build(entry: PlanEntry, allowAsync: false): unknown;
  private build(entry: PlanEntry, allowAsync: true): Promise<unknown>;
  private build(entry: PlanEntry, allowAsync?: boolean): unknown;
  private build(entry: PlanEntry, allowAsync = false): unknown {
    if (this.settled) {
      throw new Error(
        `[ExecContext] Resolve after settle. This scope has ended; something is ` +
          `holding the context past its lifetime.`,
      );
    }

    const name = (entry.token as { name?: string })?.name ?? `${entry.frame}:${entry.slot}`;

    if (entry.frame > this.depth) {
      throw new Error(
        `[ExecContext] "${name}" belongs to frame ${entry.frame}, deeper than this context.`,
      );
    }

    // The plan already caught cycles; this catches a token whose constructor
    // reaches back into the context for itself, which no static pass can see.
    if (this.building.has(name)) {
      throw new Error(
        `[ExecContext] Re-entrant construction: ${[...this.building, name].join(" -> ")}`,
      );
    }

    this.building.add(name);
    try {
      // One cast, deliberately: `create`'s overloads split plain classes from
      // sync factories from async ones, and a `Classable` union matches none of
      // them. Re-narrowing would only restate what `create` already decides.
      const created = (classable.create as (cls: unknown) => unknown)(
        entry.token as Classable<unknown, unknown[], string, unknown>,
      );

      if (created instanceof Promise) {
        if (!allowAsync) {
          throw new Error(
            `[ExecContext] "${name}" returned a Promise but the plan did not mark it ` +
              `async. Declare the factory async so callers know to await it.`,
          );
        }
        return created.then((instance) => {
          this.wire(entry, instance);
          this.commit(entry, instance);
          return instance;
        });
      }

      this.wire(entry, created);
      this.commit(entry, created);
      return created;
    } finally {
      this.building.delete(name);
    }
  }

  /**
   * Fills in a token's own dependencies, after it exists.
   *
   * After rather than during, because a plan describes properties, not
   * constructor parameters — so a token is constructed bare and then wired.
   * The cost is that a constructor cannot read its own dependencies; the gain
   * is that a cycle between two tokens is a plan-time error rather than a
   * runtime one.
   */
  private wire(entry: PlanEntry, instance: unknown): void {
    if (!instance || typeof instance !== "object" || entry.props.length === 0) return;

    // Plain assignment, not `Object.defineProperty`.
    //
    // The descriptor here was `{ enumerable, configurable, writable }` all true
    // — which is what assignment produces on a fresh object anyway. So the
    // descriptor bought nothing, and cost three things per property per
    // request: the slow path into the property-definition machinery, a fresh
    // descriptor object allocated and immediately discarded, and a hidden-class
    // transition that assignment in a fixed order does not force.
    //
    // Fixed order matters as much as the operation. `entry.props` comes from
    // the plan, so every instance of a token takes the same keys in the same
    // sequence, and the shape stays monomorphic across requests.
    for (const prop of entry.props) {
      (instance as Record<string, unknown>)[prop.key] = this.read(prop);
    }
  }

  /**
   * Writes an instance into its frame, and onto that frame's dispose list.
   *
   * Ownership follows storage, not the caller. `entry.frame` names the frame
   * that declared the token, so whoever triggers the build, the instance is
   * recorded against its declaring frame.
   *
   * That is not cosmetic. A nested scope resolving a shared token builds it
   * into an ancestor's frame; recording ownership from the caller's point of
   * view would leave it stored but unowned — nobody disposes it, and it lives
   * as long as the process does.
   */
  private commit(entry: PlanEntry, instance: unknown): void {
    const frame = this.frames[entry.frame];
    if (!frame) return;

    frame.slots[entry.slot] = instance;

    if (entry.disposable && instance && typeof instance === "object") {
      frame.owned.push(instance as object);
    }
  }

  /**
   * Ends this scope and disposes what its own frame built, newest first.
   *
   * Reverse construction order because a dependency has to outlive its
   * dependents. Ancestor frames are untouched: this context borrowed from
   * them, it does not own them.
   *
   * Errors are collected and returned — never thrown mid-loop, never
   * swallowed. One failing hook must not abort the rest of the teardown, and
   * it must not replace the response the request was about to send.
   */
  async settle(): Promise<readonly unknown[]> {
    if (this.settled) return [];
    this.settled = true;

    const frame = this.frames[this.depth];
    if (!frame) return [];

    const errors: unknown[] = [];

    for (let i = frame.owned.length - 1; i >= 0; i--) {
      const instance = frame.owned[i] as DisposeHooks;

      const hook =
        typeof instance[ASYNC_DISPOSE] === "function"
          ? instance[ASYNC_DISPOSE]
          : typeof instance[SYNC_DISPOSE] === "function"
            ? instance[SYNC_DISPOSE]
            : typeof instance.onDispose === "function"
              ? instance.onDispose
              : null;

      if (!hook) continue;

      try {
        await hook.call(instance);
      } catch (error) {
        errors.push(error);
      }
    }

    frame.owned.length = 0;
    frame.slots.length = 0;
    return errors;
  }

  /** So `await using scope = parent.open(plan)` works where the runtime supports it. */
  async [ASYNC_DISPOSE](): Promise<void> {
    await this.settle();
  }
}
