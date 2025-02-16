import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class VizErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Visualization error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: '#fff3f3',
                    borderRadius: '8px',
                    margin: '20px'
                }}>
                    <h2>Visualization Error</h2>
                    <p>The visualization became too complex to render.</p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false });
                            this.props.onReset?.();
                        }}
                        style={{
                            padding: '10px 20px',
                            margin: '10px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#007bff',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Try Again with Fewer Items
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
} 