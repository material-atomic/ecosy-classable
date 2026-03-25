/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { ClassType } from "./types";
import type { StaticExtended } from "./placeholder";

/**
 * Branded type that marks a class as a global singleton.
 *
 * Instances tagged with `__global: true` are managed by the
 * {@link ClassableContainer} and persist across the application lifetime
 * (including HMR cycles).
 */
export type GlobalClassable<T> = T & { readonly __global: true };

/** Options for {@link Global}. Mirrors the inject pattern of {@link Lifecycle}. */
export type GlobalOptions<Injects extends InjectMap = {}> = {
  injects?: Injects;
};

/** Static members exposed on a Global-branded class. */
export interface GlobalStatic {
  readonly __global: true;
}

/**
 * Marks a class as a global singleton with optional dependency injection.
 *
 * Follows the same `extends` pattern as {@link Injectable} and {@link Lifecycle}.
 * The resulting class carries the `__global` brand so that {@link Executor}
 * and {@link ClassableContainer} can distinguish singleton-scoped dependencies
 * from transient ones.
 *
 * @param options - Optional inject map for dependency resolution.
 * @returns A class constructor branded with `__global: true`.
 *
 * @example
 * ```ts
 * // Simple global singleton
 * class DatabasePool extends Global() {
 *   // ...
 * }
 *
 * // Global with injected dependencies
 * class AuthService extends Global({ injects: { db: DatabasePool } }) {
 *   // this.db is auto-resolved
 * }
 * ```
 */
export function Global<Injects extends InjectMap = {}>(
  options: GlobalOptions<Injects> = {},
) {
  const { injects = {} } = options;

  const Builder = Injectable<Injects>(injects as Injects);
  const GlobalBuilder = Builder as ClassType<any> & InjectableBuidlerLike;

  type GlobalBuilderClass = typeof Builder;
  type GlobalClass = GlobalBuilderClass extends StaticExtended<infer StaticBuilder, infer Instance>
    ? StaticExtended<StaticBuilder & GlobalStatic & InjectableBuidlerLike, Instance>
    : StaticExtended<GlobalStatic & InjectableBuidlerLike, InjectedInstances<Injects>>;

  return class GlobalImpl extends GlobalBuilder {
    static readonly __global = true as const;
  } as GlobalClass;
}
