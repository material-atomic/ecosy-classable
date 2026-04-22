/**
 * ✅ Correct: Using Executable for dependency-resolved function execution.
 */
import { Teleportability, Executable, Global, Lifecycle } from "@ecosy/classable";

// --- Dependencies ---

class Database extends Global() {
  async query(sql: string) { return [{ id: 1 }]; }
}

class Logger extends Global() {
  log(msg: string) { console.log(`[LOG] ${msg}`); }
}

class RequestValidator {
  // No __global — transient, created fresh per run()
  validate(input: unknown): boolean {
    return input !== null && input !== undefined;
  }
}

// --- Container + Executor setup ---

const AppContainer = Teleportability({
  key: Symbol.for("exec-demo:container"),
  injects: { db: Database, logger: Logger },
});

const Executor = Executable(AppContainer);

// --- run(): Execute a function with resolved deps ---

await Executor.run(
  (db, logger) => {
    (logger as Logger).log("Querying database...");
    return (db as Database).query("SELECT * FROM users");
  },
  [Database, Logger] as any,
);

// Transient deps are created fresh:
await Executor.run(
  (db, validator) => {
    if ((validator as RequestValidator).validate({ name: "Alice" })) {
      return (db as Database).query("INSERT INTO users (name) VALUES ('Alice')");
    }
  },
  [Database, RequestValidator] as any,
);

// --- lifecycle(): Execute through the full pipeline ---

// Define a handler with lifecycle descriptor
class CreateUserHandler extends Lifecycle({
  guards: [],
  pipes: [],
  interceptors: [],
  filters: [],
}) {
  async execute(input: { name: string }) {
    // This is called after guards pass, pipes transform, interceptors wrap
    return { id: "new-id", name: input.name };
  }
}

const result = await Executor.lifecycle(CreateUserHandler, [{ name: "Bob" }]);
console.log(result); // { id: "new-id", name: "Bob" }

// --- Test cleanup ---

Executor.clearGlobals(); // Reset for next test
AppContainer.dispose();
