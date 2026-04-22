---
name: classable-global-transient
description: Skill for controlling dependency lifecycle scope with Global and Transient markers. Call this skill when deciding whether a dependency should be a singleton or created fresh per request/call.
---

# Global & Transient — Scope Markers

<instructions>
  <rule>
    <title>Global for singletons</title>
    <details>
      `Global({ target: ClassName })` marks a class as singleton-scoped. When resolved by Injectable or Executable, the instance is cached and reused across all constructions. Useful for database pools, configuration, loggers — anything expensive to create or that must share state.
    </details>
  </rule>
  <rule>
    <title>Transient for per-request</title>
    <details>
      `Transient({ target: ClassName })` marks a class as transient-scoped. A fresh instance is created every time it's resolved. Useful for request handlers, validators, or anything that holds request-specific state.
    </details>
  </rule>
  <rule>
    <title>Static __global flag</title>
    <details>
      Both markers set `__global: true` or `__global: false` on the class static. Executable checks this flag to decide cache vs fresh-create. You can also set it manually: `static __global = true;` on your class.
    </details>
  </rule>
  <rule>
    <title>Be explicit about scope</title>
    <details>
      Always declare scope for services that have side effects or hold state. A class without a scope marker defaults to transient in Executable (created fresh per run()). For clarity, mark it explicitly.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Global and Transient scope usage</description>
    <reference_path>./examples/correct-scopes.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Scope-related mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
