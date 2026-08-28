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

// App-like viewport controls. Safari can ignore viewport/CSS hints for pinch
// gestures, so explicitly suppress Safari gesture events at the document level.
function installMobileViewportGuards() {
  const root = document.documentElement;
  const body = document.body;

  root.style.touchAction = 'pan-y';
  body.style.touchAction = 'pan-y';

  const preventGesture = (event) => {
    event.preventDefault();
  };

  const preventMultiTouch = (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  };

  const preventDoubleTapZoom = (event) => {
    const now = Date.now();
    if (installMobileViewportGuards.lastTouchEnd && now - installMobileViewportGuards.lastTouchEnd < 300) {
      event.preventDefault();
    }
    installMobileViewportGuards.lastTouchEnd = now;
  };

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('touchmove', preventMultiTouch, { passive: false });
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
    document.removeEventListener('touchmove', preventMultiTouch);
    document.removeEventListener('touchend', preventDoubleTapZoom);
  };
}

if (typeof document !== 'undefined') {
  installMobileViewportGuards();
}

// Service worker — register only, no forced reloads (they cause infinite loops in preview)
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