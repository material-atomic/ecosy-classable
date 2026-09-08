import { describe, expect, it } from "vitest";
import { Global } from "../src/global";
import { compile } from "../src/plan";
import { Portal } from "../src/portal";

/** Counts constructions so "was it built at all" is observable, not inferred. */
function counted() {
  const built: string[] = [];
  const disposed: string[] = [];

  class Db {
    constructor() { built.push("Db"); }
    async onDispose() { disposed.push("Db"); }
  }

  class Repo {
    constructor() { built.push("Repo"); }
    async onDispose() { disposed.push("Repo"); }
  }

  class Never {
    constructor() { built.push("Never"); }
  }

  return { built, disposed, Db, Repo, Never };
}

describe("Portal", () => {
  it("builds nothing until a key is touched", () => {
    const { built, Db, Repo, Never } = counted();
    const portal = new Portal({ plan: compile({ db: Db, repo: Repo, never: Never }) });

    expect(built).toEqual([]);

    portal.resolve("db");
    portal.resolve("repo");

    // Three declared, two touched. The untouched one costs nothing — this is
    // the whole reason eager injection was the wrong default.
    expect(built).toEqual(["Db", "Repo"]);
  });

  it("builds each token at most once per portal", () => {
    const { built, Db } = counted();
    const portal = new Portal({ plan: compile({ db: Db }) });

    const a = portal.resolve("db");
    const b = portal.resolve("db");

    expect(a).toBe(b);
    expect(built).toEqual(["Db"]);
  });

  it("keeps two portals from ever sharing a scoped instance", () => {
    const { Db } = counted();
    const plan = compile({ db: Db });

    const first = new Portal({ plan });
    const second = new Portal({ plan });

    // Same plan, different portals. The plan is the shared thing; the
    // instances are not. Two requests through the same route must never
    // land on the same object.
    expect(first.resolve("db")).not.toBe(second.resolve("db"));
  });

  it("gives every portal its own address", () => {
    const plan = compile({});
    expect(new Portal({ plan }).address).not.toBe(new Portal({ plan }).address);
  });

  it("resolves a global token on the root, and only once", () => {
    const built: string[] = [];
    class Pool extends Global() {
      constructor() { super(); built.push("Pool"); }
    }

    const plan = compile({ pool: Pool });
    const root = new Portal({ plan });
    const childA = root.fork(plan);
    const childB = root.fork(plan);

    expect(childA.resolve("pool")).toBe(childB.resolve("pool"));
    expect(built).toEqual(["Pool"]);
  });

  it("disposes in reverse construction order", async () => {
    const { disposed, Db, Repo } = counted();
    const portal = new Portal({ plan: compile({ db: Db, repo: Repo }) });

    portal.resolve("db");
    portal.resolve("repo");

    await portal.dispose();

    // Repo was built last, so it is torn down first — whatever was built
    // later may still be holding what came before it.
    expect(disposed).toEqual(["Repo", "Db"]);
  });

  it("disposes only what it built, never what it borrowed", async () => {
    const disposed: string[] = [];

    class Pool extends Global() {
      async onDispose() { disposed.push("Pool"); }
    }
    class Scoped {
      async onDispose() { disposed.push("Scoped"); }
    }

    const plan = compile({ pool: Pool, scoped: Scoped });
    const root = new Portal({ plan });
    const child = root.fork(plan);

    child.resolve("pool");
    child.resolve("scoped");

    await child.dispose();

    // The root still holds the pool. A child disposing it would be a
    // use-after-dispose for every other request on the same process.
    expect(disposed).toEqual(["Scoped"]);

    await root.dispose();
    expect(disposed).toEqual(["Scoped", "Pool"]);
  });

  it("collects disposal errors instead of throwing or swallowing them", async () => {
    class Bad {
      async onDispose() { throw new Error("boom"); }
    }
    class Good {
      disposedOk = false;
      async onDispose() { this.disposedOk = true; }
    }

    const portal = new Portal({ plan: compile({ good: Good, bad: Bad }) });
    const good = portal.resolve<Good>("good");
    portal.resolve("bad");

    const errors = await portal.dispose();

    expect(errors).toHaveLength(1);
    // The failure did not abort the rest of the teardown.
    expect(good.disposedOk).toBe(true);
  });

  it("refuses to resolve after disposal", async () => {
    const { Db } = counted();
    const portal = new Portal({ plan: compile({ db: Db }) });

    await portal.dispose();

    expect(() => portal.resolve("db")).toThrow(/after dispose/);
  });
});
