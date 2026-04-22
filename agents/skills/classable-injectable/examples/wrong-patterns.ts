/**
 * ❌ Wrong patterns — common mistakes when using Injectable.
 *
 * Each block shows what NOT to do and why.
 */

// ─── WRONG 1: Passing instances instead of classes ─────────────────
//
// Injectable expects class constructors, not instances.
// The framework calls `new` on the target — passing an instance breaks this.

class Database {
  constructor(private url: string) {}
}

// ❌ WRONG — this is an instance, not a class
// Injectable({
//   db: new Database("postgres://localhost/mydb"),  // TypeError at runtime
// })

// ✅ FIX — use a factory descriptor
// Injectable({
//   db: { target: Database, get: () => ["postgres://localhost/mydb"] },
// })


// ─── WRONG 2: Using `new` inside the class for injected deps ──────
//
// The whole point of Injectable is automatic resolution.
// Creating instances manually defeats DI and makes testing impossible.

import { Injectable } from "@ecosy/classable";

class Logger {
  log(msg: string) { console.log(msg); }
}

// ❌ WRONG — manually creating what Injectable should resolve
class BadService extends Injectable({ logger: Logger }) {
  private manualDb = new Database("url"); // ❌ Not managed by Injectable!

  doWork() {
    this.logger.log("working");
    // this.manualDb is invisible to the DI container,
    // can't be mocked in tests, and won't be reconciled.
  }
}

// ✅ FIX — declare ALL dependencies in the inject map
class GoodService extends Injectable({
  logger: Logger,
  db: { target: Database, get: () => ["postgres://localhost/mydb"] },
}) {
  doWork() {
    this.logger.log("working");
    // this.db is properly managed and testable
  }
}


// ─── WRONG 3: Expecting async resolution ───────────────────────────
//
// Injectable resolves dependencies SYNCHRONOUSLY.
// If you need async initialization, use onInit().

// ❌ WRONG — get() should not be async
// Injectable({
//   db: {
//     target: Database,
//     get: async () => {                    // ❌ async not supported in get()
//       const url = await fetchConfig();
//       return [url];
//     },
//   },
// })

// ✅ FIX — use onInit for async setup
class AsyncService extends Injectable({
  db: { target: Database, get: () => ["default-url"] },
}) {
  async onInit() {
    // Do async initialization here after construction
  }
}


// ─── WRONG 4: Circular dependencies ───────────────────────────────
//
// Injectable detects cycles and throws a clear error.
// If A depends on B and B depends on A, it's a design problem.

// ❌ WRONG — circular dependency (will throw at runtime)
// class A extends Injectable({ b: B }) {}  // A needs B
// class B extends Injectable({ a: A }) {}  // B needs A → CYCLE!

// ✅ FIX — break the cycle with an interface + event system,
// or restructure so one side doesn't need the other directly.


// ─── WRONG 5: Mutating __instances ────────────────────────────────
//
// __instances is an internal detail. Never read or write it directly.

// ❌ WRONG
// (GoodService as any).__instances.set("db", myCustomDb);

// ✅ FIX — use Teleportability.inject() for late-binding,
// or restructure your inject map.
