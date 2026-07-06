/**
 * frontend/src/lib/sentry.tsx
 *
 * Sentry error tracking setup. Activates only if VITE_SENTRY_DSN is
 * set in the build environment. Otherwise this is a no-op.
 *
 * To enable:
 *   1. Create a free Sentry project at https://sentry.io
 *   2. Copy the DSN from Project Settings → Client Keys
 *   3. Set VITE_SENTRY_DSN in your .env.production:
 *        VITE_SENTRY_DSN=https://...@sentry.io/12345
 *   4. Optionally set VITE_SENTRY_ENVIRONMENT (production / staging / ...)
 *      and VITE_SENTRY_RELEASE (e.g. the git SHA)
 *
 * Install: pnpm add @sentry/react
 *
 * TODO(observability): The dynamic imports below are currently commented
 * out because @sentry/react is not in package.json. Until you add the
 * dependency, initSentry() is a no-op (it returns null and getSentry()
 * falls back to the no-op shim). The public API of this module is
 * intentionally stable so main.tsx and downstream callers don't need to
 * change when you wire Sentry back up.
 *
 * Captures:
 *   - Uncaught exceptions (window.onerror)
 *   - Unhandled promise rejections
 *   - React component errors via <Sentry.ErrorBoundary>
 *   - Router navigation errors (since react-router 6+)
 *   - Console errors of severity "error"
 *
 * Does NOT capture:
 *   - User input / form data (PII)
 *   - Auth tokens (we explicitly scrub Authorization headers)
 */
import React from "react";

export interface SentryLike {
  captureException: (err: unknown, ctx?: unknown) => void;
  captureMessage:   (msg: string, ctx?: unknown) => void;
  setUser:         (user: { id: string; email?: string } | null) => void;
  setTag:          (key: string, value: string) => void;
  setExtra:        (key: string, value: unknown) => void;
  addBreadcrumb:   (crumb: { message: string; category?: string; level?: string; data?: unknown }) => void;
  // Present when the real @sentry/react package has been initialised;
  // used by SentryErrorBoundary to render the official boundary if
  // available, otherwise we fall back to DefaultErrorBoundary.
  ErrorBoundary?:   React.ComponentType<{ children: React.ReactNode }>;
}

const sentryInstance: SentryLike | null = null;

/**
 * Initialize Sentry. Called from main.tsx before React renders.
 * No-op if VITE_SENTRY_DSN is not set.
 */
export async function initSentry(): Promise<SentryLike | null> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured — error tracking disabled
    return null;
  }

  try {
    // Dynamic import so the bundle doesn't include Sentry unless
    // there's a DSN. Keeps dev builds small.
    //
    // TODO(observability): re-enable these imports after running
    //   npm install @sentry/react @sentry/tracing
    // (or the v8+ equivalents). Until then the body of the try is
    // commented out and initSentry() returns null.
    // const Sentry = await import("@sentry/react");
    // // Note: Sentry v8+ ships BrowserTracing from "@sentry/react", not the
    // // standalone "@sentry/tracing" package. Adjust the import below if
    // // you bump versions.
    // const { BrowserTracing } = await import("@sentry/tracing");
    //
    // Sentry.init({
    //   dsn,
    //   environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || "production",
    //   release: (import.meta.env.VITE_SENTRY_RELEASE as string) || undefined,
    //   tracesSampleRate: 0.1, // 10% of navigations
    //   integrations: [new BrowserTracing()],
    //   beforeSend(event) {
    //     // Scrub PII from error reports
    //     if (event.request) {
    //       const reqHeaders = event.request.headers ?? {};
    //       if (reqHeaders.Authorization) reqHeaders.Authorization = "[redacted]";
    //     }
    //     return event;
    //   },
    // });
    //
    // sentryInstance = {
    //   captureException: Sentry.captureException,
    //   captureMessage:   Sentry.captureMessage,
    //   setUser:         Sentry.setUser,
    //   setTag:          Sentry.setTag,
    //   setExtra:        Sentry.setExtra,
    //   addBreadcrumb:   Sentry.addBreadcrumb,
    //   ErrorBoundary:   Sentry.ErrorBoundary,
    // };
    //
    // return sentryInstance;

    // Sentry not installed yet — silently no-op so callers get null.
    void dsn;
    return null;
  } catch (err) {
    // Sentry failed to load — log and continue without it
    console.error("[Sentry] init failed:", err);
    return null;
  }
}

/** Returns the active Sentry instance, or a no-op shim. */
export function getSentry(): SentryLike {
  if (sentryInstance) return sentryInstance;
  return {
    captureException: () => {}, /* no-op — avoids recursion with wrapped console.error */
    captureMessage:   () => {},
    setUser:         () => {},
    setTag:           () => {},
    setExtra:         () => {},
    addBreadcrumb:   () => {},
  };
}

/**
 * React error boundary that reports errors to Sentry. Use as a
 * top-level wrapper around <App /> in main.tsx.
 *
 * At module load, sentryInstance is null (initSentry runs later in
 * main.tsx), so this resolves to DefaultErrorBoundary. After
 * initSentry() succeeds, the Sentry-provided boundary takes over.
 *
 * Note: the fallback is wrapped in a thin component rather than
 * referenced directly, because at module-init time sentryInstance is
 * still null AND the DefaultErrorBoundary class declaration below
 * hasn't run yet. Eagerly evaluating `?? DefaultErrorBoundary` would
 * hit a temporal dead-zone ReferenceError. The component wrapper
 * defers the lookup to render time, after both have been initialised.
 */
function SentryErrorBoundaryImpl({ children }: { children: React.ReactNode }) {
  const Boundary = (sentryInstance as any)?.ErrorBoundary ?? DefaultErrorBoundary;
  return <Boundary>{children}</Boundary>;
}
export const SentryErrorBoundary = SentryErrorBoundaryImpl;

class DefaultErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) {
    getSentry().captureException(err);
    console.error("[ErrorBoundary]", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page or contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
