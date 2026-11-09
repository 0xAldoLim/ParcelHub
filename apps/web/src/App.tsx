import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  Package,
  LayoutDashboard,
  Archive,
  Truck,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  Plus,
  Upload,
  Download,
  ArrowUpRight,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Check,
  CircleAlert,
} from 'lucide-react';
import {
  defaultSettings,
  type Settings as SettingsType,
  type ProviderInfo,
  type Notice,
  statusLabels,
} from '../../../packages/shared/src/index';
import type { Parcel } from '../../../packages/shared/src/index';
import {
  api,
  ApiError,
  readParcels,
  cachedSettings,
  saveCachedSettings,
  claimNotifications,
  resolveChange,
  download,
  type Change,
} from './lib/offline';
import { words } from './lib/i18n';
import { HubContext } from './components/HubContext';
import { Modal } from './components/ui';
import { ParcelForm, BulkImport } from './components/ParcelForm';
import { Dashboard } from './pages/Dashboard';
import { Details } from './pages/Details';
import { Settings } from './pages/Settings';
import { Couriers, Usage, Activity } from './pages/Providers';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function App() {
  const client = useQueryClient(),
    navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<Parcel>(),
    [bulk, setBulk] = useState(false),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState(''),
    [auth, setAuth] = useState(false),
    [access, setAccess] = useState(''),
    [authError, setAuthError] = useState(''),
    [installEvent, setInstallEvent] = useState<InstallPrompt | null>(null),
    [conflicts, setConflicts] = useState(false);
  const [appearance, setAppearanceState] = useState({
    theme: localStorage.getItem('parcelhub-theme'),
    language: localStorage.getItem('parcelhub-language'),
  });
  const parcels = useQuery({
    queryKey: ['parcels'],
    queryFn: readParcels,
    refetchInterval: 20000,
    enabled: !auth,
  });
  const online = parcels.data?.online ?? false;
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        const s = await api<SettingsType>('/settings');
        await saveCachedSettings(s);
        return s;
      } catch {
        return cachedSettings();
      }
    },
    enabled: !auth,
  });
  const settings = {
    ...(settingsQuery.data ?? defaultSettings),
    ...(appearance.theme ? { theme: appearance.theme as SettingsType['theme'] } : {}),
    ...(appearance.language ? { language: appearance.language as SettingsType['language'] } : {}),
  };
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => api<ProviderInfo[]>('/providers'),
    enabled: online && !auth,
  });
  const notices = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notice[]>('/notifications'),
    enabled: online && !auth,
    refetchInterval: 20000,
  });
  const t = words[settings.language];
  const toast = useCallback((text: string) => setMessage(text), []);
  const reload = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['parcels'] }),
      client.invalidateQueries({ queryKey: ['notifications'] }),
      client.invalidateQueries({ queryKey: ['providers'] }),
      client.invalidateQueries({ queryKey: ['settings'] }),
      client.invalidateQueries({ queryKey: ['usage'] }),
    ]);
  }, [client]);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 100);
    };
    const requireAuth = () => setAuth(true);
    window.addEventListener('parcelhub-data', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('parcelhub-auth', requireAuth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('parcelhub-data', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('parcelhub-auth', requireAuth);
    };
  }, [reload]);
  useEffect(() => {
    if (parcels.error instanceof ApiError && parcels.error.status === 401) setAuth(true);
  }, [parcels.error]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        settings.theme === 'dark' || (settings.theme === 'system' && media.matches),
      );
    apply();
    media.addEventListener('change', apply);
    document.documentElement.lang = settings.language;
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.language]);
  useEffect(() => {
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);
  useEffect(() => {
    if (!notices.data) return;
    void claimNotifications(notices.data.map((n) => n.id)).then(async (ids) => {
      if (
        !settings.notifications ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted'
      )
        return;
      for (const n of notices.data!.filter((n) => ids.includes(n.id))) {
        const title = `${n.synthetic ? '[Synthetic] ' : ''}${n.title}`,
          options = { body: statusLabels[n.status], tag: n.id, icon: '/icon-192.png' };
        try {
          new Notification(title, options);
        } catch {
          const registration = await navigator.serviceWorker?.ready;
          await registration?.showNotification(title, options);
        }
      }
    });
  }, [notices.data, settings.notifications]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
        const search = document.querySelector<HTMLInputElement>('[aria-label="Search parcels"]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  function appearanceChange(key: 'theme' | 'language', value: string) {
    localStorage.setItem(`parcelhub-${key}`, value);
    setAppearanceState((a) => ({ ...a, [key]: value }));
    void saveCachedSettings({ ...settings, [key]: value });
  }
  async function install() {
    await installEvent?.prompt();
    await installEvent?.userChoice;
    setInstallEvent(null);
  }
  function add(parcel?: Parcel) {
    setEditing(parcel);
    setFormOpen(true);
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      await api('/session', { method: 'POST', body: JSON.stringify({ token: access }) });
      setAccess('');
      setAuth(false);
      await reload();
    } catch (e) {
      setAuthError((e as Error).message);
    }
  }
  if (auth)
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand-icon">
            <Package size={29} />
          </div>
          <div className="eyebrow">YOUR PRIVATE DELIVERY DESK</div>
          <h1>Welcome to ParcelHub.</h1>
          <p>This workspace is protected. Enter the access token configured on your server.</p>
          <form className="form" onSubmit={(e) => void login(e)}>
            <label className="field">
              Access token
              <input
                type="password"
                autoComplete="current-password"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                required
                autoFocus
              />
            </label>
            {authError && (
              <p className="form-error" role="alert">
                {authError}
              </p>
            )}
            <button className="button primary">
              Open workspace <ArrowUpRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  const links = [
    { to: '/', icon: LayoutDashboard, label: t.overview },
    { to: '/parcels', icon: Package, label: t.parcels },
    { to: '/archive', icon: Archive, label: t.archive },
    { to: '/couriers', icon: Truck, label: t.carriers },
  ];
  const pending = parcels.data?.pending ?? [];
  const hub = {
    parcels: parcels.data?.parcels ?? [],
    online,
    pending,
    settings,
    providers: providers.data ?? [],
    notices: notices.data ?? [],
    t,
    language: settings.language,
    reload,
    toast,
    add,
    setAppearance: appearanceChange,
    install: () => void install(),
    installable: !!installEvent,
  };
  return (
    <HubContext.Provider value={hub}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="app-shell">
        {mobile && <div className="mobile-backdrop" onClick={() => setMobile(false)} />}
        <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
          <NavLink to="/" className="brand" onClick={() => setMobile(false)}>
            <span className="brand-icon">
              <Package size={24} strokeWidth={1.8} />
            </span>
            <span>
              Parcel<span>Hub</span>
            </span>
          </NavLink>
          <div className="workspace">
            <span className="workspace-avatar">P</span>
            <div>
              <strong>Personal workspace</strong>
              <small>INDONESIA · {t.local}</small>
            </div>
            <span className="workspace-indicator" />
          </div>
          <span className="nav-caption">SHIPMENT MANAGEMENT</span>
          <nav>
            {links.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/parcels'}
                onClick={() => setMobile(false)}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                <Icon size={18} />
                {label}
                {to === '/parcels' && hub.parcels.filter((p) => !p.archivedAt).length > 0 && (
                  <span className="nav-count">{hub.parcels.filter((p) => !p.archivedAt).length}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <span className="nav-caption second">WORKSPACE TOOLS</span>
          <nav>
            <NavLink to="/usage" onClick={() => setMobile(false)} className="nav-link">
              <ChartNoAxesCombined size={18} />
              {t.usage}
            </NavLink>
            <NavLink to="/settings" onClick={() => setMobile(false)} className="nav-link">
              <SettingsIcon size={18} />
              {t.settings}
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <span className="tip-icon">
                <Upload size={19} />
              </span>
              <strong>
                More parcels?
                <br />
                Add them in one go.
              </strong>
              <p>Import a batch of tracking numbers and keep every shipment organized.</p>
              <button
                onClick={() => {
                  setBulk(true);
                  setMobile(false);
                }}
              >
                Import tracking numbers <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="connection">
              <span className={online ? 'online-dot' : 'offline-dot'} />
              <span>{online ? 'Workspace connected' : 'Offline storage available'}</span>
            </div>
            <div className="sidebar-profile">
              <div className="profile-avatar">PH</div>
              <div>
                <strong>My workspace</strong>
                <small>Self-hosted · Private</small>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out (local browser cache is retained for offline use)"
                onClick={() =>
                  void api('/session', { method: 'DELETE' }).then(() => {
                    setAuth(true);
                    toast('Signed out. Local offline cache is retained on this device.');
                  })
                }
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <button
                className="icon-button mobile-menu"
                onClick={() => setMobile(!mobile)}
                aria-label="Toggle navigation"
              >
                {mobile ? <X size={21} /> : <Menu size={21} />}
              </button>
              <span className="breadcrumb">
                ParcelHub<span>/</span>
                <strong>Shipment workspace</strong>
              </span>
            </div>
            <div className="topbar-actions">
              <span className={`connection-pill ${online ? '' : 'offline'}`}>
                {online ? <Wifi size={13} /> : <WifiOff size={13} />}
                <span>{online ? t.online : t.offline}</span>
              </span>
              <button
                className="icon-button"
                aria-label="Toggle theme"
                onClick={() => appearanceChange('theme', settings.theme === 'dark' ? 'light' : 'dark')}
              >
                {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-button notification-button"
                aria-label="View notifications"
                onClick={() => navigate('/activity')}
              >
                <Bell size={18} />
                {hub.notices.length > 0 && <i />}
              </button>
              <span className="topbar-divider" />
              <button
                className="top-avatar"
                onClick={() => navigate('/settings')}
                aria-label="Workspace settings"
              >
                PH
              </button>
            </div>
          </header>
          <main id="main-content">
            <div className="main-meta">
              <span>
                <i /> INDONESIA / MULTI-COURIER TRACKING
              </span>
              <span>
                {new Intl.DateTimeFormat(settings.language === 'id' ? 'id-ID' : 'en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(new Date())}
              </span>
            </div>
            {needRefresh && (
              <div className="update-banner">
                <RefreshCw size={16} />A new ParcelHub version is ready.
                <button className="text-link" onClick={() => void updateServiceWorker(true)}>
                  Update app
                </button>
              </div>
            )}
            {pending.length > 0 && (
              <div className="sync-banner">
                <CircleAlert size={17} />
                <span>
                  {pending.length} local change(s){' '}
                  {pending.some((c) => c.conflict) ? 'need your review.' : 'waiting to sync.'}
                </span>
                <button className="text-link" onClick={() => setConflicts(true)}>
                  Review changes
                </button>
              </div>
            )}
            {parcels.isPending ? (
              <div className="loading">
                <Package size={36} />
                <p>Loading your shipments…</p>
              </div>
            ) : (
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/parcels" element={<Dashboard full />} />
                <Route path="/archive" element={<Dashboard archived full />} />
                <Route path="/parcels/:id" element={<Details />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/couriers" element={<Couriers />} />
                <Route path="/usage" element={<Usage />} />
                <Route path="/activity" element={<Activity />} />
                <Route
                  path="*"
                  element={
                    <div className="empty-state">
                      <h1>This page took a detour.</h1>
                      <NavLink to="/">Back to dashboard</NavLink>
                    </div>
                  }
                />
              </Routes>
            )}
            <footer className="app-footer">
              <span>
                ParcelHub <span className="muted">Every shipment. One workspace.</span>
              </span>
              <div className="row">
                {installEvent && (
                  <button className="text-link" onClick={() => void install()}>
                    <Download size={13} />
                    {t.install}
                  </button>
                )}
                <button className="text-link muted" onClick={() => setBulk(true)}>
                  <Upload size={13} />
                  {t.bulk}
                </button>
                <span>Local-first, always.</span>
              </div>
            </footer>
          </main>
        </div>
      </div>
      <ParcelForm open={formOpen} onClose={() => setFormOpen(false)} existing={editing} />
      <BulkImport open={bulk} onClose={() => setBulk(false)} />
      <Modal
        open={conflicts}
        onClose={() => setConflicts(false)}
        title="Your pending changes"
        description="Edits stay on this device until the server accepts them. Review conflicts before replacing server fields."
        wide
      >
        <div className="form">
          {pending.map((c) => (
            <PendingChange
              key={c.id}
              change={c}
              onAction={async (action) => {
                try {
                  await resolveChange(c.id, action);
                  await reload();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            />
          ))}
          {!pending.length && (
            <p className="row green">
              <Check size={18} />
              All changes are synchronized.
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => download('parcelhub-pending-changes.json', JSON.stringify(pending, null, 2))}
          >
            <Download size={16} />
            Export pending changes
          </button>
        </div>
      </Modal>
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{message}</span>
          <button aria-label="Dismiss notification" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <button className="mobile-add" aria-label={t.add} onClick={() => add()}>
        <Plus size={24} />
      </button>
    </HubContext.Provider>
  );
}
function PendingChange({
  change: c,
  onAction,
}: {
  change: Change;
  onAction: (action: 'retry' | 'discard') => Promise<void>;
}) {
  return (
    <div className="pending-change">
      <strong>{c.local.nickname || c.local.trackingNumber}</strong>
      <p>
        {c.method} · {c.error ?? 'Waiting for the backend'}
      </p>
      <details>
        <summary>Review saved edit</summary>
        <pre>{JSON.stringify(c.body ?? { delete: c.local.trackingNumber }, null, 2)}</pre>
      </details>
      <div className="row">
        <button className="button secondary small-button" onClick={() => void onAction('retry')}>
          {c.conflict ? 'Apply my fields to current version' : 'Retry sync'}
        </button>
        <button
          className="text-link danger"
          onClick={() => {
            if (window.confirm('Discard this pending change and keep the server version?'))
              void onAction('discard');
          }}
        >
          Discard local change
        </button>
      </div>
    </div>
  );
}
