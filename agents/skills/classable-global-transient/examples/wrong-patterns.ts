/**
 * ❌ Wrong patterns for Global / Transient scope.
 */

// ─── WRONG 1: Stateful class without explicit scope ────────────────

// ❌ WRONG — this class holds request state but has no scope marker.
// If Executable treats it as transient by default, it's fine.
// But if someone later marks it global, request state leaks!
class RequestHandler {
  // No __global declared — ambiguous!
  private requestData: unknown = null;

  handle(data: unknown) {
    this.requestData = data; // ❌ State leak if this becomes global
  }
}

// ✅ FIX — be explicit
class GoodRequestHandler {
  static __global = false; // Explicit: fresh per request

  private requestData: unknown = null;

  handle(data: unknown) {
    this.requestData = data; // Safe — new instance each time
  }
}


// ─── WRONG 2: Global class that holds request-specific state ───────

// ❌ WRONG — global means ONE instance for ALL requests
class BadCache {
  static __global = true;

  currentUserId: string | null = null; // ❌ Per-request data in a global!

  setUser(id: string) {
    this.currentUserId = id; // Overwrites for ALL concurrent requests!
  }
}

// ✅ FIX — store per-request data in a Map, or make it transient
class GoodCache {
  static __global = true;

  private store = new Map<string, unknown>(); // Keyed, not global state

  get(key: string) { return this.store.get(key); }
  set(key: string, value: unknown) { this.store.set(key, value); }
}


// ─── WRONG 3: Expensive class marked as transient ──────────────────

// ❌ WRONG — creating a new connection pool per request is wasteful
class ExpensivePool {
  static __global = false; // ❌ Transient! Created on every call!

  constructor() {
    // Imagine this opens 10 database connections...
    console.log("Opening 10 connections..."); // Happens every request!
  }
}

// ✅ FIX — expensive resources should be global
class GoodPool {
  static __global = true; // ✅ Created once, reused

  constructor() {
    console.log("Opening 10 connections..."); // Happens once
  }
}
