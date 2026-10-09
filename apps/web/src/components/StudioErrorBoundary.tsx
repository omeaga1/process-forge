import { Component, type ErrorInfo, type ReactNode } from 'react';
import { fontFamily } from '@process-forge/theme';
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
   * Starts over without the current project. It asks first, and the screen
   * offers a download of the project before that.
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
            backgroundColor: 'var(--pf-bg-canvas)',
            color: 'var(--pf-text-primary)',
            fontFamily: fontFamily.sans,
            padding: 24,
            boxSizing: 'border-box',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              maxWidth: 580,
              width: '100%',
              backgroundColor: 'var(--pf-bg-surface)',
              border: '1px solid var(--pf-status-blocked)',
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
                backgroundColor: 'color-mix(in srgb, var(--pf-status-blocked) 15%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--pf-status-blocked)'
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
              Studio Interface Recovery
            </h2>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--pf-text-secondary)', lineHeight: 1.5 }}>
              ProcessForge encountered an unexpected error while rendering the interactive studio canvas.
            </p>

            {this.state.error && (
              <div
                style={{
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: 'var(--pf-bg-base)',
                  border: '1px solid var(--pf-border-default)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontFamily: fontFamily.mono,
                  color: 'var(--pf-status-failed)',
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
                  backgroundColor: 'var(--pf-jade-500)',
                  color: 'var(--pf-text-inverse)',
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
                  backgroundColor: 'var(--pf-bg-surface-elevated)',
                  color: 'var(--pf-text-primary)',
                  border: '1px solid var(--pf-border-default)',
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
                  backgroundColor: 'var(--pf-bg-surface-elevated)',
                  color: 'var(--pf-text-primary)',
                  border: '1px solid var(--pf-border-default)',
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
