import { lazy, Suspense } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { SiteHeader, SiteFooter } from './components/SiteHeader.jsx';
import LandingPage from './pages/LandingPage.jsx';

const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage.jsx'));
const ChatPage = lazy(() => import('./pages/ChatPage.jsx'));

function Spinner() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-muted">
      <Loader2 className="size-6 animate-spin" aria-label="Loading" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="wrap py-24">
      <p className="text-sm text-muted">error 404</p>
      <h1 className="mt-2 text-(length:--text-title) text-ink">Nothing at this address.</h1>
      <Link to="/" className="mt-6 inline-block text-ink-2 underline decoration-dotted hover:text-accent">Go home</Link>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const fullBleed = pathname.startsWith('/chat');
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader fullBleed={fullBleed} />
      <main className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!fullBleed && <SiteFooter />}
    </div>
  );
}
