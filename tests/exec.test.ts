import { describe, expect, it } from "vitest";
import { ExecContext } from "../src/exec";
import { Injectable } from "../src/injectable";
import { app, shared } from "../src/lifetime";
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
function request(plan: ReturnType<typeof compile>, slots = 0) {
  return ExecContext.application(slots).open(plan);
}

describe("ExecContext", () => {
  it("builds nothing until a key is touched", () => {
    const { built, mark } = tracker();
    const ctx = request(compile({ a: mark("A"), b: mark("B"), c: mark("C") }));

    expect(built).toEqual([]);
    ctx.resolve("a");
    ctx.resolve("b");

    // Three declared, two touched. The third costs nothing — the whole reason
    // eager injection was the wrong default.
    expect(built).toEqual(["A", "B"]);
  });

  it("builds a token at most once per frame", () => {
    const { built, mark } = tracker();
    const ctx = request(compile({ a: mark("A") }));

    expect(ctx.resolve("a")).toBe(ctx.resolve("a"));
    expect(built).toEqual(["A"]);
  });

  it("gives one token one slot however many keys reach it", () => {
    const { built, mark } = tracker();
    const A = mark("A");
    const ctx = request(compile({ first: A, second: A }));

    expect(ctx.resolve("first")).toBe(ctx.resolve("second"));
    expect(built).toEqual(["A"]);
  });

  it("never lets two executions share a scoped instance", () => {
    const { mark } = tracker();
    const plan = compile({ a: mark("A") });

    expect(request(plan).resolve("a")).not.toBe(request(plan).resolve("a"));
  });

  it("wires a token's own dependencies after building it", () => {
    const built: string[] = [];

    class Db { constructor() { built.push("Db"); } }
    class Repo extends Injectable({ db: Db }) { constructor() { super(); built.push("Repo"); } }
    class Service extends Injectable({ repo: Repo }) {}

    const ctx = request(compile({ service: Service }));
    const service = ctx.resolve<Service>("service");

    expect(service.repo).toBeInstanceOf(Repo);
    expect(service.repo.db).toBeInstanceOf(Db);

    // Constructors run OUTERMOST first: property injection needs the object to
    // exist before anything can be assigned onto it, so Repo is constructed and
    // only then is Db built to fill it.
    expect(built).toEqual(["Repo", "Db"]);
  });

  it("owns in dependency order even though it constructs in the opposite one", async () => {
    const gone: string[] = [];

    class Db { async onDispose() { gone.push("Db"); } }
    class Repo extends Injectable({ db: Db }) { async onDispose() { gone.push("Repo"); } }

    const ctx = request(compile({ repo: Repo }));
    ctx.resolve("repo");
    await ctx.settle();

    // The order that matters is ownership, not construction. An instance is
    // recorded once it is complete, so Db — built while wiring Repo — is
    // recorded first, and reverse order then tears Repo down before the Db it
    // still holds. Recording at construction time would invert this and
    // dispose a dependency out from under its dependent.
    expect(gone).toEqual(["Repo", "Db"]);
  });

  it("catches a dependency cycle at compile time, not at request time", () => {
    class A extends Injectable({}) {}
    class B extends Injectable({ a: A }) {}
    (A as unknown as { __injects: object }).__injects = { b: B };

    // A stack overflow at request time would name nothing. Here both classes
    // are still in hand, so the message can say which two.
    expect(() => compile({ a: A })).toThrow(/Circular dependency/);
  });

  it("puts app-scoped tokens in frame 0 and builds them once", () => {
    const built: string[] = [];
    const Pool = app(class Pool { constructor() { built.push("Pool"); } });

    const slots = new AppSlots();
    const plan = compile({ pool: Pool }, { app: slots });
    const root = ExecContext.application(slots.size);

    expect(root.open(plan).resolve("pool")).toBe(root.open(plan).resolve("pool"));
    expect(built).toEqual(["Pool"]);
  });

  it("disposes in reverse construction order", async () => {
    const { gone, mark } = tracker();
    const ctx = request(compile({ a: mark("A"), b: mark("B") }));

    ctx.resolve("a");
    ctx.resolve("b");
    await ctx.settle();

    // B was built last, so it goes first: what came later may still hold what
    // came before it.
    expect(gone).toEqual(["B", "A"]);
  });

  it("disposes what it built and never what it borrowed", async () => {
    const gone: string[] = [];
    const Pool = app(class Pool { async onDispose() { gone.push("Pool"); } });
    class Scoped { async onDispose() { gone.push("Scoped"); } }

    const slots = new AppSlots();
    const plan = compile({ pool: Pool, scoped: Scoped }, { app: slots });
    const application = ExecContext.application(slots.size);
    const ctx = application.open(plan);

    ctx.resolve("pool");
    ctx.resolve("scoped");
    await ctx.settle();

    // The application still holds the pool. A request disposing it would be a
    // use-after-dispose for every other request in the process.
    expect(gone).toEqual(["Scoped"]);

    await application.settle();
    expect(gone).toEqual(["Scoped", "Pool"]);
  });

  it("lets a nested scope borrow a shared token without owning it", async () => {
    const built: string[] = [];
    const gone: string[] = [];

    const Tx = shared(class Tx {
      constructor() { built.push("Tx"); }
      async onDispose() { gone.push("Tx"); }
    });

    const outer = compile({ tx: Tx }, { frame: 1 });
    const inner = link(compile({ tx: Tx }, { frame: 2 }), [outer]);

    const route = ExecContext.application().open(outer);
    const handler = route.open(inner);

    expect(handler.resolve("tx")).toBe(route.resolve("tx"));
    expect(built).toEqual(["Tx"]);

    // The handler scope ends first and must not take the route's object with it.
    await handler.settle();
    expect(gone).toEqual([]);

    await route.settle();
    expect(gone).toEqual(["Tx"]);
  });

  it("resolves an absent optional key to undefined without building anything", async () => {
    const { built, gone, mark } = tracker();

    const ctx = request(
      compile({ real: mark("Real"), tracer: undefined }, { optional: ["tracer"] }),
    );

    expect(ctx.resolve("tracer")).toBeUndefined();
    expect(built).toEqual([]);

    ctx.resolve("real");
    await ctx.settle();

    // Nothing was built for the absent key, so nothing was owned or disposed.
    expect(gone).toEqual(["Real"]);
  });

  it("refuses a missing token that was not declared optional", () => {
    expect(() => compile({ tracer: undefined })).toThrow(/has no token/);
  });

  it("does not let optional swallow a failure", () => {
    class Broken { constructor() { throw new Error("constructor blew up"); } }
    const ctx = request(compile({ broken: Broken }, { optional: ["broken"] }));

    // `optional` says absence is acceptable. It does not say failure is.
    expect(() => ctx.resolve("broken")).toThrow(/blew up/);
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
    expect(good.ok).toBe(true);
  });

  it("refuses to resolve after the scope has settled", async () => {
    const { mark } = tracker();
    const ctx = request(compile({ a: mark("A") }));

    await ctx.settle();
    expect(() => ctx.resolve("a")).toThrow(/after settle/);
  });

  it("rejects a plan opened at the wrong depth", () => {
    const { mark } = tracker();
    expect(() => ExecContext.application().open(compile({ a: mark("A") }, { frame: 2 })))
      .toThrow(/frame 2/);
  });
});

describe("Injectable", () => {
  it("holds a declaration and no instances", () => {
    class Db {}
    const Base = Injectable({ db: Db });

    expect(Base.__injects).toEqual({ db: Db });
    // The point of the rewrite: nothing on the class survives a request.
    expect(Object.getOwnPropertyNames(Base)).not.toContain("__instances");
  });

  it("refuses an optional key that is not declared", () => {
    class Db {}
    expect(() => Injectable({ db: Db }, { optional: ["nope" as "db"] })).toThrow(/not a declared/);
  });
});

describe("lifetime ordering", () => {
  it("refuses a brand applied after the token has been compiled", () => {
    class Pool {}

    compile({ pool: Pool });

    // Silently answering `scoped` here would mean one instance per request for
    // something meant to live once per process — no throw, no log, just a
    // connection pool that is not a pool.
    expect(() => app(Pool)).toThrow(/already compiled/);
  });

  it("accepts a brand applied before any compile", () => {
    const Pool = app(class Pool {});
    const slots = new AppSlots();

    expect(compile({ pool: Pool }, { app: slots }).entries[0]!.frame).toBe(0);
  });
});

describe("link", () => {
  it("keeps entries topologically ordered", () => {
    class Db {}
    class Repo extends Injectable({ db: Db }) {}
    const Tx = shared(class Tx {});

    const outer = compile({ tx: Tx }, { frame: 1 });
    const inner = link(compile({ repo: Repo, tx: Tx }, { frame: 2 }), [outer]);

    const order = inner.entries.map((e) => (e.token as { name?: string }).name);

    // A dependency must still precede its dependent after relinking. The order
    // is a property of `entries`; rebuilding the list from a token-keyed map
    // would preserve it only by coincidence of insertion order.
    expect(order.indexOf("Db")).toBeLessThan(order.indexOf("Repo"));
    // The shared token moved to the ancestor, so it is gone from this plan.
    expect(order).not.toContain("Tx");
  });
});

describe("wiring", () => {
  it("writes plain own properties, in plan order", () => {
    class Db {}
    class Log {}
    class Repo extends Injectable({ db: Db, log: Log }) {}

    const ctx = request(compile({ repo: Repo }));
    const repo = ctx.resolve<Repo>("repo");

    // Same keys, same order, every instance — which is what keeps the object's
    // shape stable across requests instead of megamorphic.
    expect(Object.keys(repo)).toEqual(["db", "log"]);

    const descriptor = Object.getOwnPropertyDescriptor(repo, "db")!;
    expect(descriptor).toMatchObject({ enumerable: true, writable: true, configurable: true });
  });
});
