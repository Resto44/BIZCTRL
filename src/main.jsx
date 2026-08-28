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

// Safari/iOS viewport guards: suppress native pinch and double-tap zoom while
// preserving normal scrolling and form interaction. Viewport meta also enforces
// a fixed scale, but the runtime listeners cover Safari gesture events.
function installMobileViewportGuards() {
  const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  if (!isTouchDevice || typeof document === 'undefined') return undefined;

  const root = document.documentElement;
  const body = document.body;
  const previous = {
    rootTouchAction: root.style.touchAction,
    bodyTouchAction: body.style.touchAction,
  };

  root.style.touchAction = 'pan-y';
  body.style.touchAction = 'pan-y';

  const preventGesture = (event) => {
    event.preventDefault();
  };

  const preventPinch = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  };

  let lastTouchEnd = 0;
  const preventDoubleTapZoom = (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  };

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
    document.removeEventListener('touchmove', preventPinch);
    document.removeEventListener('touchend', preventDoubleTapZoom);
    root.style.touchAction = previous.rootTouchAction;
    body.style.touchAction = previous.bodyTouchAction;
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
