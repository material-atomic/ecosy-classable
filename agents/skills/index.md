# @ecosy/classable — Architecture Guide

## Overview

`@ecosy/classable` is a zero-dependency TypeScript toolkit for dependency injection, class composition, and lifecycle management. It replaces manual DI containers with composable factory functions that produce type-safe classes.

## Core Concepts

### 1. Injectable — Dependency Container

`Injectable(injects)` is the foundation. It takes a map of dependencies and returns a class that automatically resolves all of them at construction time.

```typescript
import { Injectable } from "@ecosy/classable";

class Database { /* ... */ }
class Logger { /* ... */ }

class AppService extends Injectable({
  db: Database,
  logger: Logger,
}) {
  start() {
    this.db;     // Database instance — auto-resolved
    this.logger; // Logger instance — auto-resolved
  }
}
```

Dependencies can be plain classes (zero-arg constructors) or factory descriptors with a `get()` function for parameterized construction.

### 2. Teleportability — Global Singleton Registry

`Teleportability({ key, injects })` registers an Injectable at a global key (Symbol recommended). All modules accessing the same key share the same instances.

```typescript
import { Teleportability, createInject } from "@ecosy/classable";

const AppContainer = Teleportability({
  key: Symbol.for("app:container"),
  injects: { db: Database, logger: Logger },
});

// Late-bind additional dependencies
AppContainer.inject({ cache: RedisCache });

// Access resolved instances
const db = AppContainer.get<Database>("db");
```

### 3. Inject — Lazy Constructor Resolution

`createInject(() => container)` produces an `Inject<T>(key)` function for use in constructor default parameters. Dependencies are resolved at construction time, not import time.

```typescript
const Inject = createInject(() => AppContainer);

class UserService {
  constructor(
    private readonly db = Inject<Database>("db"),
    private readonly logger = Inject<Logger>("logger"),
  ) {}
}
```

### 4. Executable — Teleport-Backed Executor

`Executable(TeleportClass)` replaces the static `Executor` by using a Teleportability container as the global dependency pool.

```typescript
import { Executable } from "@ecosy/classable";

const Executor = Executable(AppContainer);
await Executor.run(
  (db, logger) => { /* use db, logger */ },
  [Database, Logger],
);
```

### 5. Lifecycle — Request Pipeline

`Lifecycle(injects)` extends Injectable with a Guards → Pipes → Interceptors → Handler → Filters pipeline. Ideal for request/command processing.

```typescript
import { Lifecycle } from "@ecosy/classable";

class CreateUserHandler extends Lifecycle({
  db: Database,
  validator: UserValidator,
}) {
  static descriptor = {
    guards: [AuthGuard],
    pipes: [ValidationPipe],
    interceptors: [LoggingInterceptor],
    filters: [ErrorFilter],
  };

  async execute(input: CreateUserInput) {
    return this.db.insert(input);
  }
}
```

### 6. Global / Transient — Scope Markers

`Global(options)` marks a class as singleton (cached across constructions). `Transient(options)` marks it as per-request (fresh instance every time).

### 7. Placeholder — Null Object Pattern

`Placeholder(target)` creates a safe null-object class. All methods return `undefined`, all properties are safe to access. Useful for optional dependencies.

## Skill Reading Order

When building an application with @ecosy/classable, read skills in this order:

1. `classable-injectable` — Learn dependency declaration and resolution
2. `classable-teleportability` — Learn global container registration
3. `classable-inject` — Learn lazy constructor injection
4. `classable-executable` — Learn the executor pattern
5. `classable-lifecycle` — Learn the request pipeline
6. `classable-global-transient` — Learn scope control
7. `classable-placeholder` — Learn null-object patterns

## Real-World Pattern

A typical application wires everything together like this:

```typescript
// container.ts
import { Teleportability, Executable, createInject } from "@ecosy/classable";

export const AppContainer = Teleportability({
  key: Symbol.for("myapp:container"),
  injects: {
    config: Configuration,
    db: Database,
    logger: Logger,
    cache: RedisCache,
  },
});

export const Executor = Executable(AppContainer);
export const Inject = createInject(() => AppContainer);
```

```typescript
// services/user.service.ts
import { Inject } from "../container";

export class UserService {
  constructor(
    private readonly db = Inject<Database>("db"),
    private readonly cache = Inject<RedisCache>("cache"),
  ) {}

  async findById(id: string) {
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return cached;
    return this.db.query("SELECT * FROM users WHERE id = ?", [id]);
  }
}
```
