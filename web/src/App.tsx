import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, AuthError } from './api.ts';
import { DayView } from './DayView.tsx';
import { GoalsView } from './GoalsView.tsx';
import { HistoryView } from './HistoryView.tsx';
import { TREND_RANGES, TrendsView } from './TrendsView.tsx';
import { AppContext, type AppContextValue } from './ui.tsx';

type Route = { tab: 'day'; date?: string } | { tab: 'history'; month?: string } | { tab: 'trends'; weeks: number } | { tab: 'goals' };

function parseRoute(hash: string): Route {
  const [, tab, param] = hash.replace(/^#/, '').split('/');
  if (tab === 'history') return { tab, month: /^\d{4}-\d{2}$/.test(param ?? '') ? param : undefined };
  if (tab === 'trends') {
    const weeks = Number(param);
    return { tab, weeks: TREND_RANGES.some((r) => r.weeks === weeks) ? weeks : 12 };
  }
  if (tab === 'goals') return { tab };
  return { tab: 'day', date: /^\d{4}-\d{2}-\d{2}$/.test(param ?? '') ? param : undefined };
}

function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return useMemo(() => parseRoute(hash), [hash]);
}

export function App() {
  const [auth, setAuth] = useState<{ status: 'checking' | 'in' | 'out'; required: boolean }>({ status: 'checking', required: true });
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const route = useRoute();

  useEffect(() => {
    api
      .session()
      .then((s) => setAuth({ status: !s.auth_required || s.authenticated ? 'in' : 'out', required: s.auth_required }))
      .catch(() => setAuth({ status: 'out', required: true }));
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  const context = useMemo<AppContextValue>(
    () => ({
      report: (error) => {
        if (error instanceof AuthError) setAuth((a) => ({ ...a, status: 'out' }));
        else notify(error instanceof Error ? error.message : 'Something went wrong');
      },
      notify,
      authRequired: auth.required,
      signOut: (everywhere) => {
        (everywhere ? api.logoutEverywhere() : api.logout()).finally(() => setAuth((a) => ({ ...a, status: 'out' })));
      },
    }),
    [auth.required, notify],
  );

  if (auth.status === 'checking') return <p className="loading">Loading…</p>;
  if (auth.status === 'out') return <Login onSignedIn={() => setAuth((a) => ({ ...a, status: 'in' }))} />;

  return (
    <AppContext.Provider value={context}>
      <main className="app">
        {/* Keyed by screen (and day), so switching tabs replays the entrance; a range or month change doesn't. */}
        <div className="view" key={route.tab === 'day' ? `day:${route.date ?? 'today'}` : route.tab}>
          {route.tab === 'day' && <DayView date={route.date} />}
          {route.tab === 'history' && <HistoryView month={route.month} />}
          {route.tab === 'trends' && <TrendsView weeks={route.weeks} />}
          {route.tab === 'goals' && <GoalsView />}
        </div>
      </main>
      <TabBar current={route.tab} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}

function TabBar({ current }: { current: Route['tab'] }) {
  const tabs = [
    { tab: 'day', href: '#/', label: 'Today', icon: <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="38 13" transform="rotate(-90 12 12)" /> },
    {
      tab: 'history',
      href: '#/history',
      label: 'History',
      icon: (
        <>
          <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ),
    },
    {
      tab: 'trends',
      href: '#/trends',
      label: 'Trends',
      icon: <path d="M4 18l5-6 4 3 7-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    },
    {
      tab: 'goals',
      href: '#/goals',
      label: 'Goals',
      icon: (
        <>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </>
      ),
    },
  ] as const;
  return (
    <div className="tabbar">
      <nav aria-label="Sections">
        {tabs.map((t) => (
          <a key={t.tab} href={t.href} aria-current={current === t.tab ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden>
              {t.icon}
            </svg>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(key.trim());
      onSignedIn();
    } catch {
      setError("That key didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app login">
      <form onSubmit={submit}>
        <img src="/apple-touch-icon.png" alt="" />
        <h1 style={{ margin: '0 0 4px' }}>Hulk</h1>
        <p className="empty" style={{ marginBottom: 20 }}>
          Sign in with your server's API key. You'll stay signed in on this device for 90 days.
        </p>
        <label className="field">
          <span>API key</span>
          <input type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="button primary" disabled={busy || !key.trim()} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
