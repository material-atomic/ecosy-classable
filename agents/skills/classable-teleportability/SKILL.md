---
name: classable-teleportability
description: Skill for registering global singleton containers using Teleportability. Call this skill when setting up shared dependency containers, application bootstrapping, or cross-module singleton management.
---

# Teleportability — Global Singleton Registry

<instructions>
  <rule>
    <title>Always use Symbol keys</title>
    <details>
      `Teleportability({ key, injects })` registers an Injectable at a global key on `globalThis` (default). Always use `Symbol.for("pkg:name")` to avoid key collisions across packages. String keys are error-prone in shared environments.
    </details>
  </rule>
  <rule>
    <title>First-write-wins registration</title>
    <details>
      The first `Teleportability()` call for a given key installs the container. Subsequent calls with the same key return the existing container. The `injects` from later calls are ignored. This is by design — declare all base dependencies in one place.
    </details>
  </rule>
  <rule>
    <title>Late-binding with inject()</title>
    <details>
      Use `Container.inject({ key: Class })` to push additional dependencies BEFORE the first `get()` or `instance` access. The Injectable constructor reads from the same mutable object, so late-bound tokens are visible at construction time. Calling `inject()` AFTER construction has no effect on existing instances.
    </details>
  </rule>
  <rule>
    <title>Lazy construction</title>
    <details>
      The container is not constructed until the first `get()` or `instance` access. This means `inject()` calls between registration and first access are all captured. After first access, the instances are cached.
    </details>
  </rule>
  <rule>
    <title>Cleanup with dispose()</title>
    <details>
      Call `Container.dispose()` to clear all cached instances and remove the registration from `globalThis`. The next `get()` call after dispose will re-construct everything. Essential for test isolation.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Application container with late-binding</description>
    <reference_path>./examples/correct-app-container.ts</reference_path>
  </example>
  <example>
    <description>Correct: Real-world pattern from @ecosy/markdoc</description>
    <reference_path>./examples/correct-markdoc-pattern.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common Teleportability mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
