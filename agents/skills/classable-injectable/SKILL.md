---
name: classable-injectable
description: Skill for creating dependency containers using Injectable factory. Call this skill when declaring classes that need automatic dependency resolution, building service layers, or wiring multiple classes together.
---

# Injectable — Dependency Container Factory

<instructions>
  <rule>
    <title>Use Injectable() to declare dependencies</title>
    <details>
      `Injectable(injects)` takes an `InjectMap` — a record mapping string keys to class constructors or factory descriptors `{ target, get }`. It returns a class that automatically resolves all dependencies at construction time. Resolved instances are available as `this.key` on the resulting class.
    </details>
  </rule>
  <rule>
    <title>Factory descriptors for parameterized construction</title>
    <details>
      When a dependency needs constructor arguments, use `{ target: ClassName, get: (runtime) => [arg1, arg2] }`. The `get` function receives the runtime context (if any) and returns an array of constructor arguments. The `target` is the class to instantiate.
    </details>
  </rule>
  <rule>
    <title>Order-independent resolution</title>
    <details>
      Dependencies are resolved lazily — order of declaration in the inject map does not matter. If dependency A needs B, and B is declared after A, it still works. Circular dependencies are detected and throw a clear error.
    </details>
  </rule>
  <rule>
    <title>Reconciliation on re-construction</title>
    <details>
      When a class produced by `Injectable` is constructed multiple times, it reconciles: if the previous instance of a dependency has the same constructor (same class identity), it is reused rather than re-created. This is the static `__instances` Map on the generated class.
    </details>
  </rule>
  <rule>
    <title>Lifecycle hooks</title>
    <details>
      The generated class supports two optional lifecycle methods: `onInit()` (called after all dependencies are resolved) and `onDispose()` (called when the container is torn down). Implement these as methods on your class.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Basic dependency injection with plain classes</description>
    <reference_path>./examples/correct-basic.ts</reference_path>
  </example>
  <example>
    <description>Correct: Factory descriptors with constructor arguments</description>
    <reference_path>./examples/correct-factory.ts</reference_path>
  </example>
  <example>
    <description>Correct: Nested Injectable (Injectable inside Injectable)</description>
    <reference_path>./examples/correct-nested.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common mistakes to avoid</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
