import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErdErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error("ERD Error Boundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px",
          maxWidth: "600px",
          margin: "40px auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
        }}>
          <h2 style={{ color: "var(--danger)", marginBottom: "16px" }}>
            ERD Canvas Error
          </h2>
          <p style={{ marginBottom: "24px", color: "var(--fg)" }}>
            The ontology ERD encountered an unexpected error. You can try resetting the view or reloading the page.
          </p>
          
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "8px 16px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--fg)",
              }}
            >
              Reset View
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: "8px 16px",
                background: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--surface)",
              }}
            >
              Reload Page
            </button>
          </div>

          {process.env.NODE_ENV === "development" && this.state.error && (
            <details style={{ marginTop: "16px" }}>
              <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
                Error Details (Development)
              </summary>
              <pre style={{
                marginTop: "8px",
                padding: "12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "12px",
                overflow: "auto",
                maxHeight: "300px",
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
