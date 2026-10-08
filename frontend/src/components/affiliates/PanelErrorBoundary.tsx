import React from 'react';

/**
 * Scoped error boundary for one panel of a larger page.
 *
 * Affiliate Control hosts four independent panels. Without this, a single
 * unexpected payload shape in any one of them unmounts the whole page and the
 * admin loses access to all of it. Each panel is wrapped so a failure degrades
 * to an inline notice and the rest of the page stays usable.
 */
interface Props {
  children: React.ReactNode;
  label: string;
}

interface State {
  error: Error | null;
}

class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[PanelErrorBoundary:${this.props.label}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-red-700">
            {this.props.label} unavailable
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-red-700">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </section>
      );
    }
    return <>{this.props.children}</>;
  }
}

export default PanelErrorBoundary;