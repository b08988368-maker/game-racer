import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0D0E12] text-slate-100 p-6">
          <div className="max-w-md w-full bg-[#15171E] border border-white/10 rounded-xl p-6 space-y-4">
            <h1 className="font-display text-2xl font-bold text-amber-400">Session Interrupted</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Reload Game
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
