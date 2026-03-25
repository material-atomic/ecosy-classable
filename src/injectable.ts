/* eslint-disable @typescript-eslint/no-explicit-any */
import { classable } from "./classable";
import type { StaticExtended } from "./placeholder";
import type { ClassFactorySync, ClassType } from "./types";

/**
 * A classable entry in an inject map.
 * Either a zero-arg class constructor or a synchronous {@link ClassFactorySync}
 * whose `get()` receives an {@link InjectedAccessor}.
 *
 * @typeParam T - The instance type to inject.
 * @typeParam Injected - The accessor type passed to factory resolvers.
 */
export type InjectClassable<T, Injected = any> =
  | ClassType<T, []>
  | ClassFactorySync<T, any[], string, Injected>;

/**
 * Read-only accessor for resolved inject instances.
 * Passed to factory resolvers so they can reference sibling injections.
 */
class InjectedAccessor {
  constructor(private readonly instances: Map<string, any>) {}

  /**
   * Retrieves an injected instance by key.
   * Throws if the key does not exist.
   *
   * @param key - The injection key (matches the inject map property name).
   */
  get<T = any>(key: string): T {
    if (!this.instances.has(key)) {
      throw new Error(`[Injectable] Injection "${key}" does not exist`);
    }
    return this.instances.get(key);
  }

  /** Checks whether an injection exists for the given key. */
  has(key: string) {
    return this.instances.has(key);
  }
}

/**
 * A record mapping injection keys to their {@link InjectClassable} descriptors.
 * Each value is either a class or a factory whose resolver receives
 * an {@link InjectedAccessor}.
 */
export type InjectMap = {
  [k: string]: InjectClassable<any, InjectedAccessor>;
};

/**
 * Lifecycle hook for post-construction initialization.
 * If an injected instance implements `onInit`, it will be called
 * after all injections are resolved.
 */
export interface InjectableOnInit {
  /** Called after construction. May return a Promise for async init. */
  onInit?(): void | Promise<void>;
}

/**
 * Strips the index signature from `T`, keeping only explicitly declared keys.
 * Used internally to clean up mapped types from {@link InjectMap}.
 */
type RemoveIndexSignature<T> = {
  [K in keyof T as {} extends Record<K, unknown> ? never : K]: T[K]
};

/**
 * Maps an {@link InjectMap} to its resolved instance types.
 * The result includes {@link InjectableOnInit} for lifecycle support.
 */
export type InjectedInstances<Injects extends InjectMap> =
  InjectableOnInit &
  RemoveIndexSignature<{
    [K in keyof Injects]: Injects[K] extends InjectClassable<infer Instance>
      ? Instance
      : never;
  }>;

/**
 * Static interface exposed on classes returned by {@link Injectable}.
 * Provides utility methods for lifecycle management.
 */
export interface InjectableBuidlerLike {
  /** Type guard: checks if an object implements {@link InjectableOnInit}. */
  isInitializable(obj: unknown): obj is InjectableOnInit;
  /** Awaits all `onInit()` hooks of the target's injected instances. */
  waitForInjects<Target extends InjectableBuilder>(target: Target): Promise<void>;
}

/**
 * Internal base class for Injectable-generated classes.
 * Manages the instance registry and provides static lifecycle utilities.
 */
class InjectableBuilder implements InjectableOnInit {
  /** Internal registry of resolved instances, keyed by injection name. */
  protected __instances = new Map<string, any>();
  /** Accessor passed to factory resolvers for cross-referencing injections. */
  protected __accessor = new InjectedAccessor(this.__instances);

  /** Optional lifecycle hook, called after construction. */
  onInit?(): void | Promise<void>;

  /** Type guard: checks if an object has an `onInit` method. */
  static isInitializable(obj: unknown): obj is InjectableOnInit {
    return (
      typeof obj === "object" &&
      obj !== null &&
      Object.prototype.hasOwnProperty.call(obj, "onInit") &&
      typeof (obj as Record<"onInit", unknown>).onInit === "function"
    );
  }

  /**
   * Awaits all `onInit()` hooks of the target's injected instances.
   * Collects all Promises and resolves them in parallel.
   */
  static async waitForInjects<Target extends InjectableBuilder>(target: Target) {
    const initPromises: Promise<void>[] = [];

    for (const instance of target.__instances.values()) {
      if (this.isInitializable(instance)) {
        const result = instance.onInit?.();

        if (result && result instanceof Promise) {
          initPromises.push(result);
        }
      }
    }

    if (initPromises.length) {
      await Promise.all(initPromises);
    }
  }
}

/**
 * Creates a class with auto-resolved dependency injection.
 *
 * Each key in the inject map becomes a property on instances of the
 * returned class. Dependencies are resolved synchronously at construction
 * time via `classable.create()` or factory resolvers.
 *
 * @param injects - A map of injection keys to their classable descriptors.
 * @returns A class constructor with injected properties and static lifecycle utilities.
 *
 * @example
 * ```ts
 * class UserService extends Injectable({
 *   db: DatabasePool,
 *   cache: {
 *     target: RedisCache,
 *     get: (accessor) => [accessor.get("db")] as const,
 *   },
 * }) {
 *   getUser(id: string) {
 *     return this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
 *   }
 * }
 * ```
 */
export function Injectable<Injects extends InjectMap>(injects: Injects) {
  return class InjectableImpl extends InjectableBuilder {
    constructor() {
      super();

      for (const key of Object.keys(injects)) {
        const value = injects[key];

        let instance: any;

        if (classable.isFactory<any, any[], string, InjectedAccessor>(value)) {
          const args = value.get?.(this.__accessor) ?? [];
          
          if (args instanceof Promise) {
            throw new Error(`[Injectable] Async selector not supported for "${key}"`);
          }

          instance = new value.target(...args);
        } else if (classable.is(value)) {
          instance = classable.create(value);
        }

        Object.defineProperty(this, key, {
          value: instance,
          enumerable: true,
        });

        this.__instances.set(key, instance);
      }
    }
  } as StaticExtended<InjectableBuidlerLike, InjectedInstances<Injects>>;
}
