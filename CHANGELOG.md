# Changelog

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
