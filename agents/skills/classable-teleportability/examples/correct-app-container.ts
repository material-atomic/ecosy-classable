/**
 * ✅ Correct: Application container with Teleportability.
 *
 * Registers a global container with Symbol key, uses inject() for
 * late-binding, and accesses instances via get().
 */
import { Teleportability } from "@ecosy/classable";

// --- Define dependencies ---

class Configuration {
  readonly port = 3000;
  readonly dbUrl = "postgres://localhost:5432/mydb";
}

class Database {
  constructor(private url: string) {}
  async query(sql: string) { return []; }
}

class Logger {
  log(msg: string) { console.log(`[APP] ${msg}`); }
}

// --- Register the container ---

export const AppContainer = Teleportability({
  key: Symbol.for("myapp:container"),
  injects: {
    config: Configuration,
    db: { target: Database, get: () => ["postgres://localhost:5432/mydb"] },
    logger: Logger,
  },
});

// --- Late-bind additional dependencies ---
// inject() adds new deps to the inject map BEFORE the first access.
// This MUST happen before the first get() or instance access.

// Note: inject() accepts keys already declared in the original injects map
// to override them, or extends the map with new keys (untyped at the TS level,
// accessed via get<T>(key)).

AppContainer.inject({ logger: Logger }); // Override example

// --- Access resolved instances ---

const logger = AppContainer.get<Logger>("logger");
logger.log("Container initialized");

const db = AppContainer.get<Database>("db");
await db.query("SELECT 1");

// Or access all at once via `instance`:
const instances = AppContainer.instance;

// --- Cleanup (for tests) ---

// AppContainer.dispose(); // Clears all instances, re-constructs on next access
