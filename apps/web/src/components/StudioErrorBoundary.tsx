import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, Download } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ProcessForge Studio] Caught unhandled rendering error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  /** Saves the project that may be causing the crash, before anything clears it. */
  private handleDownload = () => {
    try {
      const raw = localStorage.getItem('pf_current_project');
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processforge-recovered-project.pfg.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  /**
   * Starts over without the current project. This used to delete it silently,
   * behind a button labelled "Return to Dashboard"; it now asks, and the
   * screen offers a download first.
   */
  private handleStartOver = () => {
    if (!window.confirm('Start over without this project? Download a copy first if you want to keep it.')) return;
    this.setState({ hasError: false, error: null });
    try {
      localStorage.removeItem('pf_current_project');
    } catch {}
    window.location.href = window.location.pathname;
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#11221c',
            color: '#f6f5dd',
            fontFamily: "'Inter', sans-serif",
            padding: 24,
            boxSizing: 'border-box',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              maxWidth: 580,
              width: '100%',
              backgroundColor: '#16241f',
              border: '1px solid #e5c736',
              borderRadius: 8,
              padding: 28,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(229, 199, 54, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'rgba(229, 199, 54, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e5c736'
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
              Studio Interface Recovery
            </h2>

            <p style={{ margin: 0, fontSize: 13, color: '#c1c497', lineHeight: 1.5 }}>
              ProcessForge encountered an unexpected error while rendering the interactive studio canvas.
            </p>

            {this.state.error && (
              <div
                style={{
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: '#111c18',
                  border: '1px solid #253c33',
                  borderRadius: 6,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#ff7b72',
                  overflowX: 'auto',
                  maxHeight: 120,
                  boxSizing: 'border-box'
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={this.handleDownload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 2,
                  backgroundColor: '#549e6a',
                  color: '#111c18',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Download size={15} />
                Download the project
              </button>

              <button
                onClick={this.handleStartOver}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 4,
                  backgroundColor: '#1d2f28',
                  color: '#f6f5dd',
                  border: '1px solid #253c33',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Home size={15} />
                Start over
              </button>

              <button
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 4,
                  backgroundColor: '#1d2f28',
                  color: '#f6f5dd',
                  border: '1px solid #253c33',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={14} />
                Reload the app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
