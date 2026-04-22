---
name: classable-inject
description: Skill for lazy constructor-time dependency resolution using createInject. Call this skill when wiring services that need to resolve dependencies from a Teleportability container via constructor default parameters.
---

# Inject — Lazy Constructor Resolution

<instructions>
  <rule>
    <title>Create with a getter function</title>
    <details>
      `createInject(() => Container)` returns an `Inject<T>(key)` function. The getter is a function (not a direct reference) so nothing is resolved at import time — resolution happens only when `Inject(key)` is called inside a constructor.
    </details>
  </rule>
  <rule>
    <title>Use in constructor default parameters</title>
    <details>
      The primary pattern is `constructor(private readonly dep = Inject<DepType>("key"))`. This ensures resolution happens at construction time within the correct Injectable scope. The scope stack handles nested Injectables correctly.
    </details>
  </rule>
  <rule>
    <title>Type the generic parameter</title>
    <details>
      Always specify the generic: `Inject<DatabaseLike>("db")`. Without it, the return type is `unknown`. Use interface contracts (e.g., `DatabaseLike`) rather than concrete classes for loose coupling.
    </details>
  </rule>
  <rule>
    <title>Scope-safe resolution</title>
    <details>
      During Injectable construction, `Inject` walks a scope stack from innermost to outermost scope. This means nested Injectables (e.g., `Fetchable extends Injectable({...})` inside a larger `Runtime extends Injectable({...})`) resolve dependencies from the correct scope automatically.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Service with Inject default parameters</description>
    <reference_path>./examples/correct-service.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common Inject mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
