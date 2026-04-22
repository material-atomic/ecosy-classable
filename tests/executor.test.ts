import { describe, it, expect, afterEach } from "vitest";
import { Executor } from "../src/index";

// ─── Fixtures ────────────────────────────────────────────────────

class GlobalDB {
  static __global = true as const;
  query(sql: string) { return [{ id: 1 }]; }
}

class TransientLogger {
  logs: string[] = [];
  log(msg: string) { this.logs.push(msg); }
}

afterEach(() => {
  Executor.clearGlobals();
});

// ─── Executor.run ────────────────────────────────────────────────

describe("Executor.run", () => {
  it("resolves deps and executes function", async () => {
    const result = await Executor.run(
      (db) => (db as GlobalDB).query("SELECT 1"),
      [GlobalDB] as any,
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it("caches global deps across runs", async () => {
    let dbRef1: unknown;
    let dbRef2: unknown;

    await Executor.run(
      (db) => { dbRef1 = db; },
      [GlobalDB] as any,
    );

    await Executor.run(
      (db) => { dbRef2 = db; },
      [GlobalDB] as any,
    );

    expect(dbRef1).toBe(dbRef2);
  });

  it("creates fresh transient deps per run", async () => {
    let loggerRef1: unknown;
    let loggerRef2: unknown;

    await Executor.run(
      (logger) => { loggerRef1 = logger; },
      [TransientLogger] as any,
    );

    await Executor.run(
      (logger) => { loggerRef2 = logger; },
      [TransientLogger] as any,
    );

    expect(loggerRef1).not.toBe(loggerRef2);
  });

  it("deduplicates transient deps within same run", async () => {
    await Executor.run(
      (l1, l2) => {
        expect(l1).toBe(l2); // Same transient dep in one run = same instance
      },
      [TransientLogger, TransientLogger] as any,
    );
  });
});

// ─── Executor.clearGlobals ───────────────────────────────────────

describe("Executor.clearGlobals", () => {
  it("resets global cache", async () => {
    let ref1: unknown;
    let ref2: unknown;

    await Executor.run(
      (db) => { ref1 = db; },
      [GlobalDB] as any,
    );

    Executor.clearGlobals();

    await Executor.run(
      (db) => { ref2 = db; },
      [GlobalDB] as any,
    );

    expect(ref1).not.toBe(ref2);
  });
});

// ─── Executor.evict ──────────────────────────────────────────────

describe("Executor.evict", () => {
  it("removes a specific global entry", async () => {
    let ref1: unknown;
    let ref2: unknown;

    await Executor.run(
      (db) => { ref1 = db; },
      [GlobalDB] as any,
    );

    Executor.evict(GlobalDB);

    await Executor.run(
      (db) => { ref2 = db; },
      [GlobalDB] as any,
    );

    expect(ref1).not.toBe(ref2);
  });
});

// ─── Executor.lifecycle ──────────────────────────────────────────

describe("Executor.lifecycle", () => {
  it("runs execute() on a class with empty descriptor", async () => {
    class Handler {
      static descriptor = { guards: [], pipes: [], interceptors: [], filters: [] };
      async execute(input: string) { return `handled:${input}`; }
    }

    const result = await Executor.lifecycle(Handler as any, ["hello"]);
    expect(result).toBe("handled:hello");
  });

  it("runs guards before handler", async () => {
    const order: string[] = [];

    class PassGuard {
      canActivate() { order.push("guard"); return true; }
    }

    class Handler {
      static descriptor = { guards: [PassGuard], pipes: [], interceptors: [], filters: [] };
      async execute() { order.push("handler"); return "ok"; }
    }

    await Executor.lifecycle(Handler as any, []);
    expect(order).toEqual(["guard", "handler"]);
  });

  it("rejects when guard returns false", async () => {
    class RejectGuard {
      canActivate() { return false; }
    }

    class Handler {
      static descriptor = { guards: [RejectGuard], pipes: [], interceptors: [], filters: [] };
      async execute() { return "should not reach"; }
    }

    await expect(Executor.lifecycle(Handler as any, [])).rejects.toThrow(/Forbidden/);
  });

  it("pipes transform first argument", async () => {
    class UpperPipe {
      transform(value: unknown) { return String(value).toUpperCase(); }
    }

    class Handler {
      static descriptor = { guards: [], pipes: [UpperPipe], interceptors: [], filters: [] };
      async execute(input: string) { return input; }
    }

    const result = await Executor.lifecycle(Handler as any, ["hello"]);
    expect(result).toBe("HELLO");
  });

  it("interceptors wrap execution (onion model)", async () => {
    const order: string[] = [];

    class TimingInterceptor {
      async intercept(_ctx: unknown, next: () => Promise<unknown>) {
        order.push("before");
        const result = await next();
        order.push("after");
        return result;
      }
    }

    class Handler {
      static descriptor = { guards: [], pipes: [], interceptors: [TimingInterceptor], filters: [] };
      async execute() { order.push("handler"); return "done"; }
    }

    const result = await Executor.lifecycle(Handler as any, []);
    expect(order).toEqual(["before", "handler", "after"]);
    expect(result).toBe("done");
  });

  it("filters transform successful result", async () => {
    class WrapFilter {
      transform(result: unknown) { return { data: result }; }
    }

    class Handler {
      static descriptor = { guards: [], pipes: [], interceptors: [], filters: [WrapFilter] };
      async execute() { return "raw"; }
    }

    const result = await Executor.lifecycle(Handler as any, []);
    expect(result).toEqual({ data: "raw" });
  });

  it("filters catch errors", async () => {
    class ErrorFilter {
      catch(error: unknown) { return { error: String(error) }; }
    }

    class Handler {
      static descriptor = { guards: [], pipes: [], interceptors: [], filters: [ErrorFilter] };
      async execute() { throw new Error("boom"); }
    }

    // filter.catch returns a value, but lifecycle still throws the return value
    // because the catch block re-throws finalError
    await expect(Executor.lifecycle(Handler as any, [])).rejects.toEqual({
      error: "Error: boom",
    });
  });

  it("full pipeline order: guard → pipe → interceptor → handler → filter", async () => {
    const order: string[] = [];

    class G { canActivate() { order.push("guard"); return true; } }
    class P { transform(v: unknown) { order.push("pipe"); return v; } }
    class I {
      async intercept(_: unknown, next: () => Promise<unknown>) {
        order.push("interceptor:before");
        const r = await next();
        order.push("interceptor:after");
        return r;
      }
    }
    class F { transform(r: unknown) { order.push("filter"); return r; } }

    class H {
      static descriptor = { guards: [G], pipes: [P], interceptors: [I], filters: [F] };
      async execute(input: unknown) { order.push("handler"); return input; }
    }

    await Executor.lifecycle(H as any, ["data"]);
    expect(order).toEqual([
      "guard",
      "pipe",
      "interceptor:before",
      "handler",
      "interceptor:after",
      "filter",
    ]);
  });
});
