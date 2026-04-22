/**
 * ✅ Correct: Using Placeholder as a null-object default.
 *
 * The Placeholder class absorbs all property accesses and method calls
 * silently — making it safe to use as a default when a real dependency
 * is unavailable.
 */
import { Injectable, Placeholder, placeholder } from "@ecosy/classable";

// --- Define an optional service ---

class AnalyticsService {
  track(event: string, data: Record<string, unknown>) {
    console.log(`[Analytics] ${event}`, data);
  }

  identify(userId: string) {
    console.log(`[Analytics] Identified: ${userId}`);
  }
}

// --- Use Placeholder as a default in the inject map ---
// When analytics is not overridden, the Placeholder instance absorbs
// all calls silently (returns undefined, never throws).

class Logger {
  log(msg: string) { console.log(msg); }
}

class UserService extends Injectable({
  logger: Logger,
  // Use the `placeholder` factory descriptor as a default.
  // If no real AnalyticsService is injected later, all calls are safe no-ops.
  analytics: placeholder,
}) {
  async registerUser(name: string, email: string) {
    this.logger.log(`Registering user: ${name}`);

    // Safe even if analytics is a Placeholder — returns undefined silently
    (this.analytics as unknown as AnalyticsService).track("user.registered", { name, email });
    (this.analytics as unknown as AnalyticsService).identify(email);

    return { id: "new-id", name, email };
  }
}

// --- Standalone usage ---
// The Placeholder class can also be instantiated directly:

const noop = new Placeholder();
// Any property access or method call on `noop` returns undefined.

// --- Usage ---

const service = new UserService();
await service.registerUser("Alice", "alice@example.com");
// Logger prints normally, analytics calls are absorbed silently
