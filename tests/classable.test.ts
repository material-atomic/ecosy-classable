import { describe, it, expect } from "vitest";
import {
  classable,
  Placeholder,
  placeholder,
  placeholderInstance,
} from "../src/index";

// ─── Fixtures ────────────────────────────────────────────────────

class Dog {
  name = "Rex";
}

class Cat {
  constructor(public sound: string) {}
}

class WithGetter {
  static create(name: string) {
    const instance = new WithGetter();
    instance.name = name;
    return instance;
  }
  name = "";
}

// ─── classable.is ────────────────────────────────────────────────

describe("classable.is", () => {
  it("returns true for a class constructor", () => {
    expect(classable.is(Dog)).toBe(true);
  });

  it("returns false for a plain object", () => {
    expect(classable.is({ target: Dog })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(classable.is(null)).toBe(false);
    expect(classable.is(undefined)).toBe(false);
  });
});

// ─── classable.isFactory ─────────────────────────────────────────

describe("classable.isFactory", () => {
  it("returns true for a factory descriptor", () => {
    expect(classable.isFactory({ target: Dog, get: () => [] })).toBe(true);
  });

  it("returns false for a descriptor without get", () => {
    // isFactory requires both `target` AND `get` (a function)
    expect(classable.isFactory({ target: Dog })).toBe(false);
  });

  it("returns false for a class", () => {
    expect(classable.isFactory(Dog)).toBe(false);
  });

  it("returns false for a plain object without target", () => {
    expect(classable.isFactory({ foo: "bar" })).toBe(false);
  });
});

// ─── classable.create ────────────────────────────────────────────

describe("classable.create", () => {
  it("creates an instance from a plain class", () => {
    const dog = classable.create(Dog);
    expect(dog).toBeInstanceOf(Dog);
    expect(dog.name).toBe("Rex");
  });

  it("creates an instance from a factory descriptor", () => {
    const cat = classable.create({
      target: Cat,
      get: () => ["meow"] as [string],
    });
    expect(cat).toBeInstanceOf(Cat);
    expect(cat.sound).toBe("meow");
  });

  it("creates an instance via static getter", () => {
    const instance = classable.create({
      target: WithGetter as any,
      get: () => ["Buddy"] as [string],
      getter: "create",
    });
    expect(instance.name).toBe("Buddy");
  });

  it("creates from factory with get (zero-arg)", () => {
    const dog = classable.create({ target: Dog, get: () => [] as [] });
    expect(dog).toBeInstanceOf(Dog);
  });
});

// ─── classable.toFactory ─────────────────────────────────────────

describe("classable.toFactory", () => {
  it("wraps a class into a factory descriptor", () => {
    const factory = classable.toFactory(Dog);
    expect(factory).toHaveProperty("target", Dog);
  });

  it("returns a factory as-is", () => {
    const original = { target: Dog, get: () => [] as const };
    const result = classable.toFactory(original as any);
    expect(result).toBe(original);
  });
});

// ─── classable.getTarget ─────────────────────────────────────────

describe("classable.getTarget", () => {
  it("returns the class from a plain constructor", () => {
    expect(classable.getTarget(Dog as any)).toBe(Dog);
  });

  it("extracts target from a factory descriptor", () => {
    expect(classable.getTarget({ target: Cat } as any)).toBe(Cat);
  });
});

// ─── classable.withFactory ───────────────────────────────────────

describe("classable.withFactory", () => {
  it("replaces the resolver while keeping the target", () => {
    const factory = classable.withFactory(Cat as any, () => ["purr"] as [string]);
    expect(factory.target).toBe(Cat);
    const cat = classable.create(factory as any);
    expect(cat.sound).toBe("purr");
  });
});

// ─── classable.wrap ──────────────────────────────────────────────

describe("classable.wrap", () => {
  it("applies a wrapper to a plain class", () => {
    const wrapped = classable.wrap(Dog, (Base) => {
      return class extends Base {
        breed = "Labrador";
      } as any;
    });
    const instance = classable.create(wrapped as any);
    expect(instance.name).toBe("Rex");
    expect((instance as any).breed).toBe("Labrador");
  });
});

// ─── classable.getDescriptor ─────────────────────────────────────

describe("classable.getDescriptor", () => {
  it("returns type and target name for a class", () => {
    const desc = classable.getDescriptor(Dog as any);
    expect(desc.type).toBe("class");
    expect(desc.target).toBe("Dog"); // returns class name, not class ref
  });

  it("returns type and target name for a factory (resolver)", () => {
    const desc = classable.getDescriptor({ target: Cat, get: () => ["x"] } as any);
    expect(desc.type).toBe("resolver"); // "resolver", not "factory"
    expect(desc.target).toBe("Cat"); // returns class name
  });
});

// ─── classable.from (InstanceByStatic) ───────────────────────────

describe("classable.from", () => {
  it("creates via Placeholder's InstanceByStatic", () => {
    const instance = classable.from(placeholderInstance);
    expect(instance).toBeInstanceOf(Placeholder);
  });
});

// ─── classable.select ────────────────────────────────────────────

describe("classable.select", () => {
  it("binds a selector function and resolves", () => {
    const finder = classable.select((...classes: any[]) => {
      return [classes[0], [] as const] as [any, []];
    });
    const [chosen, args] = finder(Dog as any, Cat as any);
    expect(chosen).toBe(Dog);
  });
});
