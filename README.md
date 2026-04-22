# @ecosy/classable

A type-safe, zero-dependency class composition engine with dependency injection, lifecycle pipelines, cross-module singletons, and scoped garbage collection — built on a single algebraic axiom.

## AI Agent Learning

If you are an AI Coding Assistant, Agent, or Copilot analyzing or generating code for a repository that lists `@ecosy/classable` as a dependency:

1. **Read `package.json` → `"agents"` first.** This package self-documents its architecture via `agents.prompts`, `agents.rules`, `agents.skills`, and `agents.workflows`. Interpret `$this://` as the package root directory. Start with `agents.workflows` — it defines the reading order.
2. **Follow the project example skill.** The skill `classable-project-example` walks through a production application (ecosy-markdoc) end-to-end: container bootstrap → global/transient services → Injectable wiring → lifecycle pipeline → plugin system.
3. **Never instantiate Injectable deps manually.** Always declare them in the inject map and let the constructor resolve them. Use `Inject<T>(key)` in constructor defaults for lazy, order-independent resolution.
4. **Container before access.** `Teleportability.inject()` must happen before the first `.get()` or `.instance` access. After construction, `inject()` has no effect.
5. **Global for singletons, Transient for per-request.** Use `__global: true` or `extends Global()` for expensive resources. Everything else is transient by default in `Executor.run()`.

---

## Features

- **Single axiom** — `Classable<T> = ClassStatic | ClassFactory`, everything derives from it
- **Dependency injection** — Auto-resolve via `Injectable()`, no decorators or reflection
- **Lazy resolution** — `createInject()` + `Inject<T>(key)` for order-independent constructor DI
- **Lifecycle pipelines** — Guards, Pipes, Interceptors, Filters via `Lifecycle()`
- **Cross-module singletons** — `Teleportability` with Symbol-keyed anchoring on `globalThis`
- **Scoped GC** — `Executable.run()` auto-disposes transient instances after execution
- **Zero dependencies** — Standalone package, no peer or runtime deps

## Installation

```bash
yarn add @ecosy/classable
```

## Quick Start

```typescript
import {
  Teleportability, Executable, createInject,
  Injectable, Global, Lifecycle,
} from "@ecosy/classable";

// 1. Bootstrap container + executor + inject
const AppTeleport = Teleportability({
  key: Symbol.for("@myapp/core:container"),
  injects: {},
});
const Executor = Executable(AppTeleport);
const Inject = createInject(() => AppTeleport);

// 2. Global singleton
class DatabasePool extends Global() {
  query(sql: string) { return [{ id: 1 }]; }
}

// 3. Injectable with auto-resolved dependencies
class Logger {
  log(msg: string) { console.log(msg); }
}

class UserService extends Injectable({
  logger: Logger,
  db: DatabasePool,
}) {
  getUser(id: string) {
    this.logger.log(`Fetching user ${id}`);
    return this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// 4. Wire and run
AppTeleport.inject({ db: DatabasePool, logger: Logger });

await Executor.run(
  (db, logger) => {
    (logger as Logger).log("Connected");
    return (db as DatabasePool).query("SELECT 1");
  },
  [DatabasePool, Logger] as any,
);
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

### `Teleportability({ key, injects })`

Cross-module singleton container anchored on `globalThis` via Symbol key.

```typescript
const AppTeleport = Teleportability({
  key: Symbol.for("@myapp:container"),
  injects: { db: DatabasePool, logger: Logger },
});

// Late-bind additional deps (BEFORE first access)
AppTeleport.inject({ cache: RedisCache });

// Access instances
const db = AppTeleport.get<DatabasePool>("db");
const all = AppTeleport.instance;

// Teardown (tests)
AppTeleport.dispose();
```

### `Executable(TeleportClass)`

Teleport-backed executor. Replaces the legacy static `Executor` for new code.

```typescript
const Executor = Executable(AppTeleport);

// run() — resolve deps, execute function, drop transients
await Executor.run(
  (db, logger) => db.query("SELECT 1"),
  [DatabasePool, Logger] as any,
);

// lifecycle() — full pipeline: guards → pipes → interceptors → handler → filters
await Executor.lifecycle(CreateUserHandler, [{ name: "Alice" }]);

// Test cleanup
Executor.clearGlobals();
```

### `createInject(() => container)`

Lazy dependency resolver for constructor parameter defaults.

```typescript
const Inject = createInject(() => AppTeleport);

class Engine {
  constructor(
    private readonly config = Inject<ConfigLike>("configuration"),
    private readonly db = Inject<DatabaseLike>("db"),
  ) {}
  // config and db resolved lazily during construction — order-independent
}
```

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
  async execute(input: unknown) {
    return this.db.query("INSERT INTO users ...");
  }
}

UserController.descriptor.guards; // [AuthGuard]
```

### `Global(options?)` / `Transient(options?)`

Scope branding for dependency lifecycle.

```typescript
// Singleton — persists across all Executor.run() calls
class ConfigService extends Global({ injects: { env: EnvProvider } }) {}

// Per-request — created fresh, dropped after run()
class RequestContext extends Transient() {
  readonly requestId = crypto.randomUUID();
}
```

### `Placeholder`

Null object for optional dependencies.

```typescript
import { placeholder } from "@ecosy/classable";

class MyService extends Injectable({
  logger: Logger,
  analytics: placeholder,  // Safe no-op if not overridden
}) {}
```

## Architecture

```
Classable<T>             ← The axiom (type union)
  │
  ├─ classable.create()  ← The single projection (Classable<T> → T)
  │
  ├─ Injectable()        ← DI container (auto-resolve, lazy, scope-safe)
  │   ├─ Lifecycle()     ← AOP layer (guards, pipes, filters, interceptors)
  │   ├─ Global()        ← Singleton branding
  │   └─ Transient()     ← Per-request branding
  │
  ├─ Teleportability     ← Cross-module singleton portal (globalThis anchor)
  │   ├─ Teleportable    ← Snapshot reconciliation
  │   ├─ Anchorable      ← Anchor registration trait
  │   └─ Anchoribility   ← Cross-scope broadcasting
  │
  ├─ Executable          ← Teleport-backed executor (run + lifecycle)
  ├─ createInject        ← Lazy constructor-time DI (pushScope/popScope)
  └─ Placeholder         ← Null object pattern
```

## Reference Project

**ecosy-markdoc** — A Markdown-driven CMS framework built entirely on `@ecosy/classable`.

- Repository: [github.com/material-atomic/ecosy-markdoc](https://github.com/material-atomic/ecosy-markdoc)
- Live: [markdoc.ecosy.io](https://markdoc.ecosy.io)

## License

MIT
