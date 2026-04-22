# Changelog

## 0.2.0 (2026-04-22)

### Breaking Changes

- **Container**: Removed `ClassableContainer` and `container` exports — replaced by `Teleportability` which provides a more robust cross-module singleton system with Symbol-keyed anchoring on `globalThis`

### New Features

- **Teleportability**: Runtime-managed singleton portal — `Teleportability({ key, injects })` creates a lazy-initialized container with `inject()` for late-binding, `get()` / `instance` for access, and `dispose()` for teardown
- **Teleportable**: Snapshot-based cross-container reconciliation — merges teleported (external) and native (local) instances at construction time with identity-based deduplication
- **Anchorable**: Anchor-aware class trait for registering singleton instances across module boundaries via Symbol keys on `globalThis`
- **Anchoribility**: Portal-like trait enabling Anchor-based instance broadcasting between isolated scopes (HMR, SSR, edge workers)
- **Executable**: Teleport-backed successor to static `Executor` — `Executable(TeleportClass)` returns an executor that resolves global deps from the container and creates transient deps per call, with `run()`, `lifecycle()`, `evict()`, and `clearGlobals()` methods
- **createInject**: Lazy dependency resolver factory — `createInject(() => container)` returns an `Inject<T>(key)` function for use in constructor parameter defaults, enabling order-independent resolution during construction
- **pushScope / popScope**: Scope stack management for nested Injectable construction — enables `Inject<T>(key)` to resolve from the correct scope when Injectables are nested inside each other
- **Transient**: Brand marker factory — `extends Transient()` or `extends Transient({ injects })` marks a class as `__transient: true` for per-request lifecycle, mutually exclusive with `Global`
- **Injectable**: Added `onDispose()` lifecycle hook and `InjectableOnDispose` type for cleanup when containers are torn down
- **Agent Skills**: Full `agents/` directory with structured AI documentation:
  - `PROMPT.md` — Role definition and architectural principles
  - `RULES.md` — DO/DON'T constraints with code examples
  - 8 skills covering Injectable, Teleportability, Inject, Executable, Lifecycle, Global/Transient, Placeholder, and a project-level walkthrough based on ecosy-markdoc
  - Each skill includes correct and wrong pattern examples as TypeScript reference files

### Changes

- **Executor**: Retained as legacy compatibility export — functionally superseded by `Executable` for new code
- **Global**: Now works in concert with Executable's global cache — `__global: true` classes declared in the Teleport's inject map are cached and reused across `run()` / `lifecycle()` calls
- **Lifecycle**: `LifecycleOptions` now takes `{ injects?: InjectMap, ...descriptor }` — dependencies go inside `injects`, hooks (guards, pipes, interceptors, filters) at the top level
- **Placeholder**: Clarified API surface — `Placeholder` is a class (null object), `placeholder` is a `ClassFactory` descriptor, `placeholderInstance` is an `InstanceByStatic` descriptor

### Refactored

- **teleportable.ts**: Replaced all Vietnamese/philosophical terminology (Yin/Yang, Dao, Tụ Khí, etc.) with technical English — `soulPool` → `instancePool`, `yangTeleported` → `teleported`, `yinNatives` → `natives`
- **executor.ts**: Translated all Vietnamese comment blocks to English technical descriptions
- **executable.ts**: Cleaned up internal documentation, added migration guide from static `Executor`

### New Exports

```
Anchorable, AnchorLike, AnchorableLike
Anchoribility, AnchoribilityOptions, AnchoribilityLike
Executable, ExecutableStatic, ExecutorDep, ResolvedInstance, ResolvedInstances
Teleportable, TeleportableOptions
Teleportability, TeleportabilityOptions, TeleportabilityLike
Transient, TransientClassable, TransientOptions, TransientStatic
createInject, pushScope, popScope
InjectableOnDispose
```

### Removed Exports

```
ClassableContainer, container
```

## 0.1.0 (2026-03-25)

### Features

- **Classable**: Core type system — `Classable<T> = ClassStatic | ClassFactory` as the single axiom for class composition
- **Classable**: `classable.create()` — universal projection function supporting sync, async, and static getter instantiation
- **Classable**: Type guards (`is`, `isAbstract`, `isFactory`), factory utilities (`toFactory`, `withFactory`, `wrap`), and introspection (`getTarget`, `getDescriptor`)
- **Injectable**: Auto-resolved dependency injection via `extends Injectable(injects)` — no decorators, no reflection
- **Injectable**: `InjectedAccessor` for cross-referencing sibling injections in factory resolvers
- **Injectable**: `onInit()` lifecycle hook with `waitForInjects()` for async post-construction initialization
- **Lifecycle**: AOP layer with `GuardLike`, `FilterLike`, `PipeLike`, and `InterceptorLike` interfaces
- **Lifecycle**: Static `descriptor` with deduplicated, frozen hook arrays
- **Global**: Singleton branding via `extends Global()` — marks classes for container-managed lifecycle
- **Container**: `ClassableContainer` singleton registry backed by `globalThis` Symbol for HMR survival
- **Container**: Safe async fallback — removes failed entries from registry for automatic retry
- **Executor**: Request-scoped dependency resolver with automatic garbage collection of transient instances
- **Placeholder**: Null Object pattern (`Placeholder`, `placeholder`, `placeholderInstance`) for type-safe defaults
- Zero dependencies — fully standalone package, no peer or runtime deps
