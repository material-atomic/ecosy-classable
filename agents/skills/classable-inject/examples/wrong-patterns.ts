/**
 * ❌ Wrong patterns for createInject / Inject.
 */
import { Teleportability, createInject } from "@ecosy/classable";

class Database {}

const Container = Teleportability({
  key: Symbol.for("inject-demo:container"),
  injects: { db: Database },
});

// ─── WRONG 1: Passing container directly, not a getter ─────────────

// ❌ WRONG — createInject expects a function, not the container itself
// const Inject = createInject(Container);
// TypeScript error: Container is not a function

// ✅ FIX — wrap in a getter function
const Inject = createInject(() => Container);


// ─── WRONG 2: Missing generic type parameter ───────────────────────

// ❌ WRONG — returns `unknown`, no type safety
class BadService {
  constructor(
    private readonly db = Inject("db"), // Type is `unknown`
  ) {
    // this.db.query(...) // TypeScript error: Property 'query' does not exist on 'unknown'
  }
}

// ✅ FIX — always specify the generic
class GoodService {
  constructor(
    private readonly db = Inject<Database>("db"), // Type is Database
  ) {
    // this.db is properly typed
  }
}


// ─── WRONG 3: Calling Inject at module scope ───────────────────────

// ❌ WRONG — module-level Inject may run before container is ready
// const db = Inject<Database>("db"); // Risky! Depends on module load order

// ✅ FIX — always use inside constructor default params
// class MyService {
//   constructor(private readonly db = Inject<Database>("db")) {}
// }


// ─── WRONG 4: Using wrong key name ────────────────────────────────

// ❌ WRONG — key "database" doesn't match the registered key "db"
class MismatchService {
  constructor(
    private readonly db = Inject<Database>("database"), // ❌ Key is "db", not "database"
  ) {}
}
// Will throw: key "database" not found in container

// ✅ FIX — use the exact key from the injects map
// private readonly db = Inject<Database>("db")


// Cleanup
Container.dispose();
