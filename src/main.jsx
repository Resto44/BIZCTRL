import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import '@/styles/responsive-performance.css';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[GlobalErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem', maxWidth: '400px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            style={{ padding: '0.5rem 1.5rem', background: '#1d4ed8', color: '#fff', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload App
          </button>
          <a href="mailto:support@mybizctrl.site" style={{ marginTop: '1rem', color: '#1d4ed8', fontWeight: 600 }}>
            Contact support
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

// Keep the browser document fixed while allowing the ERP's internal content
// viewport to scroll and receive normal touch/click interaction on iOS Safari.
function installFixedAppViewportGuards() {
  if (typeof document === 'undefined') return undefined;

  const root = document.documentElement;
  const body = document.body;
  const listeners = [
    ['gesturestart', (event) => event.preventDefault()],
    ['gesturechange', (event) => event.preventDefault()],
    ['gestureend', (event) => event.preventDefault()],
    ['touchforcechange', (event) => event.preventDefault()],
  ];

  let lastTouchEnd = 0;
  const preventDoubleTap = (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  };

  const previous = {
    htmlOverflow: root.style.overflow,
    bodyOverflow: body.style.overflow,
    htmlPosition: root.style.position,
    bodyPosition: body.style.position,
    htmlTouchAction: root.style.touchAction,
    bodyTouchAction: body.style.touchAction,
  };

  root.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  root.style.position = 'fixed';
  body.style.position = 'fixed';
  root.style.inset = '0';
  body.style.inset = '0';
  root.style.width = '100%';
  body.style.width = '100%';
  root.style.height = '100dvh';
  body.style.height = '100dvh';
  root.style.touchAction = 'pan-y';
  body.style.touchAction = 'pan-y';

  listeners.forEach(([type, handler]) => {
    document.addEventListener(type, handler, { passive: false, capture: true });
  });
  document.addEventListener('touchend', preventDoubleTap, { passive: false, capture: true });

  return () => {
    listeners.forEach(([type, handler]) => {
      document.removeEventListener(type, handler, { capture: true });
    });
    document.removeEventListener('touchend', preventDoubleTap, { capture: true });
    root.style.overflow = previous.htmlOverflow;
    body.style.overflow = previous.bodyOverflow;
    root.style.position = previous.htmlPosition;
    body.style.position = previous.bodyPosition;
    root.style.touchAction = previous.htmlTouchAction;
    body.style.touchAction = previous.bodyTouchAction;
  };
}

if (typeof document !== 'undefined') {
  installFixedAppViewportGuards();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
