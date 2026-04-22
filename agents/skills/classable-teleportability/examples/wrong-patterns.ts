/**
 * ❌ Wrong patterns for Teleportability.
 */
import { Teleportability } from "@ecosy/classable";

class Database {}
class Logger {}

// ──��� WRONG 1: String key on globalThis ─────────────────────────────
//
// String keys collide trivially across packages.

// ❌ WRONG
const BadContainer = Teleportability({
  key: "app",  // Any other package using "app" will collide!
  injects: { db: Database },
});

// ✅ FIX — use Symbol.for with a unique prefix
const GoodContainer = Teleportability({
  key: Symbol.for("@myorg/myapp:container"),
  injects: { db: Database },
});


// ─── WRONG 2: inject() after first access ──────────────────────────
//
// The container constructs on first get(). inject() after that is ignored.

// ❌ WRONG
const Container = Teleportability({
  key: Symbol.for("example:late"),
  injects: { db: Database },
});

// First access triggers construction
const db = Container.get("db");

// Too late! The inject map is already frozen after construction.
Container.inject({ db: Logger as any }); // ❌ Has no effect on existing instances

// ✅ FIX — inject() BEFORE the first get()
// Container.inject({ logger: Logger });
// const db2 = Container.get("db"); // Now logger is included


// ─── WRONG 3: Expecting multiple containers at same key ────────────
//
// First-write-wins. Second call with same key returns the FIRST container.

// ❌ WRONG — this does NOT create a separate container
const Container1 = Teleportability({
  key: Symbol.for("shared:key"),
  injects: { db: Database },
});

const Container2 = Teleportability({
  key: Symbol.for("shared:key"),       // Same key!
  injects: { logger: Logger },          // ❌ These injects are IGNORED
});

// Container2 is actually Container1 — logger is NOT registered.

// ✅ FIX — use different keys for different containers
// Or use inject() to add deps to the same container.


// ─── WRONG 4: Forgetting dispose() in tests ───────────────────────
//
// Without dispose(), state leaks between test cases.

// ❌ WRONG — test 1 pollutes test 2
// test("case 1", () => {
//   Container.inject({ db: MockDatabase });
//   // ... test runs ...
//   // No cleanup! MockDatabase leaks to next test.
// });

// ✅ FIX
// afterEach(() => {
//   Container.dispose(); // Clean slate for each test
// });


// Cleanup demo containers
GoodContainer.dispose();
Container.dispose();
Container1.dispose();
