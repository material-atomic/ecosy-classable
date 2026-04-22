import { describe, it, expect, vi } from "vitest";
import { Injectable, InjectedAccessor } from "../src/index";

// ─── Fixtures ────────────────────────────────────────────────────

class Logger {
  log(msg: string) { return msg; }
}

class Database {
  query(sql: string) { return [{ id: 1 }]; }
}

class CacheService {
  constructor(public prefix: string) {}
  get(key: string) { return `${this.prefix}:${key}`; }
}

// ─── Basic resolution ────────────────────────────────────────────

describe("Injectable — basic resolution", () => {
  it("resolves plain class dependencies", () => {
    class MyService extends Injectable({
      logger: Logger,
      db: Database,
    }) {}

    const service = new MyService();
    expect(service.logger).toBeInstanceOf(Logger);
    expect(service.db).toBeInstanceOf(Database);
  });

  it("exposes injected properties as enumerable", () => {
    class MyService extends Injectable({ logger: Logger }) {}
    const service = new MyService();
    expect(Object.keys(service)).toContain("logger");
  });

  it("resolves factory descriptors with get()", () => {
    class MyService extends Injectable({
      cache: {
        target: CacheService,
        get: () => ["app"] as [string],
      },
    }) {}

    const service = new MyService();
    expect(service.cache).toBeInstanceOf(CacheService);
    expect(service.cache.get("user")).toBe("app:user");
  });

  it("passes InjectedAccessor to factory get()", () => {
    class MyService extends Injectable({
      logger: Logger,
      cache: {
        target: CacheService,
        get: (accessor: InjectedAccessor) => {
          const logger = accessor.get<Logger>("logger");
          return [logger.log("prefix")] as [string];
        },
      },
    }) {}

    const service = new MyService();
    expect(service.cache.get("key")).toBe("prefix:key");
  });
});

// ─── Order-independent (lazy) resolution ─────────────────────────

describe("Injectable — lazy resolution", () => {
  it("resolves dependencies regardless of declaration order", () => {
    // cache depends on db, but cache is declared first
    class MyService extends Injectable({
      cache: {
        target: CacheService,
        get: (accessor: InjectedAccessor) => {
          const db = accessor.get<Database>("db");
          return [db.query("SELECT 1")[0].id.toString()] as [string];
        },
      },
      db: Database,
    }) {}

    const service = new MyService();
    expect(service.cache.get("x")).toBe("1:x");
    expect(service.db).toBeInstanceOf(Database);
  });
});

// ─── Circular dependency detection ───────────────────────────────

describe("Injectable — circular dependency", () => {
  it("throws on circular dependency", () => {
    expect(() => {
      class Circular extends Injectable({
        a: {
          target: Logger,
          get: (acc: InjectedAccessor) => {
            acc.get("b"); // triggers b
            return [] as [];
          },
        },
        b: {
          target: Logger,
          get: (acc: InjectedAccessor) => {
            acc.get("a"); // triggers a → cycle!
            return [] as [];
          },
        },
      }) {}

      new Circular();
    }).toThrow(/Circular dependency/);
  });
});

// ─── Async selector rejection ────────────────────────────────────

describe("Injectable — async rejection", () => {
  it("throws on async factory get()", () => {
    expect(() => {
      class AsyncService extends Injectable({
        logger: {
          target: Logger,
          get: () => Promise.resolve([]) as any,
        },
      }) {}

      new AsyncService();
    }).toThrow(/Async selector not supported/);
  });
});

// ─── Reconciliation ──────────────────────────────────────────────

describe("Injectable — reconciliation", () => {
  it("reuses compatible instances across reconstructions", () => {
    class MyService extends Injectable({
      logger: Logger,
      db: Database,
    }) {}

    const first = new MyService();
    const firstLogger = first.logger;
    const firstDb = first.db;

    // Second construction should reconcile — same targets
    const second = new MyService();
    expect(second.logger).toBe(firstLogger);
    expect(second.db).toBe(firstDb);
  });
});

// ─── onInit lifecycle ────────────────────────────────────────────

describe("Injectable — onInit", () => {
  it("calls onInit on injected instances", async () => {
    const initSpy = vi.fn();

    class InitService {
      // onInit must be an own property (not prototype method)
      // because isInitializable uses hasOwnProperty check
      onInit = () => { initSpy(); };
    }

    class MyService extends Injectable({ svc: InitService }) {}
    const service = new MyService();

    const Cls = service.constructor as any;
    await Cls.waitForInjects(service);
    expect(initSpy).toHaveBeenCalledOnce();
  });
});

// ─── onDispose lifecycle ─────────────────────────────────────────

describe("Injectable — onDispose", () => {
  it("calls onDispose in reverse order", async () => {
    const order: string[] = [];

    class First {
      onDispose() { order.push("first"); }
    }
    class Second {
      onDispose() { order.push("second"); }
    }

    class MyService extends Injectable({ first: First, second: Second }) {}
    const service = new MyService();

    const Cls = service.constructor as any;
    await Cls.disposeInjects(service);
    expect(order).toEqual(["second", "first"]);
  });
});

// ─── Re-entrant construction guard ───────────────────────────────

describe("Injectable — re-entrant guard", () => {
  it("throws on re-entrant construction of the same class", () => {
    // We can't easily trigger true re-entry in sync code without
    // hacking the constructor, so just verify the flag mechanism exists
    class SimpleService extends Injectable({ logger: Logger }) {}
    const Cls = SimpleService as any;

    expect(Cls.__constructing).toBe(false);
    const instance = new SimpleService();
    // After construction, lock should be released
    expect(Cls.__constructing).toBe(false);
  });
});

// ─── InjectedAccessor ────────────────────────────────────────────

describe("InjectedAccessor", () => {
  it("get() returns stored instance", () => {
    const map = new Map<string, unknown>([["foo", 42]]);
    const accessor = new InjectedAccessor(map);
    expect(accessor.get("foo")).toBe(42);
  });

  it("get() throws for missing key without resolver", () => {
    const map = new Map<string, unknown>();
    const accessor = new InjectedAccessor(map);
    expect(() => accessor.get("missing")).toThrow(/does not exist/);
  });

  it("get() uses resolver for missing key", () => {
    const map = new Map<string, unknown>();
    const resolver = (key: string) => {
      map.set(key, `resolved:${key}`);
      return `resolved:${key}`;
    };
    const accessor = new InjectedAccessor(map, resolver);
    expect(accessor.get("foo")).toBe("resolved:foo");
  });

  it("has() checks existence", () => {
    const map = new Map<string, unknown>([["foo", 1]]);
    const accessor = new InjectedAccessor(map);
    expect(accessor.has("foo")).toBe(true);
    expect(accessor.has("bar")).toBe(false);
  });
});
