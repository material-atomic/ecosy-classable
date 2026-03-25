/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, type InjectClassable, type InjectableBuidlerLike, type InjectedInstances, type InjectMap } from "./injectable";
import type { ClassType } from "./types";
import type { StaticExtended } from "./placeholder";

/**
 * Minimal interface for a request guard.
 * Guards decide whether a request should proceed based on the context.
 *
 * @typeParam Ctx - The request context type.
 */
export interface GuardLike<Ctx = unknown> {
  /** Returns `true` to allow the request, `false` to deny. */
  canActivate(context: Ctx): boolean | Promise<boolean>;
}

/**
 * Minimal interface for a result transformer and error handler.
 *
 * @typeParam Ctx - The request context type.
 * @typeParam ErrorType - The error type for `catch`.
 */
export interface FilterLike<Ctx = unknown, ErrorType = unknown> {
  /** Transforms the result before it is returned to the caller. */
  transform?(result: unknown, context: Ctx): unknown | Promise<unknown>;
  /** Catches and handles errors thrown during execution. */
  catch?(error: ErrorType, context: Ctx): unknown | Promise<unknown>;
}

/**
 * Minimal interface for a value transformation pipe.
 *
 * @typeParam Ctx - The request context type.
 * @typeParam Value - The value type being transformed.
 */
export interface PipeLike<Ctx = unknown, Value = unknown> {
  /** Transforms a value before it reaches the handler. */
  transform(value: Value, context: Ctx): Value | Promise<Value>;
}

/**
 * Minimal interface for a request interceptor.
 * Interceptors wrap the execution pipeline for cross-cutting concerns
 * (logging, caching, timing, etc.).
 *
 * @typeParam Ctx - The request context type.
 */
export interface InterceptorLike<Ctx = unknown> {
  /** Wraps the downstream handler. Call `next()` to proceed. */
  intercept(context: Ctx, next: () => Promise<unknown>): unknown | Promise<unknown>;
}

/**
 * Describes the lifecycle hooks attached to a class.
 * Each hook is an array of classable-resolvable entries.
 */
export interface LifecycleDescriptor {
  /** Guards evaluated before execution. */
  readonly guards: InjectClassable<GuardLike>[];
  /** Filters applied to results and errors. */
  readonly filters: InjectClassable<FilterLike>[];
  /** Interceptors wrapping the execution pipeline. */
  readonly interceptors: InjectClassable<InterceptorLike>[];
  /** Pipes transforming input values. */
  readonly pipes: InjectClassable<PipeLike>[];
}

/**
 * Utility type: a class constructor whose static side
 * exposes a `descriptor` of the given shape.
 */
export type WithDescriptor<
  Descriptor extends LifecycleDescriptor,
  Instance = any
> = StaticExtended<{ descriptor: Descriptor }, Instance>;

/**
 * Options for the {@link Lifecycle} class builder.
 * Combines lifecycle hooks with optional dependency injection.
 */
export type LifecycleOptions<
  Descriptor extends LifecycleDescriptor = LifecycleDescriptor,
  Injects extends InjectMap = {},
> = Partial<Descriptor> & {
  /** Optional inject map (forwarded to {@link Injectable}). */
  injects?: Injects;
}

/** Static members exposed on a Lifecycle-branded class. */
export interface LifecycleStatic<Descriptor extends LifecycleDescriptor> {
  /** The deduplicated lifecycle descriptor. */
  readonly descriptor: Descriptor;
}

/**
 * Creates a class with lifecycle hooks and optional dependency injection.
 *
 * Extends {@link Injectable} and attaches a static `descriptor` containing
 * deduplicated arrays of guards, filters, interceptors, and pipes.
 *
 * @param options - Lifecycle hooks and optional inject map.
 * @returns A class constructor with `descriptor` on the static side
 *          and injected instances on the instance side.
 *
 * @example
 * ```ts
 * class UserController extends Lifecycle({
 *   guards: [AuthGuard],
 *   pipes: [ValidationPipe],
 *   injects: { db: DatabasePool },
 * }) {
 *   // this.db is auto-resolved
 * }
 *
 * UserController.descriptor.guards; // [AuthGuard]
 * ```
 */
export function Lifecycle<
  Descriptor extends LifecycleDescriptor = LifecycleDescriptor,
  Injects extends InjectMap = {},
>(options: LifecycleOptions<Descriptor, Injects>) {
  const { injects = {}, ...descriptor } = options;

  const Builder = Injectable<Injects>(injects as Injects);
  const LifecycleBuilder = Builder as ClassType<any> & InjectableBuidlerLike;

  type LifecycleBuilderClass = typeof Builder;
  type LifecycleClass = LifecycleBuilderClass extends StaticExtended<infer StaticBuilder, infer Instance>
    ? StaticExtended<StaticBuilder & LifecycleStatic<Descriptor> & InjectableBuidlerLike, Instance>
    : StaticExtended<LifecycleStatic<Descriptor> & InjectableBuidlerLike, InjectedInstances<Injects>>

  return class LifecycleImpl extends LifecycleBuilder {
    static readonly descriptor = {
      ...descriptor,
      guards: Object.freeze([...Array.from(new Set(descriptor.guards ?? []))]),
      filters: Object.freeze([...Array.from(new Set(descriptor.filters ?? []))]),
      interceptors: Object.freeze([...Array.from(new Set(descriptor.interceptors ?? []))]),
      pipes: Object.freeze([...Array.from(new Set(descriptor.pipes ?? []))]),
    } as Descriptor;
  } as LifecycleClass;
}
