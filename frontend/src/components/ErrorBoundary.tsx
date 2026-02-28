import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <h2>Something went wrong</h2>
          <pre style={{ background: '#f5f5f5', padding: '1rem', overflow: 'auto', fontSize: '0.9rem' }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="primary"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
