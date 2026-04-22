/**
 * ❌ Wrong patterns — misusing Placeholder.
 */
import { Injectable, Placeholder, placeholder } from "@ecosy/classable";

class Logger {
  log(msg: string) { console.log(msg); }
}

class AnalyticsService {
  track(event: string) { console.log(`[Track] ${event}`); }
}

// ─── WRONG 1: null/undefined for optional deps ────────────────────

// ❌ WRONG — null is not a class constructor, Injectable will fail
// class BadService extends Injectable({
//   logger: Logger,
//   analytics: null,  // TypeError!
// }) {}

// ❌ ALSO WRONG — conditional check everywhere is tedious and fragile
class AlsoBadService extends Injectable({ logger: Logger }) {
  private analytics: AnalyticsService | null = null;

  doWork() {
    this.logger.log("working");
    // ❌ Have to null-check EVERYWHERE
    if (this.analytics) {
      this.analytics.track("work.done");
    }
    // Forget one check → runtime crash
  }
}

// ✅ FIX — use `placeholder` as the default in the inject map.
// No null checks needed — Placeholder absorbs all calls silently.
class GoodService extends Injectable({
  logger: Logger,
  analytics: placeholder,
}) {
  doWork() {
    this.logger.log("working");
    // Safe — Placeholder absorbs the call, returns undefined
    (this.analytics as unknown as AnalyticsService).track("work.done");
  }
}


// ─── WRONG 2: Empty class as placeholder ──────────────────────────

// ❌ WRONG — doesn't implement the interface, crashes on method calls
class FakeAnalytics {}

// class BadService2 extends Injectable({
//   analytics: FakeAnalytics,
// }) {
//   doWork() {
//     this.analytics.track("event"); // ❌ TypeError: track is not a function
//   }
// }

// ✅ FIX — use Placeholder. It absorbs any property access or method call.
// new Placeholder().anyMethod() → undefined (safe)


// ─── WRONG 3: Using Placeholder for required deps ──────────────────

// ❌ WRONG — if the dep is required, Placeholder hides bugs
// class CriticalService extends Injectable({
//   db: placeholder,  // ❌ Silently drops all queries!
// }) {}

// ✅ FIX — only use Placeholder for genuinely OPTIONAL dependencies.
// Required deps should use the real class or a factory descriptor.
