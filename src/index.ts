/**
 * `@ecosy/classable` — class tokens, and the three steps between a declaration
 * and a live object.
 *
 *   declare   `Injectable({ … })`   what a class needs. Static, no instances.
 *   compile   `compile(injects)`    once per module load. Addresses, ownership,
 *                                   async propagation, cycles — all decided here.
 *   execute   `ExecContext`         per request. Allocates, wires, disposes.
 *
 * One line runs underneath all of it: **definition happens at build time,
 * incarnation happens at request time.** Anything static belongs to the plan;
 * anything with a lifetime belongs to a frame.
 */
export { classable, type ClassableSelector } from "./classable";

/* Part of `classable`'s own surface: it exposes these as `classable.Placeholder`,
   `classable.placeholder` and `classable.placeholderInstance`. */
export {
  Placeholder,
  placeholder,
  placeholderInstance,
  type InstanceByStatic,
  type StaticExtended,
  type ThisExtended,
} from "./placeholder";

export { app, shared, lifetimeOf, type Lifetime } from "./lifetime";

export {
  APP_FRAME,
  AppSlots,
  compile,
  identityOf,
  link,
  type Address,
  type CompileOptions,
  type Declaring,
  type FrameIndex,
  type InjectMap,
  type Plan,
  type PlanEntry,
  type PlanProp,
} from "./plan";

export { ExecContext, Frame } from "./exec";

export {
  Injectable,
  type Declaration,
  type InjectableOptions,
  type Injected,
} from "./injectable";

export type {
  AbstractClassType,
  AnyAbstractClass,
  AnyClass,
  AnyConstructor,
  AtomicClass,
  Classable,
  ClassableAsync,
  ClassableSync,
  ClassableTarget,
  ClassFactory,
  ClassFactoryAsync,
  ClassFactorySync,
  ClassStatic,
  ClassType,
  Readonlyable,
} from "./types";
