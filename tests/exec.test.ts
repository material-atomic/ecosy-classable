import { describe, expect, it } from "vitest";
import { ExecContext } from "../src/exec";
import { Global } from "../src/global";
import { AppSlots, compile, link } from "../src/plan";

function tracker() {
  const built: string[] = [];
  const gone: string[] = [];

  const mark = (name: string) =>
    class {
      constructor() { built.push(name); }
      async onDispose() { gone.push(name); }
    };

  return { built, gone, mark };
}

/** Frame 0 exists before any request; frame 1 is the request. */
function request(plan: ReturnType<typeof compile>, app = new AppSlots()) {
  return ExecContext.application(app.size).open(plan);
}

describe("ExecContext", () => {
  it("builds nothing until a key is touched", () => {
    const { built, mark } = tracker();
    const ctx = request(compile({ a: mark("A"), b: mark("B"), c: mark("C") }));

    expect(built).toEqual([]);
    ctx.resolve("a");
    ctx.resolve("b");

    // Three declared, two touched. The third costs nothing — which is the
    // whole reason eager injection was the wrong default.
    expect(built).toEqual(["A", "B"]);
  });

  it("builds a token at most once per frame", () => {
    const { built, mark } = tracker();
    const ctx = request(compile({ a: mark("A") }));

    expect(ctx.resolve("a")).toBe(ctx.resolve("a"));
    expect(built).toEqual(["A"]);
  });

  it("never lets two executions share a scoped instance", () => {
    const { mark } = tracker();
    const plan = compile({ a: mark("A") });
    const app = new AppSlots();

    // Same plan, two requests. The plan is the shared thing; instances are not.
    expect(request(plan, app).resolve("a")).not.toBe(request(plan, app).resolve("a"));
  });

  it("puts app-scoped tokens in frame 0 and builds them once", () => {
    const built: string[] = [];
    class Pool extends Global() {
      constructor() { super(); built.push("Pool"); }
    }

    const app = new AppSlots();
    const plan = compile({ pool: Pool }, { app });
    const root = ExecContext.application(app.size);

    const first = root.open(plan);
    const second = root.open(plan);

    expect(first.resolve("pool")).toBe(second.resolve("pool"));
    expect(built).toEqual(["Pool"]);
  });

  it("disposes in reverse construction order", async () => {
    const { gone, mark } = tracker();
    const ctx = request(compile({ a: mark("A"), b: mark("B") }));

    ctx.resolve("a");
    ctx.resolve("b");
    await ctx.settle();

    // B was built last, so it goes first: whatever came later may still be
    // holding what came before it.
    expect(gone).toEqual(["B", "A"]);
  });

  it("disposes what it built and never what it borrowed", async () => {
    const gone: string[] = [];
    class Pool extends Global() {
      async onDispose() { gone.push("Pool"); }
    }
    class Scoped {
      async onDispose() { gone.push("Scoped"); }
    }

    const app = new AppSlots();
    const plan = compile({ pool: Pool, scoped: Scoped }, { app });
    const ctx = ExecContext.application(app.size).open(plan);

    ctx.resolve("pool");
    ctx.resolve("scoped");
    await ctx.settle();

    // The application still holds the pool. A request disposing it would be a
    // use-after-dispose for every other request in the process.
    expect(gone).toEqual(["Scoped"]);
  });

  it("lets a nested scope borrow a shared token without owning it", async () => {
    const built: string[] = [];
    const gone: string[] = [];

    class Tx {
      constructor() { built.push("Tx"); }
      async onDispose() { gone.push("Tx"); }
    }
    // Declared shared: the frame that declares it owns it, deeper frames borrow.
    (Tx as unknown as { __shared: boolean }).__shared = true;

    const outer = compile({ tx: Tx }, { frame: 1 });
    const inner = link(compile({ tx: Tx }, { frame: 2 }), [outer]);

    const route = ExecContext.application(0).open(outer);
    const handler = route.open(inner);

    const fromHandler = handler.resolve("tx");
    const fromRoute = route.resolve("tx");

    // One instance across both frames, built once.
    expect(fromHandler).toBe(fromRoute);
    expect(built).toEqual(["Tx"]);

    // The handler scope ends first and must not take the route's object with it.
    await handler.settle();
    expect(gone).toEqual([]);

    await route.settle();
    expect(gone).toEqual(["Tx"]);
  });

  it("collects disposal errors instead of throwing or swallowing them", async () => {
    class Bad { async onDispose() { throw new Error("boom"); } }
    class Good {
      ok = false;
      async onDispose() { this.ok = true; }
    }

    const ctx = request(compile({ good: Good, bad: Bad }));
    const good = ctx.resolve<Good>("good");
    ctx.resolve("bad");

    const errors = await ctx.settle();

    expect(errors).toHaveLength(1);
    // The failure did not abort the rest of the teardown.
    expect(good.ok).toBe(true);
  });

  it("refuses to resolve after the scope has settled", async () => {
    const { mark } = tracker();
    const ctx = request(compile({ a: mark("A") }));

    await ctx.settle();
    expect(() => ctx.resolve("a")).toThrow(/after settle/);
  });

  it("refuses a promise from a token the plan did not mark async", () => {
    class Sneaky {
      constructor() { return Promise.resolve({}) as unknown as Sneaky; }
    }

    const ctx = request(compile({ sneaky: Sneaky }));
    expect(() => ctx.resolve("sneaky")).toThrow(/did not mark it async/);
  });

  it("settles the application frame only when the application is settled", async () => {
    const gone: string[] = [];
    class Pool extends Global() {
      async onDispose() { gone.push("Pool"); }
    }

    const app = new AppSlots();
    const plan = compile({ pool: Pool }, { app });
    const application = ExecContext.application(app.size);
    const ctx = application.open(plan);

    ctx.resolve("pool");
    await ctx.settle();
    expect(gone).toEqual([]);

    // Shutdown, not a request. This is the only time frame 0 is torn down.
    await application.settle();
    expect(gone).toEqual(["Pool"]);
  });

  it("rejects a plan opened at the wrong depth", () => {
    const { mark } = tracker();
    const plan = compile({ a: mark("A") }, { frame: 2 });

    expect(() => ExecContext.application(0).open(plan)).toThrow(/frame 2/);
  });
});
