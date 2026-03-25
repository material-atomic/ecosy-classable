/* eslint-disable @typescript-eslint/no-explicit-any */
import { classable } from "./classable";
import { container } from "./container";

/**
 * Request-scoped dependency resolver with automatic garbage collection.
 *
 * Resolves a list of classable dependencies, runs a function with the
 * resolved instances, and discards all transient instances when done.
 * Global singletons are delegated to {@link ClassableContainer},
 * while transient deps live only for the duration of the call.
 */
export class Executor {
  /**
   * Resolves dependencies, executes a function, and disposes transient instances.
   *
   * **Lifecycle:**
   * 1. Resolve each dep — globals via {@link ClassableContainer}, transients via scoped context
   * 2. Execute `fn` with resolved instances
   * 3. Dispose — scoped context falls off the call stack, transients become GC-eligible
   *
   * @typeParam Tokens - Tuple of dependency descriptors.
   * @typeParam ReturnType - The return type of `fn`.
   * @typeParam Runtime - Optional runtime context type.
   *
   * @param fn - Function to execute with resolved dependencies as arguments.
   * @param deps - Array of classable descriptors to resolve.
   * @param runtimeArgs - Optional runtime context passed to factory resolvers.
   * @returns The result of `fn`.
   *
   * @example
   * ```ts
   * const result = await Executor.run(
   *   (db, logger) => db.query("SELECT 1", logger),
   *   [Global(DatabasePool), RequestLogger],
   * );
   * // DatabasePool is a singleton (global), RequestLogger is transient (disposed after run)
   * ```
   */
  static async run<
    Tokens extends readonly any[],
    ReturnType,
    Runtime = never
  >(
    fn: (...args: any[]) => ReturnType | Promise<ReturnType>,
    deps: Tokens,
    ...runtimeArgs: Runtime extends never ? [] : [runtime: Runtime]
  ): Promise<ReturnType> {
    const runtime = runtimeArgs[0];

    // Scoped context: short-lived Map that only survives for the duration of this run
    const gcContext = new Map<unknown, any>();

    const resolvedArgs = await Promise.all(
      deps.map(async (dep) => {
        const target = classable.getTarget(dep as any);

        // 1. GLOBAL → delegate entirely to the ClassableContainer (singleton)
        if ((target as Record<string, unknown>).__global === true) {
          return await (container as any).get(dep, runtime);
        }

        // 2. TRANSIENT → Executor manages the lifecycle within this scope

        // Reuse if already created within this request scope
        if (gcContext.has(target)) {
          return gcContext.get(target);
        }

        // Instantiate via classable core (not yet in scoped context)
        const instanceOrPromise = (classable as any).create(dep, runtime);

        // Store in scoped context for potential reuse by other deps in this run
        gcContext.set(target, instanceOrPromise);

        return await instanceOrPromise;
      })
    );

    // 3. EXECUTE
    const result = await fn(...resolvedArgs);

    // 4. DISPOSE
    // When this function returns, `gcContext` falls off the call stack.
    // All transient instances (e.g. RequestLogger, UserContext) become eligible for GC.
    return result;
  }
}
