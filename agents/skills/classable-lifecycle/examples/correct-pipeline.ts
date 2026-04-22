/**
 * ✅ Correct: Full lifecycle pipeline — Guards, Pipes, Interceptors, Filters.
 */
import { Lifecycle, Injectable } from "@ecosy/classable";

// --- Guard: checks if the request can proceed ---

class AuthGuard {
  canActivate(ctx: unknown): boolean {
    const request = ctx as { user?: { role: string } };
    return request.user?.role === "admin";
  }
}

// --- Pipe: transforms input before handler ---

class ValidationPipe {
  transform(value: unknown, _ctx: unknown): unknown {
    const input = value as { name?: string; email?: string };

    if (!input.name || input.name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }
    if (!input.email || !input.email.includes("@")) {
      throw new Error("Invalid email address");
    }

    // Return sanitized input
    return {
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
    };
  }
}

// --- Interceptor: wraps handler execution (timing, logging) ---

class TimingInterceptor {
  async intercept(ctx: unknown, next: () => Promise<unknown>): Promise<unknown> {
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;
    console.log(`[Timing] Handler completed in ${ms}ms`);
    return result;
  }
}

class LoggingInterceptor {
  async intercept(ctx: unknown, next: () => Promise<unknown>): Promise<unknown> {
    console.log("[Log] Before handler");
    const result = await next();
    console.log("[Log] After handler, result:", result);
    return result;
  }
}

// --- Filter: transforms output or catches errors ---

class ResponseFilter {
  transform(result: unknown, _ctx: unknown): unknown {
    // Wrap all responses in a standard envelope
    return { success: true, data: result, timestamp: Date.now() };
  }

  catch(error: unknown, _ctx: unknown): unknown {
    // Wrap errors in a standard envelope
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, timestamp: Date.now() };
  }
}

// --- Handler: the actual business logic ---

class Database {
  async insert(data: { name: string; email: string }) {
    return { id: "generated-uuid", ...data };
  }
}

class CreateUserHandler extends Lifecycle({
  // Dependencies go inside `injects`
  injects: { db: Database },
  // Pipeline hooks go at the top level
  guards: [AuthGuard],
  pipes: [ValidationPipe],
  interceptors: [TimingInterceptor, LoggingInterceptor],
  filters: [ResponseFilter],
}) {
  // The handler method — called after guards pass and pipes transform input
  async execute(input: { name: string; email: string }) {
    return this.db.insert(input);
  }
}

// --- Execute through the pipeline ---
// (Normally done via Executor.lifecycle(CreateUserHandler, args))
//
// Flow:
// 1. AuthGuard.canActivate(ctx) → must return true
// 2. ValidationPipe.transform(args[0]) → sanitizes input
// 3. LoggingInterceptor wraps TimingInterceptor wraps handler
// 4. CreateUserHandler.execute(sanitizedInput) → returns result
// 5. ResponseFilter.transform(result) → wraps in { success, data }
//
// If any stage throws:
// → ResponseFilter.catch(error) → wraps in { success: false, error }
