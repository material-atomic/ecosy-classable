---
name: classable-placeholder
description: Skill for creating null-object implementations using Placeholder. Call this skill when providing safe default/fallback dependencies, implementing optional services, or creating test stubs.
---

# Placeholder — Null Object Pattern

<instructions>
  <rule>
    <title>Placeholder class for safe fallbacks</title>
    <details>
      `Placeholder` is a class whose instances absorb all property accesses and method calls silently, returning `undefined`. It never throws, making it safe to use as a default when a real implementation is unavailable.
    </details>
  </rule>
  <rule>
    <title>Use `placeholder` descriptor for optional dependencies</title>
    <details>
      When a dependency is optional (e.g., analytics, caching, telemetry), use the `placeholder` factory descriptor as the default value in the inject map. The `placeholder` constant is a frozen `ClassFactory` that resolves to a `Placeholder` instance via `Placeholder.getInstance()`. If the real implementation is not provided, the placeholder absorbs all calls silently.
    </details>
  </rule>
  <rule>
    <title>placeholder vs placeholderInstance</title>
    <details>
      `placeholder` is a `ClassFactory` descriptor (for use in inject maps). `placeholderInstance` is an `InstanceByStatic` descriptor (for use with selector-based resolution). Both resolve to a `Placeholder` instance. Use `new Placeholder()` directly when you need a standalone null object.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Optional dependency with placeholder fallback</description>
    <reference_path>./examples/correct-optional.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Using null instead of Placeholder</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
