---
name: classable-executable
description: Skill for using Executable as a Teleport-backed dependency executor. Call this skill when running functions with auto-resolved dependencies, executing lifecycle pipelines, or migrating from the static Executor class.
---

# Executable — Teleport-Backed Executor

<instructions>
  <rule>
    <title>Create from a Teleportability container</title>
    <details>
      `Executable(TeleportClass)` takes a Teleportability container and returns an executor. The executor uses the container as its global dependency pool. Dependencies marked `__global: true` must be declared in the container's injects.
    </details>
  </rule>
  <rule>
    <title>run() for function execution</title>
    <details>
      `Executor.run(fn, deps)` resolves each dep in the `deps` array, then calls `fn` with the resolved instances. Global deps come from the container; transient deps are created fresh per call and discarded after.
    </details>
  </rule>
  <rule>
    <title>lifecycle() for pipeline execution</title>
    <details>
      `Executor.lifecycle(Handler, args)` runs a class through the full lifecycle pipeline: Guards → Pipes → Interceptors → Handler.execute() → Filters. The Handler class must have a `static descriptor` with the pipeline configuration and a `run()` or `execute()` method.
    </details>
  </rule>
  <rule>
    <title>Lazy initialization</title>
    <details>
      The container is instantiated lazily on first `run()` or `lifecycle()` call. Use `clearGlobals()` to reset for tests.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Executable with run() and lifecycle()</description>
    <reference_path>./examples/correct-executor.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common Executable mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
