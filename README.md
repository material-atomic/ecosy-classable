# @ecosy/classable

A type-safe, zero-dependency class composition engine with dependency injection, lifecycle hooks, and automatic garbage collection — built on a single algebraic axiom.

> *Classable sinh — mọi class đều quy về*
> *Factory chuyển — lazy hay sync tùy duyên*
> *Container giữ — Executor buông*
> *Một type duy nhất — vạn vật nên.*

## Features

- **Single axiom** — `Classable<T> = ClassStatic | ClassFactory`, everything derives from it
- **Dependency injection** — Auto-resolve via `Injectable()`, no decorators or reflection
- **Lifecycle hooks** — Guards, Filters, Pipes, Interceptors via `Lifecycle()`
- **Singleton registry** — HMR-safe global container backed by `globalThis` Symbol
- **Scoped GC** — `Executor.run()` auto-disposes transient instances after execution
- **Zero dependencies** — Standalone package, no peer or runtime deps

## Installation

```bash
yarn add @ecosy/classable
```

## Quick Start

```typescript
import { classable, Injectable, Global, Executor } from "@ecosy/classable";

// 1. Plain class
class Logger {
  log(msg: string) { console.log(msg); }
}

// 2. Injectable with auto-resolved dependencies
class UserService extends Injectable({
  logger: Logger,
}) {
  getUser(id: string) {
    this.logger.log(`Fetching user ${id}`);
    return { id, name: "Alice" };
  }
}

// 3. Global singleton (survives HMR)
class DatabasePool extends Global() {
  query(sql: string) { /* ... */ }
}

// 4. Scoped execution with automatic cleanup
const user = await Executor.run(
  (db, service) => service.getUser("1"),
  [DatabasePool, UserService],
);
// DatabasePool persists (global), UserService is disposed (transient)
```

## Core API

### `classable`

The singleton API instance — the single projection from `Classable<T>` to `T`.

| Method | Description |
|--------|-------------|
| `create(cls)` | Instantiate any classable (sync, async, or via getter) |
| `is(fn)` | Type guard: concrete class |
| `isFactory(obj)` | Type guard: factory descriptor |
| `toFactory(cls)` | Normalize class → factory |
| `getTarget(cls)` | Extract underlying target class |
| `withFactory(base, resolver)` | Replace resolver, keep target |
| `wrap(cls, wrapper)` | Apply wrapper to target class |
| `getDescriptor(cls)` | Debug descriptor (`type` + `target`) |
| `from(def)` | Instantiate via `InstanceByStatic` pattern |
| `select(finder)` | Bind a `ClassableSelector` |

### `Injectable(injects)`

Creates a class with auto-resolved dependencies.

```typescript
class MyService extends Injectable({
  db: DatabasePool,
  cache: {
    target: RedisCache,
    get: (accessor) => [accessor.get("db")] as const,
  },
}) {
  // this.db and this.cache are auto-resolved
}
```

### `Lifecycle(options)`

Creates a class with lifecycle hooks and optional DI.

```typescript
class UserController extends Lifecycle({
  guards: [AuthGuard],
  pipes: [ValidationPipe],
  interceptors: [LoggingInterceptor],
  injects: { db: DatabasePool },
}) {
  // this.db is auto-resolved
}

UserController.descriptor.guards; // [AuthGuard]
```

### `Global(options?)`

Marks a class as a global singleton.

```typescript
class ConfigService extends Global({
  injects: { env: EnvProvider },
}) {
  // Singleton — persists across HMR
}
```

### `ClassableContainer`

Singleton registry backed by `globalThis`.

```typescript
import { container } from "@ecosy/classable";

const db = container.get(DatabasePool);  // creates or returns cached
container.has(DatabasePool);             // true
container.delete(DatabasePool);          // remove
container.clear();                       // teardown
```

### `Executor`

Request-scoped dependency resolver with automatic GC.

```typescript
const result = await Executor.run(
  (db, logger) => db.query("SELECT 1"),
  [Global(DatabasePool), RequestLogger],
);
// RequestLogger is disposed after run completes
```

## Architecture

```
Classable<T>        ← The axiom (type union)
  │
  ├─ classable.create()  ← The single projection (Classable<T> → T)
  │
  ├─ Injectable()   ← DI container (auto-resolve)
  │   └─ Lifecycle() ← AOP layer (guards, pipes, filters, interceptors)
  │       └─ Global() ← Singleton branding
  │
  ├─ Container      ← Global registry (HMR-safe)
  └─ Executor       ← Scoped GC (request lifecycle)
```

## Documentation

Full API reference and guides: **[docs.ecosy.io](https://docs.ecosy.io)**

## License

MIT
