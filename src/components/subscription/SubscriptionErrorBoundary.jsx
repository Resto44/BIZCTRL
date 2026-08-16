import React from 'react';

export default class SubscriptionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics limited to the browser console; do not expose stack traces
    // or subscription/payment data in the rendered UI.
    console.error('[SubscriptionErrorBoundary]', error, info);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  navigateBack = () => {
    if (this.props.onNavigateBack) {
      this.props.onNavigateBack();
      return;
    }
    window.location.assign('/dashboard');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-xl border border-rose-300 bg-rose-50 p-8 text-center text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
        <h2 className="text-lg font-semibold">Subscription error</h2>
        <p className="max-w-lg text-sm">We could not load the subscription area. Retry the request or return to the ERP.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={this.retry}>Retry</button>
          <button type="button" className="rounded-md border border-current px-4 py-2 text-sm font-medium" onClick={this.navigateBack}>Back to ERP</button>
        </div>
      </div>
    );
  }
}
