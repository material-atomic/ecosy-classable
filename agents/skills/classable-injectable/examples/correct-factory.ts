/**
 * ✅ Correct: Factory descriptors for parameterized construction.
 *
 * When a dependency needs constructor arguments, use { target, get }.
 * `get` returns an array of arguments passed to `new target(...args)`.
 */
import { Injectable } from "@ecosy/classable";

// --- Dependencies that need constructor args ---

class Database {
  constructor(private connectionUrl: string) {}

  async query(sql: string) {
    console.log(`[${this.connectionUrl}] ${sql}`);
    return [];
  }
}

class Logger {
  constructor(
    private prefix: string,
    private level: "debug" | "info" | "warn" | "error",
  ) {}

  log(message: string) {
    console.log(`[${this.prefix}:${this.level}] ${message}`);
  }
}

class Cache {
  constructor(private ttlMs: number) {}

  get(key: string) {
    return undefined;
  }
}

// --- Service with factory descriptors ---

class AppService extends Injectable({
  db: {
    target: Database,
    get: () => ["postgres://localhost:5432/mydb"],
  },
  logger: {
    target: Logger,
    get: () => ["AppService", "info"] as const,
  },
  cache: {
    target: Cache,
    get: () => [60_000], // 60 second TTL
  },
}) {
  async start() {
    this.logger.log("Service started");
    await this.db.query("SELECT 1");
  }
}

// --- Usage ---

const app = new AppService();
await app.start();
