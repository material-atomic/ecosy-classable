import { classable } from "./classable";
import type { Plan, PlanEntry } from "./plan";
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
 * `slots` is a flat array, not a Map: the slot index came out of the plan, so
 * there is nothing to hash and nothing to compare. `undefined` means not built
 * yet — which is the whole of the laziness mechanism.
 *
 * `owned` exists separately, and it must. It holds only what this frame
 * actually constructed, in construction order. Plan entries are topologically
 * ordered, and under lazy resolution most of them are never built, so walking
 * the plan backwards to dispose would reach for instances that do not exist.
 */
export class Frame {
  readonly slots: unknown[];
  readonly owned: object[] = [];

  constructor(size: number) {
    this.slots = new Array<unknown>(size);
  }
}

/**
 * The per-execution object: the thing Nest never had.
 *
 * Nest keys request instances by `ContextId` in a `WeakMap` on every
 * `InstanceWrapper`, so a request's instances end up scattered across every
 * provider that built one. You can look one up; you can never enumerate the
 * set. Disposal needs the set — which is why there is no end-of-request hook
 * to be found in `packages/core`. There is no object to hang it on.
 *
 * This is that object. Identity is the object itself: no key, no registry, no
 * `globalThis` slot. A string key plus first-write-wins is how one request
 * ends up holding another request's instances, with nothing to show for it in
 * the logs.
 */
export class ExecContext {
  /** frames[0] is the application frame; 1..n are the scope chain. */
  private readonly frames: Frame[];

  /** Plans indexed by frame, so an entry read from frame N is built by plan N. */
  private readonly plans: (Plan | null)[];

  private readonly building = new Set<string>();

  private settled = false;

  private constructor(frames: Frame[], plans: (Plan | null)[]) {
    this.frames = frames;
    this.plans = plans;
  }

  /**
   * Opens the application frame. Built once, at bootstrap, and shared by every
   * execution afterwards — so it is never disposed on the request path.
   */
  static application(slots: number): ExecContext {
    return new ExecContext([new Frame(slots)], [null]);
  }

  /**
   * Opens a scope inside this one.
   *
   * Frames are copied by reference, so a child reads its ancestors' slots
   * directly — no chain walk, because the plan already said which frame. The
   * child's own frame is the only one it may dispose.
   */
  open(plan: Plan): ExecContext {
    if (plan.frame !== this.frames.length) {
      throw new Error(
        `[ExecContext] Plan compiled for frame ${plan.frame} cannot open at ` +
          `depth ${this.frames.length}. Compile it with { frame: ${this.frames.length} }.`,
      );
    }

    const child = new ExecContext(
      [...this.frames, new Frame(plan.slots)],
      [...this.plans, plan],
    );
    return child;
  }

  private get depth(): number {
    return this.frames.length - 1;
  }

  private entryFor(key: string): PlanEntry {
    const plan = this.plans[this.depth];
    const entry = plan?.byKey.get(key);
    if (!entry) throw new Error(`[ExecContext] No inject declared for key "${key}".`);
    return entry;
  }

  /** Part of the `ActiveScope` contract `inject.ts` already declares. */
  hasKey(key: string): boolean {
    return this.plans[this.depth]?.byKey.has(key) ?? false;
  }

  /**
   * Resolves one key. Two array lookups decide where it lives; nothing is
   * searched, and no `instanceof` is consulted — so two tokens sharing a base
   * class can no longer be mistaken for one another, because they are two
   * different numbers.
   */
  resolve<T = unknown>(key: string): T {
    const entry = this.entryFor(key);

    if (entry.awaits) {
      throw new Error(
        `[ExecContext] Inject "${key}" is built asynchronously. Use resolveAsync; ` +
          `a synchronous resolve cannot await it, and storing the promise would ` +
          `hand callers something that only looks built.`,
      );
    }

    const existing = this.read(entry);
    if (existing !== undefined) return existing as T;

    return this.build(entry) as T;
  }

  /** As {@link resolve}, but awaits tokens the plan marked `awaits`. */
  async resolveAsync<T = unknown>(key: string): Promise<T> {
    const entry = this.entryFor(key);

    const existing = this.read(entry);
    if (existing !== undefined) return existing as T;

    const created = this.build(entry, true);
    if (!(created instanceof Promise)) return created as T;

    const instance = await created;
    this.commit(entry, instance);
    return instance as T;
  }

  private read(entry: PlanEntry): unknown {
    return this.frames[entry.frame]?.slots[entry.slot];
  }

  private build(entry: PlanEntry, allowAsync = false): unknown {
    if (this.settled) {
      throw new Error(
        `[ExecContext] Resolve after settle for key "${entry.key}". Its scope has ` +
          `already ended; something is holding the context past its lifetime.`,
      );
    }

    if (entry.frame > this.depth) {
      throw new Error(
        `[ExecContext] Inject "${entry.key}" belongs to frame ${entry.frame}, ` +
          `which is deeper than this context.`,
      );
    }

    if (this.building.has(entry.key)) {
      throw new Error(
        `[ExecContext] Circular dependency: ${[...this.building, entry.key].join(" -> ")}`,
      );
    }

    this.building.add(entry.key);
    try {
      // One cast, deliberately: `create`'s overloads split plain classes from
      // sync factories from async ones, and a `Classable` union matches none of
      // them. Re-narrowing here would only restate what `create` already decides.
      const created = (classable.create as (cls: unknown) => unknown)(
        entry.token as Classable<unknown, unknown[], string, unknown>,
      );

      if (created instanceof Promise) {
        if (!allowAsync) {
          throw new Error(
            `[ExecContext] Inject "${entry.key}" returned a Promise but the plan ` +
              `did not mark it async. Declare the factory async so callers know ` +
              `to await it.`,
          );
        }
        return created;
      }

      this.commit(entry, created);
      return created;
    } finally {
      this.building.delete(entry.key);
    }
  }

  /**
   * Writes an instance into its frame, and onto that frame's dispose list.
   *
   * Ownership follows storage, not the caller: `entry.frame` already names the
   * frame that declared this token, so whoever happens to trigger the build,
   * the instance is recorded against its declaring frame.
   *
   * That distinction is not cosmetic. A nested scope resolving a `shared`
   * token builds it into an ancestor's frame while its own entry reads
   * `owns: false`. Registering ownership from the caller's point of view would
   * leave the instance stored but unowned — nobody disposes it, and it lives
   * until the process does. `owns` stays on the entry because a reader still
   * wants to know it borrowed, but deciding it twice is how the two answers
   * drift apart.
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
   * dependents. Ancestor frames are untouched — this context borrowed from
   * them, it does not own them.
   *
   * Errors are collected and returned, never thrown mid-loop and never
   * swallowed: one failing hook must not abort the rest of the teardown, and
   * it must not replace the response the request was about to send.
   */
  async settle(): Promise<readonly unknown[]> {
    if (this.settled) return [];
    this.settled = true;

    // Only ever this context's own frame. Ancestors were borrowed from, not
    // owned — and the application frame is settled by whoever opened it, at
    // shutdown, never on a request path.
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
