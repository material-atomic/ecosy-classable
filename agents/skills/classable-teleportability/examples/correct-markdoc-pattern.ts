/**
 * ✅ Correct: Real-world pattern from @ecosy/markdoc.
 *
 * Shows the complete wiring: Teleportability → Executable → createInject,
 * then services using Inject in constructor defaults.
 */
import { Teleportability, Executable, createInject } from "@ecosy/classable";

// --- 1. Register the global container ---

export const MarkdocTeleport = Teleportability({
  key: Symbol.for("@ecosy/markdoc:container"),
  injects: {},
});

// --- 2. Create Executor backed by the container ---

export const Executor = Executable(MarkdocTeleport);

// --- 3. Create Inject function for constructor default params ---

export const Inject = createInject(() => MarkdocTeleport);

// --- 4. Define interfaces for loose coupling ---

interface ConfigurationLike {
  readonly options: { dir: string; branch: string };
}

interface FetchableLike {
  readonly http: { get<T>(url: string): Promise<T> };
}

// --- 5. Services use Inject in constructor defaults ---

class Server {
  constructor(
    private readonly config = Inject<ConfigurationLike>("configuration"),
    private readonly fetchable = Inject<FetchableLike>("fetchable"),
  ) {}

  async fetch(request: Request): Promise<Response> {
    const dir = this.config.options.dir;
    // Use fetchable to load content from CDN...
    return new Response(`Serving from ${dir}`);
  }
}

// --- 6. Bootstrap: inject all deps, then use ---

// In the actual app, `Runtimable(options)` calls Injectable() with
// all the deps and registers them. Services resolve via Inject.
