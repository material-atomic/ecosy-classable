import { describe, it, expect, afterEach } from "vitest";
import { Teleportability } from "../src/index";

// Use unique keys to avoid cross-test contamination
let keyCounter = 0;
function uniqueKey() {
  return Symbol.for(`test:teleport:${++keyCounter}:${Math.random()}`);
}

// ─── Basic container ─────────────────────────────────────────────

describe("Teleportability — basic", () => {
  it("creates a container and resolves instances", () => {
    class Logger { log() { return "ok"; } }
    const key = uniqueKey();

    const container = Teleportability({
      key,
      injects: { logger: Logger },
    });

    const logger = container.get<Logger>("logger");
    expect(logger).toBeInstanceOf(Logger);
    expect(logger.log()).toBe("ok");

    container.dispose();
  });

  it("returns same instance on repeated get()", () => {
    class DB { query() { return []; } }
    const key = uniqueKey();

    const container = Teleportability({ key, injects: { db: DB } });

    const db1 = container.get("db");
    const db2 = container.get("db");
    expect(db1).toBe(db2);

    container.dispose();
  });

  it("exposes all instances via .instance", () => {
    class A { a = 1; }
    class B { b = 2; }
    const key = uniqueKey();

    const container = Teleportability({ key, injects: { a: A, b: B } });
    const inst = container.instance;

    expect((inst as any).a).toBeInstanceOf(A);
    expect((inst as any).b).toBeInstanceOf(B);

    container.dispose();
  });
});

// ─── inject() late-binding ───────────────────────────────────────

describe("Teleportability — inject()", () => {
  it("inject() adds deps before first access", () => {
    class Logger { log() { return "ok"; } }
    const key = uniqueKey();

    const container = Teleportability({ key, injects: {} });
    container.inject({ logger: Logger });

    const logger = container.get<Logger>("logger");
    expect(logger).toBeInstanceOf(Logger);

    container.dispose();
  });
});

// ─── dispose() ───────────────────────────────────────────────────

describe("Teleportability — dispose()", () => {
  it("dispose() allows re-construction on next access", () => {
    let constructCount = 0;
    class Counter {
      constructor() { constructCount++; }
    }
    const key = uniqueKey();

    const container = Teleportability({ key, injects: { counter: Counter } });

    container.get("counter");
    expect(constructCount).toBe(1);

    container.dispose();

    // After dispose, next access re-constructs
    container.get("counter");
    expect(constructCount).toBe(2);

    container.dispose();
  });
});

// ─── First-write-wins ────────────────────────────────────────────

describe("Teleportability — first-write-wins", () => {
  it("second Teleportability with same key shares the same runtime", () => {
    class A { name = "A"; }
    class B { name = "B"; }
    const key = uniqueKey();

    const first = Teleportability({ key, injects: { a: A } });
    const second = Teleportability({ key, injects: { b: B } });

    // Different wrapper classes, but same underlying runtime —
    // first's injects are used (first-write-wins at runtime level)
    const inst1 = first.get("a");
    const inst2 = second.get("a");
    expect(inst1).toBe(inst2); // same resolved instance

    first.dispose();
  });
});

// ─── Symbol key requirement ──────────────────────────────────────

describe("Teleportability — key type", () => {
  it("works with string keys (but not recommended)", () => {
    const key = `test:string:${Math.random()}` as any;

    const container = Teleportability({ key, injects: {} });
    expect(container).toBeDefined();

    container.dispose();
  });
});
