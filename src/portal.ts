import { classable } from "./classable";
import type { Plan, PlanEntry } from "./plan";
import type { Classable } from "./types";

/**
 * `Symbol.asyncDispose` is stage-4 but not present on every runtime this
 * package targets. Installing the well-known fallback here — the same one the
 * TypeScript helpers use — means a Portal can be disposed identically on Node,
 * on edge, and in a test runner, without every consumer polyfilling first.
 */
const ASYNC_DISPOSE: symbol =
  (Symbol as { asyncDispose?: symbol }).asyncDispose ??
  Symbol.for("Symbol.asyncDispose");

/** Optional shape: anything a Portal built may release resources on disposal. */
interface Disposable {
  [ASYNC_DISPOSE]?: () => void | Promise<void>;
  onDispose?: () => void | Promise<void>;
}

export interface PortalOptions {
  /** The plan this portal executes. */
  plan: Plan;
  /** Enclosing portal. Omitted only for the root. */
  parent?: Portal;
}

/**
 * A portal: the destination you teleport to, and the only thing in this
 * package that has both an address and a lifetime.
 *
 * ### Address is an object, never a string
 *
 * A portal's identity IS the portal object. There is no key, no registry, no
 * `globalThis` slot — because a string key plus first-write-wins is how one
 * request ends up holding another request's container, silently. Nest reached
 * the same constraint from the other side: `createContextId()` returns a fresh
 * empty object precisely so identity cannot collide.
 *
 * ### It executes a plan; it does not derive one
 *
 * Everything knowable at build time was decided by {@link compile}. A portal
 * only ever answers "have I built this yet, and if not, is it mine to build".
 *
 * ### It builds nothing until asked
 *
 * `resolve` is the only thing that constructs. A plan declaring six tokens for
 * a handler that touches one costs one construction, not six.
 *
 * ### It disposes exactly what it built
 *
 * Ownership is not tracked at run time — it is read off the plan. `shared` and
 * `global` entries are borrowed from an ancestor, so disposing this portal
 * must not touch them; an ancestor still holds them. Only what this portal
 * constructed goes on {@link owned}, in construction order, and disposal runs
 * that list in reverse.
 */
export class Portal {
  /** Identity. Deliberately an object — see the class doc. */
  readonly address: object = Object.freeze({});

  readonly parent: Portal | null;

  private readonly plan: Plan;

  /** token -> instance, for instances THIS portal built or borrowed. */
  private readonly instances = new Map<unknown, unknown>();

  /** Instances this portal constructed, in construction order. Disposal reverses it. */
  private readonly owned: unknown[] = [];

  /** Keys currently being constructed here, for cycle detection. */
  private readonly constructing = new Set<string>();

  private disposed = false;

  constructor(options: PortalOptions) {
    this.plan = options.plan;
    this.parent = options.parent ?? null;
  }

  /** The outermost portal. `global` entries always resolve there. */
  get root(): Portal {
    let node: Portal = this;
    while (node.parent) node = node.parent;
    return node;
  }

  /** Part of the `ActiveScope` contract `inject.ts` already declares. */
  hasKey(key: string): boolean {
    return this.plan.byKey.has(key);
  }

  /**
   * Resolves one key, constructing lazily and at most once per portal.
   *
   * Delegation is decided by the plan, not by searching: a `global` entry goes
   * to the root, a `shared` entry to the nearest ancestor that declares it,
   * and anything else is built here. No scanning, no `instanceof` matching —
   * which also means two tokens sharing a base class can no longer be
   * mistaken for one another.
   */
  resolve<T = unknown>(key: string): T {
    if (this.disposed) {
      throw new Error(
        `[Portal] Resolve after dispose for key "${key}". The portal's request ` +
          `has already settled; something is holding it past its lifetime.`,
      );
    }

    const entry = this.plan.byKey.get(key);
    if (!entry) {
      throw new Error(`[Portal] No inject declared for key "${key}".`);
    }

    const host = this.hostFor(entry);
    if (host !== this) return host.resolve<T>(key);

    const identity = this.identityOf(entry);
    if (this.instances.has(identity)) return this.instances.get(identity) as T;

    if (this.constructing.has(key)) {
      throw new Error(
        `[Portal] Circular dependency: ${[...this.constructing, key].join(" -> ")}`,
      );
    }

    this.constructing.add(key);
    try {
      // One cast, deliberately. `create`'s public overloads split plain
      // classes from sync factories from async ones; a `Classable` union
      // matches none of them, and re-narrowing here would just restate what
      // `create` already decides internally.
      const instance = (classable.create as (cls: unknown) => unknown)(entry.token);

      if (instance instanceof Promise) {
        // An async factory cannot be honoured on a synchronous path. Storing
        // the promise would hand callers a pending object that looks built,
        // and the failure would surface far from here.
        throw new Error(
          `[Portal] Inject "${key}" resolves to an async factory. Synchronous ` +
            `resolve cannot await it.`,
        );
      }

      this.instances.set(identity, instance);
      this.owned.push(instance);
      return instance as T;
    } finally {
      this.constructing.delete(key);
    }
  }

  /**
   * Finds the portal that must own this entry.
   *
   * A `shared` entry whose declaring ancestor cannot be found falls back to
   * this portal rather than throwing: a plan that declares something `shared`
   * without an enclosing provider still has to run, and owning it locally is
   * the conservative reading — it means the instance dies with this portal
   * instead of outliving it somewhere unowned.
   */
  private hostFor(entry: PlanEntry): Portal {
    if (entry.lifetime === "global") return this.root;
    if (entry.lifetime === "scoped") return this;

    const identity = this.identityOf(entry);
    let node: Portal | null = this;
    while (node) {
      if (node.plan.provides.has(identity)) return node;
      node = node.parent;
    }
    return this;
  }

  /** Instances are keyed by token identity, not by property name — two keys may share a token. */
  private identityOf(entry: PlanEntry): unknown {
    return classable.getTarget(entry.token) ?? entry.token;
  }

  /**
   * Disposes everything this portal built, newest first.
   *
   * Reverse order because a dependency must outlive its dependents: whatever
   * was built last may be holding whatever was built before it.
   *
   * Disposal errors are collected, never thrown mid-loop and never swallowed.
   * A failing `onDispose` must not abort the rest of the cleanup, and it must
   * not replace the response the request was about to return — so the caller
   * gets them back and decides where they go.
   */
  async dispose(): Promise<readonly unknown[]> {
    if (this.disposed) return [];
    this.disposed = true;

    const errors: unknown[] = [];

    for (let i = this.owned.length - 1; i >= 0; i--) {
      const instance = this.owned[i] as Disposable | null;
      if (!instance || typeof instance !== "object") continue;

      const hook =
        typeof instance[ASYNC_DISPOSE] === "function"
          ? instance[ASYNC_DISPOSE]
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

    this.owned.length = 0;
    this.instances.clear();
    return errors;
  }

  /** So `await using portal = ...` works wherever the runtime supports it. */
  async [ASYNC_DISPOSE](): Promise<void> {
    await this.dispose();
  }

  /** Opens a child portal. The child borrows `shared` and `global`, owns the rest. */
  fork(plan: Plan): Portal {
    return new Portal({ plan, parent: this });
  }
}
