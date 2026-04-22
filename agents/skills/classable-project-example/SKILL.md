---
name: classable-project-example
description: End-to-end guide for building a production application with @ecosy/classable. Covers container setup, dependency injection, lifecycle pipelines, plugin architecture, and the complete request flow. Based on the ecosy-markdoc CMS framework.
---

# Building an Application with @ecosy/classable

This skill walks through how to wire `@ecosy/classable` into a real application — from container bootstrap to request lifecycle. The reference implementation is **ecosy-markdoc**, a Markdown-driven CMS framework running on edge runtimes.

Repository: `github.com:material-atomic/ecosy-markdoc`
Live: https://markdoc.ecosy.io

## Architecture Overview

A classable application has four layers:

1. **Container** — A `Teleportability` singleton anchored on `globalThis` via a `Symbol` key. It holds the dependency graph.
2. **Executor** — An `Executable` backed by the container. It resolves dependencies, manages global/transient scope, and runs the lifecycle pipeline.
3. **Inject** — A `createInject` function that produces a lazy `Inject<T>(key)` resolver. Used in constructor defaults for order-independent DI.
4. **Services** — Classes built with `Injectable`, `Global`, `Transient`, `Lifecycle`, and `Placeholder` that form the application logic.

```
┌─────────────────────────────────────────────────┐
│  markdoc(options)                               │
│                                                 │
│  ┌─────────────┐   inject()   ┌──────────────┐ │
│  │ Teleportabi- │ ──────────▶ │  Runtimable  │ │
│  │ lity         │             │  (Injectable │ │
│  │ (container)  │             │   root)      │ │
│  └──────┬───── ┘             └──────────────┘ │
│         │                                      │
│  ┌──────▼──────┐   ┌──────────────────────┐   │
│  │ Executable   │   │ createInject         │   │
│  │ (executor)   │   │ → Inject<T>(key)     │   │
│  └──────┬──────┘   └──────────────────────┘   │
│         │                                      │
│  ┌──────▼──────────────────────────────────┐   │
│  │  Request Flow                            │   │
│  │  Guards → Pipes → Interceptors           │   │
│  │  → Handler → Filters                    │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Step 1 — Bootstrap the Container

Create a single file that exports three things: the container, the executor, and the inject function. This is the foundation of the entire application.

```typescript
// src/core/executor.ts
import { Teleportability, Executable, createInject } from "@ecosy/classable";

// 1. Container — Symbol key prevents cross-package collisions
export const AppTeleport = Teleportability({
  key: Symbol.for("@myapp/core:container"),
  injects: {},  // Empty at declaration — populated via inject() at startup
});

// 2. Executor — resolves deps from the container, manages scope
export const Executor = Executable(AppTeleport);

// 3. Inject — lazy resolver for constructor defaults
export const Inject = createInject(() => AppTeleport);
```

**Why `injects: {}`?** The container starts empty because the full dependency graph depends on user-provided configuration (plugins, routes, options). The `inject()` method populates it at startup before the first request.

## Step 2 — Define Global Services

Global services are created once and reused across all requests. Use `Global()` or `static __global = true` for expensive resources that should be singletons.

```typescript
// src/core/configuration.ts
import { Global } from "@ecosy/classable";
import type { AppOptions } from "./types";

// Factory function — freezes config at startup
export function Configuration(options: AppOptions) {
  return class ConfigurationImpl extends Global() {
    readonly options = Object.freeze(options);
  };
}
```

```typescript
// src/core/engine.ts
import { Inject } from "./executor";
import type { ConfigurationLike, FetchableLike } from "./types";

// Engine is implicitly global (no __global brand, but created once
// during container initialization and cached by the Executor)
export class Engine {
  constructor(
    private readonly config = Inject<ConfigurationLike>("configuration"),
    private readonly fetchable = Inject<FetchableLike>("fetchable"),
  ) {}

  async render(template: string, data: unknown): Promise<string> {
    // ...rendering logic
  }
}
```

**Key point:** `Inject<T>(key)` in constructor defaults works because `createInject` walks a scope stack during construction. The dependency does not need to be declared before the class that uses it — resolution is lazy and order-independent.

## Step 3 — Define Transient Services

Transient services are created fresh per request. They hold request-specific state that must not leak between users.

```typescript
// src/core/request-context.ts
import { Injectable, Storable } from "@ecosy/classable";

const INITIAL_STATE = { headers: {}, cookies: {}, queries: {} };

export class RequestContext extends Injectable({
  store: { target: Storable(), get: () => [INITIAL_STATE] },
}) {
  readonly url: URL;
  readonly pathname: string;

  constructor(readonly request: Request) {
    super();
    this.url = new URL(request.url);
    this.pathname = this.url.pathname;
  }

  static from(request: Request): RequestContext {
    return new RequestContext(request);
  }
}
```

**Pattern:** `Injectable({ key: descriptor })` supports both plain classes and factory descriptors `{ target, get }`. The `get()` function provides constructor arguments. Each `new RequestContext(request)` gets its own `Storable` store initialized with fresh state.

## Step 4 — Wire the Root Injectable

The root `Injectable` declares the full dependency graph. It is late-bound to the container via `inject()` at startup.

```typescript
// src/core/context.ts
import { Injectable } from "@ecosy/classable";
import { Configuration } from "./configuration";
import { Engine } from "./engine";
import { Fetchable } from "./fetchable";
import { Manifest } from "./manifest";
import { Pluginable } from "./plugin";
import { Server } from "./server";
import type { AppOptions } from "./types";

export function Runtimable(options: AppOptions) {
  const { imports, ...configOptions } = options;

  return class Runtime extends Injectable({
    // Core services
    engine: Engine,
    configuration: Configuration(configOptions),
    fetchable: Fetchable,
    manifest: Manifest,

    // Plugin manager
    pluginable: Pluginable,

    // User-provided overrides (e.g., custom Database, Logger)
    ...(imports ?? {}),

    // HTTP server — must be last (depends on everything above)
    server: Server,
  }) {};
}
```

```typescript
// src/app.ts — Entry point
import { AppTeleport } from "./core/executor";
import { Runtimable } from "./core/context";
import type { AppOptions } from "./types";

export default function app(options: AppOptions) {
  // Late-bind the entire dependency graph
  AppTeleport.inject({
    runtime: Runtimable(options),
  });

  // Return the server instance (lazy — constructed on first request)
  return AppTeleport.get<{ server: { fetch: Function } }>("runtime").server;
}
```

**Why `inject()` instead of declaring in `injects`?** Because `Runtimable(options)` is a class factory that depends on runtime configuration. The container definition (`Teleportability(...)`) is static — `inject()` bridges the gap between static container and dynamic config.

## Step 5 — Build the Lifecycle Pipeline

The lifecycle pipeline processes requests through Guards → Pipes → Interceptors → Handler → Filters. This is the classable equivalent of middleware stacks, but with strict separation of concerns.

```typescript
// src/core/request-lifecycle.ts
import { Lifecycle } from "@ecosy/classable";
import type {
  GuardLike,
  FilterLike,
  InterceptorLike,
  PipeLike,
  InjectClassable,
} from "@ecosy/classable";

interface LifecycleOptions {
  guards?: InjectClassable<GuardLike>[];
  pipes?: InjectClassable<PipeLike>[];
  interceptors?: InjectClassable<InterceptorLike>[];
  filters?: InjectClassable<FilterLike>[];
}

export class RequestLifecycle {
  readonly Handler: ReturnType<typeof buildHandler>;

  constructor(options: LifecycleOptions = {}) {
    this.Handler = buildHandler(options);
  }
}

function buildHandler(options: LifecycleOptions) {
  return class RequestPipeline extends Lifecycle({
    guards: (options.guards ?? []) as InjectClassable<GuardLike>[],
    pipes: (options.pipes ?? []) as InjectClassable<PipeLike>[],
    interceptors: (options.interceptors ?? []) as InjectClassable<InterceptorLike>[],
    filters: (options.filters ?? []) as InjectClassable<FilterLike>[],
  }) {
    async execute(req: Request, res: Response, handler: Function) {
      return handler(req, res);
    }
  };
}
```

```typescript
// src/core/server.ts — Executing through the pipeline
import { Executor } from "./executor";

// Inside the request handler:
const result = await Executor.lifecycle(
  this.lifecycle.Handler as any,
  [req, res, handler],
);
```

**Pipeline order:**
1. **Guards** — `canActivate(ctx): boolean` — Reject unauthorized requests early
2. **Pipes** — `transform(value, ctx): value` — Validate and sanitize input
3. **Interceptors** — `intercept(ctx, next): result` — Wrap execution (timing, logging, caching)
4. **Handler** — `execute(...args)` — Core business logic
5. **Filters** — `transform(result, ctx)` / `catch(error, ctx)` — Shape output, handle errors

## Step 6 — Implement the Plugin System

Plugins extend the application without modifying core code. Each plugin declares routes, components, or hooks, and the plugin manager resolves them per-request with proper scope.

```typescript
// src/core/plugin.ts
import { Inject } from "./executor";
import type { ConfigurationLike } from "./types";
import type { GlobalStatic } from "@ecosy/classable";
import { classable } from "@ecosy/classable";

export abstract class Plugin {
  constructor(
    protected readonly ctx: RequestContext,
    protected readonly store: StoreLike,
  ) {}

  abstract getRegistry(): PluginRegistry;
}

class PluginManager {
  private readonly globals = new Map();

  constructor(
    private readonly config = Inject<ConfigurationLike>("configuration"),
  ) {}

  resolve(ctx: RequestContext, store: StoreLike): Plugin[] {
    const plugins = this.config.options.plugins ?? [];

    return plugins.map(pluginClass => {
      const target = classable.getTarget(pluginClass);

      // Respect the __global brand — cache global plugins
      if ((target as Partial<GlobalStatic>).__global === true) {
        let cached = this.globals.get(pluginClass);
        if (!cached) {
          cached = classable.create(pluginClass, ctx, store);
          this.globals.set(pluginClass, cached);
        }
        return cached;
      }

      // Transient plugins — fresh per request
      return classable.create(pluginClass, ctx, store);
    });
  }
}
```

```typescript
// src/plugins/sitemap.ts — Example plugin
export class Sitemap extends Plugin {
  getRegistry() {
    return {
      urls: {
        "/sitemap.xml": { summary: "XML Sitemap", method: "GET" },
        "/sitemap.json": { summary: "JSON Sitemap", method: "GET" },
      },
    };
  }

  fetch(req: Request, res: Response): Response {
    const pages = this.store.getState().pages ?? [];
    // ...generate sitemap from pages
  }
}
```

```typescript
// src/plugins/robots-txt.ts — Plugin factory with frozen config
export function RobotsTxt(options = {}) {
  const frozen = Object.freeze(options);

  return class RobotsTxtPlugin extends Plugin {
    static __global = true;  // Cached across requests
    static readonly config = frozen;

    getRegistry() {
      return {
        urls: { "/robots.txt": { summary: "Robots.txt", method: "GET" } },
      };
    }
  };
}
```

**Registration:**
```typescript
export default app({
  plugins: [Sitemap, RobotsTxt({ sitemapUrl: "/sitemap.xml" })],
  lifecycle: {
    guards: [AuthGuard],
    interceptors: [TimingInterceptor],
  },
});
```

## Step 7 — Test Teardown

Classable's global state persists across test cases. Always clean up.

```typescript
import { Executor, AppTeleport } from "./core/executor";

afterEach(() => {
  Executor.clearGlobals();  // Reset executor's global cache
  AppTeleport.dispose();    // Reset container — re-constructs on next access
});
```

## Complete Request Flow

```
fetch(request)
  │
  ├─ 1. Executor ensures container initialized
  │     └─ First call: new Runtime() → resolves all Injectable deps
  │        └─ pushScope/popScope stack enables order-independent Inject<T>()
  │
  ├─ 2. RequestContext.from(request) — fresh per request
  │
  ├─ 3. Router.match(pathname) → finds route handler
  │
  ├─ 4. Executor.lifecycle(Handler, [req, res, routeHandler])
  │     ├─ Guards:       canActivate(ctx) → reject or proceed
  │     ├─ Pipes:        transform(input, ctx) → sanitize
  │     ├─ Interceptors: intercept(ctx, next) → wrap (onion model)
  │     ├─ Handler:      execute(req, res, fn) → business logic
  │     └─ Filters:      transform(result) or catch(error)
  │
  ├─ 5. Plugins resolve per-request (global cached, transient fresh)
  │     └─ Plugin.getRegistry() merges components, routes, metadata
  │
  └─ 6. Response returned
        └─ Transient deps garbage collected, globals persist
```

## Rules for Classable Applications

1. **One container per application.** Use `Teleportability` with a unique `Symbol.for()` key. Never use string keys.
2. **`inject()` before first access.** Late-binding via `inject()` must happen before any `get()` or `instance` access. After construction, `inject()` has no effect.
3. **Global for expensive, stateless resources.** Database pools, configuration, engines. Never store per-request state in a global.
4. **Transient for request-scoped state.** Request context, validators, per-call stores. Always create fresh.
5. **`Inject<T>(key)` in constructor defaults only.** The scope stack is only active during construction. Calling `Inject()` outside a constructor resolves from the committed container.
6. **`Lifecycle` for pipelines, not for services.** Use `Injectable` for services, `Lifecycle` for request handlers that need guards/pipes/interceptors/filters.
7. **`Executor.clearGlobals()` + `container.dispose()` in tests.** Without cleanup, state leaks between test cases.
8. **Plugins declare `__global` explicitly.** Stateless plugins (SEO, analytics) should be global. Stateful plugins (form handlers) should be transient.
