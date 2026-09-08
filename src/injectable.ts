import type { InjectMap } from "./plan";
import type { AbstractClassType, ClassType } from "./types";

/** The instance a token produces, whether it is a class or a factory descriptor. */
type InstanceOf<T> =
  T extends { target: AbstractClassType<infer R, never[]> } ? R
  : T extends AbstractClassType<infer R, never[]> ? R
  : T extends ClassType<infer R, never[]> ? R
  : unknown;

/** What the injected properties look like on the instance side. */
export type Injected<I extends InjectMap> = {
  readonly [K in keyof I]: undefined extends I[K] ? InstanceOf<I[K]> | undefined : InstanceOf<I[K]>;
};

export interface InjectableOptions<I extends InjectMap> {
  /** Keys whose token may be absent. Reads as `undefined` rather than throwing. */
  optional?: readonly (keyof I & string)[];
}

export interface Declaration<I extends InjectMap> {
  readonly __injects: I;
  readonly __optional: readonly string[];
}

/**
 * Declares what one class needs. The smallest unit here, and deliberately
 * small: it injects onto *this* class, for this class alone.
 *
 * It holds no instances. That is the whole change from what came before, and
 * the reason for it is worth stating plainly: an instance registry on the
 * class is state that outlives every use of the class, so under a server it
 * hands one request the objects built for another. What belongs on the class
 * is the declaration, which never changes; what belongs to a request is the
 * instance, which changes every time.
 *
 * So this returns a class carrying a declaration and nothing else. Compiling
 * the declaration into a plan is `compile`; executing the plan is
 * `ExecContext`. Three steps, three owners, one of them stateless.
 *
 * @example
 * class Users extends Injectable({ db: Database }) {
 *   list() {
 *     return this.db.query("select 1");
 *   }
 * }
 */
export function Injectable<I extends InjectMap>(
  injects: I,
  options: InjectableOptions<I> = {},
): ClassType<Injected<I>, []> & Declaration<I> {
  const optional = Object.freeze([...(options.optional ?? [])]);

  for (const key of optional) {
    if (!(key in injects)) {
      throw new Error(
        `[Injectable] "${String(key)}" is listed as optional but is not a declared ` +
          `key. An optional list that drifts from the map is how a key ends up ` +
          `required by accident.`,
      );
    }
  }

  return class Injected {
    static readonly __injects: I = injects;
    static readonly __optional: readonly string[] = optional;
  } as unknown as ClassType<Injected<I>, []> & Declaration<I>;
}
