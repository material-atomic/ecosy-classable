/**
 * ❌ Wrong patterns for Lifecycle.
 */
import { Lifecycle } from "@ecosy/classable";

class Database {
  async insert(data: unknown) { return data; }
}

// ─── WRONG 1: Mixing validation into the handler ───────────────────

// ❌ WRONG — validation belongs in a Pipe, auth in a Guard
class BadHandler extends Lifecycle({
  injects: { db: Database },
  guards: [], pipes: [], interceptors: [], filters: [],
}) {
  async execute(input: { name?: string; role?: string }) {
    // ❌ These should be Guards and Pipes, not inline checks
    if (!input.role || input.role !== "admin") {
      throw new Error("Forbidden"); // Should be a Guard!
    }
    if (!input.name || input.name.length < 2) {
      throw new Error("Invalid name"); // Should be a Pipe!
    }
    return this.db.insert(input);
  }
}

// ✅ FIX — separate concerns into pipeline stages
// Lifecycle({
//   injects: { db: Database },
//   guards: [AuthGuard],       // Handles auth
//   pipes: [ValidationPipe],   // Handles validation
// })
// async execute(input) { return this.db.insert(input); } // Pure business logic


// ─── WRONG 2: Wrong method name ────────────────────────────────────

// ❌ WRONG — Lifecycle looks for `run()` or `execute()`, not `handle()`
class WrongMethodHandler extends Lifecycle({
  injects: { db: Database },
  guards: [], pipes: [], interceptors: [], filters: [],
}) {
  async handle(input: unknown) {  // ❌ Not recognized!
    return this.db.insert(input);
  }
}
// Executor.lifecycle(WrongMethodHandler, args) → throws "missing run() or execute()"

// ✅ FIX — use `execute()` or `run()`
// async execute(input: unknown) { return this.db.insert(input); }


// ─── WRONG 3: Guard not returning boolean ──────────────────────────

// ❌ WRONG — canActivate must return boolean
class BadGuard {
  canActivate(ctx: unknown) {
    return "allowed"; // ❌ Returns string, not boolean!
  }
}

// ✅ FIX
class GoodGuard {
  canActivate(ctx: unknown): boolean {
    return true; // Must be true/false
  }
}


// ─── WRONG 4: Interceptor not calling next() ───────────────────────

// ❌ WRONG — interceptor MUST call next() to proceed to the handler
class BadInterceptor {
  async intercept(ctx: unknown, next: () => Promise<unknown>) {
    console.log("Intercepted!");
    // ❌ Forgot to call next()! Handler never executes.
    return { error: "short-circuited" };
  }
}

// ✅ FIX — always call next() unless intentionally short-circuiting
class GoodInterceptor {
  async intercept(ctx: unknown, next: () => Promise<unknown>) {
    console.log("Before");
    const result = await next(); // ✅ Calls the handler
    console.log("After");
    return result;
  }
}
