/* eslint-disable @typescript-eslint/no-explicit-any */
import { classable } from "./classable";
import type {
  ClassType,
  ClassFactorySync,
  ClassFactoryAsync,
  Readonlyable,
} from "./types";
import type { InstanceByStatic } from "./placeholder";

/** Unique Symbol key for the global instance registry on `globalThis`. */
const GLOBAL_CONTAINER_KEY = Symbol.for("ecosy.classable.global_instances");

/**
 * Singleton registry backed by `globalThis`.
 *
 * Stores instances keyed by their resolved target class, ensuring
 * singletons survive HMR cycles in Next.js, Vite, and similar bundlers.
 */
export class ClassableContainer {
  /**
   * Lazily initializes and returns the global instance store.
   * Attaching to `globalThis` via a Symbol key ensures singletons
   * persist across HMR reloads (e.g. Next.js dev, Vite).
   */
  private get instances(): Map<unknown, any> {
    const globalObj = globalThis as any;
    if (!globalObj[GLOBAL_CONTAINER_KEY]) {
      globalObj[GLOBAL_CONTAINER_KEY] = new Map();
    }
    return globalObj[GLOBAL_CONTAINER_KEY];
  }

  // =====================================================================
  // Overloads (mirroring classable.create)
  // =====================================================================

  get<T>(cls: ClassType<T, []>): T;

  get<T, Args extends Readonlyable<any[]>, Getter extends string, Runtime>(
    cls: ClassFactorySync<T, Args, Getter, Runtime>,
    ...args: Runtime extends never ? [] : [runtime: Runtime]
  ): T;

  get<T, Args extends Readonlyable<any[]>, Getter extends string, Runtime>(
    cls: ClassFactoryAsync<T, Args, Getter, Runtime>,
    ...args: Runtime extends never ? [] : [runtime: Runtime]
  ): Promise<T>;

  get<T, Method extends string, Args extends Readonlyable<any[]>, Runtime>(
    def: InstanceByStatic<T, Method, Args, Runtime>,
    ...args: Runtime extends never ? [] : [runtime: Runtime]
  ): T;

  // =====================================================================
  // Core implementation
  // =====================================================================

  get(cls: any, runtime?: any): any {
    const key = this.resolveKey(cls);

    // 1. Return cached singleton if already created
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    // 2. Delegate instantiation to classable core
    const instanceOrPromise = classable.create(cls, runtime);

    // 3. Store in the global registry
    this.instances.set(key, instanceOrPromise);

    // 4. Safe async fallback: remove from registry on failure so next call retries
    if (instanceOrPromise instanceof Promise) {
      instanceOrPromise.catch(() => {
        this.instances.delete(key);
      });
    }

    return instanceOrPromise;
  }

  /**
   * Manually registers an instance by token.
   * Useful for mocking in unit tests.
   *
   * @param token - The class or identifier to register under.
   * @param instance - The instance to store.
   */
  set<T>(token: unknown, instance: T): void {
    this.instances.set(token, instance);
  }

  /**
   * Checks whether an instance has already been created for the given token.
   *
   * @param token - The class or identifier to look up.
   */
  has(token: unknown): boolean {
    return this.instances.has(token);
  }

  /**
   * Removes a specific instance from the registry.
   *
   * @param token - The class or identifier to remove.
   * @returns `true` if the entry was found and removed.
   */
  delete(token: unknown): boolean {
    return this.instances.delete(this.resolveKey(token));
  }

  /**
   * Clears the entire global registry.
   * Intended for system teardown or test cleanup.
   */
  clear(): void {
    this.instances.clear();
  }

  /**
   * Resolves the identity key for a given classable.
   * Regardless of whether the input is a Factory, InstanceByStatic,
   * or a plain class, the key is always the underlying target class.
   */
  private resolveKey(cls: any): unknown {
    if (typeof cls === "string" || typeof cls === "symbol") {
      return cls;
    }
    return classable.getTarget(cls);
  }
}

/** Default global container instance, ready to use. */
export const container = new ClassableContainer();
