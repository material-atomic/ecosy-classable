import type { AnchorLike } from "./anchorable";
import type { AnchoribilityLike } from "./anchoribility";
import { classable } from "./classable";
import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { StaticExtended } from "./placeholder";
import type { Classable, ClassType } from "./types";

export interface TeleportableOptions<Injects extends InjectMap = {}> {
  injects: Injects;
  getways?: Array<AnchoribilityLike<AnchorLike> | AnchorLike>;
}

/**
 * Teleportable: a **cross-container reconciliation engine**.
 *
 * Where {@link Injectable} performs intra-container reconciliation (same
 * class, successive re-constructions reuse compatible prior instances),
 * Teleportable merges dependencies from *external* anchors (teleported)
 * with locally-constructed ones (native) at the moment of construction.
 *
 * ### Semantics
 *
 * - **Snapshot, not reactive.** The instance pool is gathered synchronously
 *   at constructor time. If the underlying anchor mutates afterwards,
 *   this instance will not observe the change. Construct a new instance
 *   to re-capture.
 *
 * - **External trust.** Matching teleported instances uses `instanceof` /
 *   `constructor === Target` — the same loose identity logic Injectable
 *   uses for reconciliation. External anchors are trusted sources.
 *
 * - **Ownership is not tracked.** Teleported and native instances both
 *   end up in `__instances`. If/when dispose is added at this layer,
 *   an ownership map will be needed.
 *
 * - **Instance extraction filter.** Only values with a function constructor
 *   (i.e. actual class instances) are pulled from anchor portals. Plain
 *   config objects, nested data, and closures are skipped.
 *
 * - **Portal scan is a fallback, not a contract.** Instance extraction uses
 *   `Object.values(Portal)` to find instances. `AnchorLike` does *not*
 *   require exposing instances as enumerable own-properties. TODO: promote
 *   to an explicit protocol (e.g. `Anchor.__instances` or an iterator).
 *
 * - **First-match-wins (implicit priority).** When multiple getways expose
 *   a matching instance for the same inject key, the first match wins in
 *   `getways` iteration order. There is no priority field or strategy hook.
 *   Callers must order `getways` accordingly.
 */
export function Teleportable<Injects extends InjectMap = {}>(options: TeleportableOptions<Injects>) {
  const { injects, getways = [] } = options;

  // Double-cast through `unknown` because `Injectable({})`'s declared static
  // surface (`InjectableBuidlerLike`) intentionally hides the `__instances`
  // registry from public view. Teleport needs to write into it, so we widen
  // the static shape locally without leaking it back to authors.
  const Accessor = Injectable({}) as unknown as ClassType<object> & {
    __instances: Map<string, unknown>;
  };

  return class Teleport extends Accessor {
    /**
     * Per-class registry — same pattern as Injectable's child-layer static.
     * Declared here so Teleport owns its own Map instead of inheriting
     * Accessor's via the prototype chain and sharing state across sibling
     * Teleport classes.
     */
    static override __instances: Map<string, unknown> = new Map<string, unknown>();

    constructor() {
      super();

      // `super()` (from Injectable({})) overwrites `new.target.__instances`
      // with a fresh empty Map, so we write into that below.
      const Cls = new.target as typeof Teleport;

      // 1. Gather instances from external getways (snapshot at construction time).
      // Insertion order = iteration order of `getways`, then `Object.values(Portal)`.
      // First-match-wins loop below relies on this being stable.
      const instancePool = new Set<object>();
      for (const Getway of getways) {
        const Portal =
          (Getway as AnchoribilityLike<AnchorLike>).Anchor ||
          (Getway as AnchorLike);
        // Fallback scan — not a contract. AnchorLike does not promise
        // enumerable instance properties.
        for (const token of Object.values(Portal)) {
          // Only keep class instances. Plain config objects and closures
          // are skipped to avoid false `instanceof` matches.
          if (
            token &&
            typeof token === "object" &&
            typeof (token as { constructor?: unknown }).constructor === "function" &&
            (token as { constructor: unknown }).constructor !== Object
          ) {
            instancePool.add(token as object);
          }
        }
      }

      // 2. Classify each inject as teleported (found externally) or native (create locally).
      const teleported = new Map<string, object>();
      const natives: InjectMap = {};

      for (const [propsKey, TokenClass] of Object.entries(injects)) {
        let found = false;
        const TargetDefinition = classable.getTarget(
          TokenClass as Classable<unknown, unknown[], string, unknown>,
        ) as unknown as (abstract new (...args: never[]) => object) | undefined;

        if (TargetDefinition) {
          for (const instance of instancePool) {
            if (instance instanceof TargetDefinition || instance.constructor === TargetDefinition) {
              teleported.set(propsKey, instance);
              found = true;
              break;
            }
          }
        }

        if (!found) {
          natives[propsKey] = TokenClass;
        }
      }

      // 3. Merge teleported and native instances into this container.

      // Apply teleported instances directly.
      for (const [key, instance] of teleported.entries()) {
        Object.defineProperty(this, key, { value: instance, enumerable: true, configurable: true });
        Cls.__instances.set(key, instance);
      }

      // Create native instances via Injectable for locally-declared deps.
      if (Object.keys(natives).length > 0) {
        const NativeCreator = Injectable(natives);
        const created = new NativeCreator() as unknown as Record<string, unknown>;

        for (const key of Object.keys(natives)) {
          const instance = created[key];
          Object.defineProperty(this, key, { value: instance, enumerable: true, configurable: true });
          Cls.__instances.set(key, instance);
        }
      }
    }
  } as unknown as StaticExtended<InjectableBuidlerLike, InjectedInstances<Injects>>;
}
