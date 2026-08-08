import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Injectable so tests can assert what was reported without touching the console. */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly message: string | null;
}

/**
 * Catches render-time failures so a desktop window never goes blank.
 *
 * A crashed webview in a desktop app is worse than in a browser: there is no address bar
 * to reload from and no tab to close, so the app must always render *something* with a way
 * back.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.message === null) {
      return this.props.children;
    }
    return (
      <section role="alert">
        <h1>Something went wrong</h1>
        <p className="error">{this.state.message}</p>
        <button type="button" onClick={() => this.setState({ message: null })}>
          Try again
        </button>
      </section>
    );
  }
}
