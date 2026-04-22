/**
 * ✅ Correct: Nested Injectable — an Injectable inside another Injectable.
 *
 * This pattern is used when a group of dependencies forms a logical unit
 * (e.g., a Fetchable HTTP client that wraps its own internal deps).
 * Each Injectable scope resolves independently.
 */
import { Injectable } from "@ecosy/classable";

// --- Inner Injectable: HTTP client with its own deps ---

class HttpClient {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url);
    return res.json() as Promise<T>;
  }
}

class RetryPolicy {
  maxRetries = 3;
  delayMs = 1000;
}

class Fetchable extends Injectable({
  http: HttpClient,
  retry: RetryPolicy,
}) {
  async fetchWithRetry<T>(url: string): Promise<T> {
    for (let i = 0; i < this.retry.maxRetries; i++) {
      try {
        return await this.http.get<T>(url);
      } catch {
        if (i === this.retry.maxRetries - 1) throw new Error(`Failed after ${this.retry.maxRetries} retries`);
        await new Promise((r) => setTimeout(r, this.retry.delayMs));
      }
    }
    throw new Error("Unreachable");
  }
}

// --- Outer Injectable: uses Fetchable as a dependency ---

class Logger {
  log(msg: string) { console.log(msg); }
}

class ApiService extends Injectable({
  fetchable: Fetchable,
  logger: Logger,
}) {
  async getUsers() {
    this.logger.log("Fetching users...");
    return this.fetchable.fetchWithRetry<unknown[]>("https://api.example.com/users");
  }
}

// --- Usage ---

const api = new ApiService();
// `api.fetchable` is a Fetchable instance with its own `http` and `retry` resolved
// `api.logger` is a Logger instance
await api.getUsers();
