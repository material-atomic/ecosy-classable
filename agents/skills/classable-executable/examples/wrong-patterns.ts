/**
 * ❌ Wrong patterns for Executable.
 */
import { Teleportability, Executable } from "@ecosy/classable";

class Database {
  static __global = true;
  async query(sql: string) { return []; }
}

class Logger {}

// ─── WRONG 1: Global dep not declared in container ─────────────────

const Container = Teleportability({
  key: Symbol.for("exec-wrong:container"),
  injects: {}, // ❌ Empty! Database is not registered.
});

const Executor = Executable(Container);

// ❌ WRONG — Database has __global = true but is not in the container.
// Executable will warn and create ad-hoc, but this is a config error.
// await Executor.run((db) => db.query("SELECT 1"), [Database]);

// ✅ FIX — declare all global deps in the container:
// Teleportability({ key: ..., injects: { db: Database } })


// ─── WRONG 2: Using static Executor instead of Executable ─────────

// ❌ WRONG — the old static Executor has no container backing
// import { Executor } from "@ecosy/classable";
// Executor.run(fn, [Database]); // No global pool! Creates everything ad-hoc.

// ✅ FIX — use Executable(Container)
// const Executor = Executable(myContainer);


// ─── WRONG 3: Forgetting clearGlobals() in tests ──────────────────

// ❌ WRONG — global cache persists between test cases
// test("case 1", async () => {
//   await Executor.run((db) => { /* mutates db state */ }, [Database]);
// });
// test("case 2", async () => {
//   // db still has state from case 1!
//   await Executor.run((db) => { /* sees stale state */ }, [Database]);
// });

// ✅ FIX
// afterEach(() => {
//   Executor.clearGlobals();
// });


// Cleanup
Container.dispose();
