/**
 * ✅ Correct: Using Global and Transient to control dependency scope.
 */
import { Global, Transient, Teleportability, Executable, Injectable } from "@ecosy/classable";

// --- Global: singleton, reused across all calls ---

// Option 1: Use the `__global` static brand directly
class DatabasePool {
  static __global = true as const;

  private connections: string[] = [];

  getConnection() {
    return this.connections[0] ?? "new-connection";
  }
}

// Option 2: Use the Global() factory (equivalent to __global = true)
class Logger extends Global() {
  log(msg: string) { console.log(`[LOG] ${msg}`); }
}

// --- Transient: fresh instance per call ---

// Option 1: Explicit __global = false
class RequestContext {
  static __global = false as const;

  readonly requestId = crypto.randomUUID();
  readonly startTime = Date.now();
}

// Option 2: Use the Transient() factory
class Validator extends Transient() {
  errors: string[] = [];

  validate(input: unknown): boolean {
    this.errors = []; // Reset per call
    if (!input) this.errors.push("Input required");
    return this.errors.length === 0;
  }
}

// --- Wiring with Executable ---

const Container = Teleportability({
  key: Symbol.for("scope-demo:container"),
  injects: {
    db: DatabasePool,    // Global — one instance, reused
    logger: Logger,      // Global
  },
});

const Executor = Executable(Container);

// First call: DatabasePool and Logger are created and cached
await Executor.run(
  (db, logger, ctx, validator) => {
    (logger as Logger).log(`Request ${(ctx as RequestContext).requestId}: validating...`);
    (validator as Validator).validate({ name: "Alice" });
    return (db as DatabasePool).getConnection();
  },
  [DatabasePool, Logger, RequestContext, Validator] as any,
);

// Second call: same db and logger instances, new ctx and validator
await Executor.run(
  (db, logger, ctx) => {
    (logger as Logger).log(`Request ${(ctx as RequestContext).requestId}: another request`);
    // db is the SAME instance as before (global)
    // ctx is a NEW instance (transient) with a new requestId
  },
  [DatabasePool, Logger, RequestContext] as any,
);

// Cleanup
Executor.clearGlobals();
Container.dispose();
