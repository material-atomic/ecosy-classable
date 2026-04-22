/**
 * ✅ Correct: Basic Injectable with plain class dependencies.
 *
 * Each key in the inject map is a plain class (zero-arg constructor).
 * Injectable resolves them automatically and exposes them as `this.key`.
 */
import { Injectable } from "@ecosy/classable";

// --- Define dependency classes ---

class Logger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

class Database {
  async query(sql: string) {
    return [{ id: 1, name: "Alice" }];
  }
}

class Cache {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }
}

// --- Define service using Injectable ---

class UserService extends Injectable({
  db: Database,
  logger: Logger,
  cache: Cache,
}) {
  async findById(id: string) {
    // All dependencies are available as typed properties
    this.logger.log(`Finding user: ${id}`);

    const cached = this.cache.get<{ id: string; name: string }>(`user:${id}`);
    if (cached) return cached;

    const [user] = await this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
    this.cache.set(`user:${id}`, user);
    return user;
  }
}

// --- Usage ---

const service = new UserService();
await service.findById("1");
