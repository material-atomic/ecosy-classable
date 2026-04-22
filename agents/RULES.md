# @ecosy/classable — Rules

These rules are absolute constraints when generating code with `@ecosy/classable`. Violations produce incorrect, unmaintainable, or runtime-broken output.

## Injection Rules

### DO: Use Injectable factory for dependency containers
```typescript
// ✅ Correct
class Service extends Injectable({
  db: Database,
  logger: Logger,
}) {}
```

### DON'T: Hand-roll constructor injection
```typescript
// ❌ Wrong — bypasses the framework entirely
class Service {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}
}
```

### DON'T: Use `new` inside Injectable classes to create injected dependencies
```typescript
// ❌ Wrong — Injectable resolves deps automatically
class Service extends Injectable({ db: Database }) {
  doWork() {
    const db = new Database(); // Wrong! Use this.db
  }
}
```

### DO: Use factory descriptors for parameterized construction
```typescript
// ✅ Correct — factory with args
class AppService extends Injectable({
  db: { target: Database, get: () => ["postgres://localhost/mydb"] },
  logger: Logger,
}) {}
```

### DON'T: Pass constructor args via Injectable map values
```typescript
// ❌ Wrong — Injectable expects class or { target, get }
class AppService extends Injectable({
  db: new Database("postgres://localhost/mydb"), // Wrong! Not a class
}) {}
```

## Teleportability Rules

### DO: Use Symbol keys for global registration
```typescript
// ✅ Correct — Symbol prevents key collision
const Container = Teleportability({
  key: Symbol.for("myapp:container"),
  injects: { db: Database },
});
```

### DON'T: Use string keys on globalThis
```typescript
// ❌ Wrong — string keys collide across packages
const Container = Teleportability({
  key: "container", // Collides with any other package using "container"
  injects: { db: Database },
});
```

### DO: Use inject() for late-binding before first access
```typescript
// ✅ Correct — push deps before construction
Container.inject({ cache: RedisCache });
const db = Container.get("db"); // triggers construction
```

### DON'T: Access get() before all dependencies are registered
```typescript
// ❌ Wrong — construction happens on first get(), missing deps
const db = Container.get("db");
Container.inject({ cache: RedisCache }); // Too late!
```

### DO: Use dispose() for cleanup in tests
```typescript
// ✅ Correct — clean state between tests
afterEach(() => {
  Container.dispose();
});
```

## Inject Rules

### DO: Use createInject with a getter function
```typescript
// ✅ Correct — lazy, no resolution at import time
const Inject = createInject(() => AppContainer);
```

### DON'T: Pass the container directly
```typescript
// ❌ Wrong — resolves immediately, breaks if container not ready
const Inject = createInject(AppContainer); // Type error + wrong semantics
```

### DO: Use Inject in constructor default parameters
```typescript
// ✅ Correct — resolved at construction time
class Service {
  constructor(
    private readonly db = Inject<Database>("db"),
  ) {}
}
```

### DON'T: Call Inject outside of constructors
```typescript
// ❌ Wrong — Inject is designed for constructor-time resolution
const db = Inject<Database>("db"); // Works but loses scope safety
```

## Lifecycle Rules

### DO: Separate concerns into Guards, Pipes, Interceptors, Filters
```typescript
// ✅ Correct — each phase has one job
class Handler extends Lifecycle({ db: Database }) {
  static descriptor = {
    guards: [AuthGuard],         // Can this request proceed?
    pipes: [ValidationPipe],     // Transform input
    interceptors: [LogInterceptor], // Wrap execution
    filters: [ErrorFilter],      // Transform output / catch errors
  };

  async execute(input: unknown) {
    return this.db.insert(input);
  }
}
```

### DON'T: Mix validation and execution in the handler
```typescript
// ❌ Wrong — validation belongs in a Guard or Pipe
class Handler extends Lifecycle({ db: Database }) {
  async execute(input: unknown) {
    if (!input.name) throw new Error("Name required"); // Use a Pipe!
    if (!isAdmin(ctx)) throw new Error("Forbidden");   // Use a Guard!
    return this.db.insert(input);
  }
}
```

### DO: Implement the correct interface for each phase
```typescript
// Guard: canActivate(ctx) → boolean
// Pipe: transform(value, ctx) → value
// Interceptor: intercept(ctx, next) → result
// Filter: transform(result, ctx) → result AND/OR catch(error, ctx) → error
```

## Scope Rules

### DO: Mark singletons with Global
```typescript
// ✅ Correct — one instance across all constructions
class DatabasePool extends Global({ target: Database }) {}
```

### DO: Mark per-request services with Transient
```typescript
// ✅ Correct — fresh instance every time
class RequestLogger extends Transient({ target: Logger }) {}
```

### DON'T: Assume scope without declaring it
```typescript
// ❌ Ambiguous — is this singleton or per-request?
// Always be explicit about lifecycle scope
class SomeService extends Injectable({ db: Database }) {}
```

## Placeholder Rules

### DO: Use Placeholder for optional dependencies
```typescript
// ✅ Correct — safe null-object, no crashes on missing dep
import { Placeholder } from "@ecosy/classable";

const NoopLogger = Placeholder(Logger);
// NoopLogger.log() → undefined (safe)
```

### DON'T: Use null/undefined for optional deps
```typescript
// ❌ Wrong — crashes at runtime when method is called
class Service extends Injectable({
  logger: null, // TypeError!
}) {}
```

## General Rules

1. **Never import from internal paths** — only import from `@ecosy/classable` (the package root).
2. **Never mutate `__instances`** — it is an internal detail of Injectable/Teleportable.
3. **Never subclass Injectable output directly for DI** — use composition (nested Injectable) instead.
4. **Always define interface contracts** (e.g., `DatabaseLike`, `LoggerLike`) for injectable dependencies to maintain loose coupling.
5. **Always use `as const` satisfaction** or explicit type annotations when passing complex inject maps to ensure correct type inference.
