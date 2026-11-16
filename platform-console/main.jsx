import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { queryClientInstance } from '@/lib/query-client';
import { LanguageProvider } from '@/lib/LanguageContext';
import '@/index.css';

// Dedicated control-plane bundle: never mount public marketing, ERP AppLayout,
// tenant workspace, SubscriptionProvider, customer pages or retail/POS modules.
const PlatformOwnerLogin = lazy(() => import('@/pages/PlatformOwnerLogin'));
const PlatformOwnerPortal = lazy(() => import('@/pages/PlatformOwnerPortal'));
const PlatformOwnerPasswordChange = lazy(() => import('@/pages/PlatformOwnerPasswordChange'));

function Loading() {
  return <main role="status" className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-sm text-slate-200">Opening secure Platform Owner console…</main>;
}

class AdminErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main role="alert" className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-lg rounded-2xl border border-slate-700 p-6 text-center">
          <h1 className="text-xl font-bold">Unable to open secure administration</h1>
          <p className="my-4 text-sm text-slate-300">Reload the control plane. Administrative authorization has not been bypassed.</p>
          <button type="button" className="min-h-11 rounded-lg bg-cyan-400 px-4 font-semibold text-slate-950" onClick={() => window.location.reload()}>Reload console</button>
        </section>
      </main>
    );
    return this.props.children;
  }
}

function PlatformConsoleApp() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <LanguageProvider>
        <BrowserRouter>
          <AdminErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/platform-owner/login" replace />} />
                <Route path="/platform-owner/login" element={<PlatformOwnerLogin />} />
                <Route path="/platform-owner/recover" element={<PlatformOwnerLogin />} />
                <Route path="/platform-owner/new-owner-setup" element={<PlatformOwnerLogin />} />
                <Route path="/platform-owner/change-password" element={<PlatformOwnerPasswordChange />} />
                <Route path="/platform-owner/*" element={<PlatformOwnerPortal />} />
                <Route path="*" element={<Navigate to="/platform-owner/login" replace />} />
              </Routes>
            </Suspense>
            <Toaster richColors position="top-center" />
          </AdminErrorBoundary>
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PlatformConsoleApp />);
