---
name: classable-lifecycle
description: Skill for implementing request/command processing pipelines using Lifecycle. Call this skill when building handler classes with Guards, Pipes, Interceptors, and Filters — following the NestJS-inspired pipeline pattern.
---

# Lifecycle — Request Processing Pipeline

<instructions>
  <rule>
    <title>Extend Lifecycle() for pipeline-enabled handlers</title>
    <details>
      `Lifecycle(injects)` extends Injectable with a `static descriptor` field. The descriptor declares the pipeline stages: `guards` (fail-fast), `pipes` (transform input), `interceptors` (wrap execution), `filters` (transform output / catch errors). Each stage is an array of class references.
    </details>
  </rule>
  <rule>
    <title>Implement the correct interface for each stage</title>
    <details>
      - **Guard**: `canActivate(ctx: unknown): boolean | Promise&lt;boolean&gt;` — return false to reject
      - **Pipe**: `transform(value: unknown, ctx: unknown): unknown` — transform input args[0]
      - **Interceptor**: `intercept(ctx: unknown, next: () => Promise&lt;unknown&gt;): unknown` — wrap the handler
      - **Filter**: `transform?(result, ctx)` for success, `catch?(error, ctx)` for errors
    </details>
  </rule>
  <rule>
    <title>Handler must have run() or execute()</title>
    <details>
      The Lifecycle executor looks for `run()` first, then `execute()` on the handler instance. The method receives the (potentially transformed) arguments. Return value passes through filters.
    </details>
  </rule>
  <rule>
    <title>Pipeline execution order</title>
    <details>
      Guards run first (all must pass). Pipes transform `args[0]` sequentially. Interceptors wrap the handler in an onion pattern (last interceptor is innermost). Filters run on the result (or on errors if `.catch()` is defined). Last-filter-wins for errors.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Full lifecycle pipeline with all stages</description>
    <reference_path>./examples/correct-pipeline.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common lifecycle mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
