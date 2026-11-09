import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  Download,
  Upload,
  ShieldCheck,
  Database,
  RefreshCw,
  Save,
  KeyRound,
  ArrowUpRight,
  Check,
  Info,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import {
  defaultSettings,
  settingsSchema,
  statuses,
  statusLabels,
  notifyStatuses,
  type Settings as SettingsType,
} from '../../../../packages/shared/src/index';
import { useHub } from '../components/HubContext';
import { api, clearLocalData, download, saveCachedSettings } from '../lib/offline';
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
export function SettingPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-title">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-panel-body">{children}</div>
    </section>
  );
}
export function Settings() {
  const {
    settings,
    online,
    providers,
    reload,
    toast,
    setAppearance,
    t,
    parcels,
    pending,
    install,
    installable,
  } = useHub();
  const [draft, setDraft] = useState<SettingsType>(settings),
    [busy, setBusy] = useState(false),
    [permission, setPermission] = useState(
      typeof Notification === 'undefined' ? 'unavailable' : Notification.permission,
    );
  const previousSettings = useRef(settings);
  useEffect(() => {
    const changed = Object.entries(settings).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(previousSettings.current[key as keyof SettingsType]),
    );
    if (changed.length) setDraft((current) => ({ ...current, ...Object.fromEntries(changed) }));
    previousSettings.current = settings;
  }, [settings]);
  function update<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    setDraft((s) => ({ ...s, [key]: value }));
  }
  async function save() {
    const parsed = settingsSchema.safeParse(draft);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const result = await api<SettingsType>('/settings', {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      });
      await saveCachedSettings(result);
      await reload();
      toast('Settings saved. Request budgets apply immediately.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connection(id: string) {
    try {
      const r = await api<{ message: string }>(`/providers/${id}/test`, { method: 'POST' });
      toast(r.message);
    } catch (e) {
      toast((e as Error).message);
    }
    await reload();
  }
  async function exportJson() {
    try {
      const data = online
        ? await api('/export')
        : { format: 'parcelhub-v1', parcels, settings, cached: true };
      download('parcelhub-export.json', JSON.stringify(data, null, 2));
      toast('JSON export downloaded.');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function fileImport(file: File, restore = false) {
    if (pending.length) {
      toast('Sync or resolve pending edits before importing or restoring data.');
      return;
    }
    if (
      restore &&
      !window.confirm(
        'Replace all parcels, usage, and settings with this SQLite backup? An undo backup will be downloaded.',
      )
    )
      return;
    try {
      if (restore) {
        const r = await api<{ restored: number; previousBackup: string }>('/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream', 'x-confirm-restore': 'replace-all' },
          body: file,
        });
        const decoded = Uint8Array.from(atob(r.previousBackup), (c) => c.charCodeAt(0));
        download('parcelhub-before-restore.sqlite', decoded, 'application/octet-stream');
        await clearLocalData();
        toast(`${r.restored} parcels restored. Previous database downloaded.`);
      } else {
        const r = await api<{ imported: number; skipped: number }>('/import', {
          method: 'POST',
          body: await file.text(),
        });
        toast(`${r.imported} imported. ${r.skipped} duplicates skipped. Existing parcels were preserved.`);
      }
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function permissionRequest() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === 'granted') update('notifications', true);
  }
  function providerUpdate(index: number, key: string, value: unknown) {
    setDraft((s) => ({
      ...s,
      providers: s.providers.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE CONFIGURATION</div>
          <h1>{t.settings}</h1>
          <p>Manage providers, refresh rules, and your data.</p>
        </div>
        <button className="button primary" disabled={!online || busy} onClick={() => void save()}>
          <Save size={16} />
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      {!online && (
        <div className="cached-banner">
          Backend unavailable. Appearance works offline; reconnect to save server settings.
        </div>
      )}
      <div className="settings-layout">
        <div className="settings-column">
          <SettingPanel
            title="Tracking preferences"
            description="Stay updated, without unnecessary requests."
            icon={<RefreshCw size={20} />}
          >
            <Switch
              checked={draft.autoRefresh}
              onChange={(v) => update('autoRefresh', v)}
              label="Automatic refresh"
              description="Runs only while your backend is running. Delivered and archived parcels stop polling."
            />
            <div className="form-grid">
              <label className="field">
                Refresh interval (minutes)
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={draft.refreshMinutes}
                  onChange={(e) => update('refreshMinutes', +e.target.value)}
                />
              </label>
              <label className="field">
                Manual cooldown (seconds)
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={draft.manualCooldownSeconds}
                  onChange={(e) => update('manualCooldownSeconds', +e.target.value)}
                />
              </label>
            </div>
            <Switch
              checked={draft.allowFallback}
              onChange={(v) => update('allowFallback', v)}
              label="Allow secondary API fallback"
              description="Each attempted provider consumes its own request and cost budget."
            />
          </SettingPanel>
          <SettingPanel
            title="API providers"
            description="Credentials stay in your server environment."
            icon={<KeyRound size={20} />}
          >
            <div className="inline-note">
              <ShieldCheck size={17} />
              Edit .env on the server, then restart ParcelHub. API keys are never sent to this browser.
            </div>
            {draft.providers
              .filter((p) => p.id !== 'manual')
              .map((p) => {
                const index = draft.providers.findIndex((x) => x.id === p.id),
                  info = providers.find((x) => x.id === p.id);
                return (
                  <div className="provider-config" key={p.id}>
                    <div className="row between">
                      <strong>{info?.name ?? p.id}</strong>
                      <span className={`provider-pill ${info?.configured ? 'ready' : ''}`}>
                        {info?.configured ? (p.id === 'mock' ? 'Synthetic' : 'Key configured') : 'No API key'}
                      </span>
                    </div>
                    <p>{info?.verification}</p>
                    <div className="form-grid">
                      <Switch
                        label="Enabled"
                        checked={p.enabled}
                        onChange={(v) => providerUpdate(index, 'enabled', v)}
                      />
                      <label className="field">
                        Priority
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={p.priority}
                          onChange={(e) => providerUpdate(index, 'priority', +e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Estimated IDR / request
                        <input
                          type="number"
                          min={0}
                          value={p.costPerRequest}
                          disabled={p.id === 'mock'}
                          onChange={(e) => providerUpdate(index, 'costPerRequest', +e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Requests / day
                        <input
                          type="number"
                          min={0}
                          value={p.dailyCap}
                          onChange={(e) => providerUpdate(index, 'dailyCap', +e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Requests / month
                        <input
                          type="number"
                          min={0}
                          value={p.monthlyCap}
                          onChange={(e) => providerUpdate(index, 'monthlyCap', +e.target.value)}
                        />
                      </label>
                    </div>
                    {info?.disabledReason && <div className="form-error">{info.disabledReason}</div>}
                    {info?.openUntil && <p className="small">Circuit cooldown until {info.openUntil}</p>}
                    <div className="row">
                      <button
                        className="button secondary small-button"
                        disabled={!online}
                        onClick={() => void connection(p.id)}
                      >
                        Test connection
                      </button>
                      <button
                        className="text-link muted"
                        disabled={!online || p.id === 'mock'}
                        onClick={() =>
                          void api(`/providers/${p.id}/reset`, { method: 'POST' })
                            .then(reload)
                            .then(() =>
                              toast('Provider reset. Updated credentials are read after a server restart.'),
                            )
                            .catch((e) => toast(e.message))
                        }
                      >
                        Reset circuit / auth pause
                      </button>
                    </div>
                  </div>
                );
              })}
            <small>
              Connection tests verify Klik Resi account access when a key is present. Other providers report
              configuration only until an actual tracking request succeeds.
            </small>
          </SettingPanel>
          <SettingPanel
            title="Request budgets"
            description="An estimate you control, independent of provider billing."
            icon={<ShieldCheck size={20} />}
          >
            <Switch
              checked={draft.allowPaid}
              onChange={(v) => update('allowPaid', v)}
              label="Enable real API calls"
              description="Disabled by default. All real providers are conservatively treated as paid, including subscription plans."
            />
            <div className="form-grid">
              <label className="field">
                Daily request cap
                <input
                  type="number"
                  min={0}
                  value={draft.dailyCap}
                  onChange={(e) => update('dailyCap', +e.target.value)}
                />
              </label>
              <label className="field">
                Monthly request cap
                <input
                  type="number"
                  min={0}
                  value={draft.monthlyCap}
                  onChange={(e) => update('monthlyCap', +e.target.value)}
                />
              </label>
              <label className="field">
                Monthly maximum (IDR)
                <input
                  type="number"
                  min={0}
                  value={draft.monthlyBudget}
                  onChange={(e) => update('monthlyBudget', +e.target.value)}
                />
              </label>
            </div>
            <p className="small muted">
              Defaults: 100 requests/day, 1,000/month, Rp50,000/month. Usage windows use UTC. Requests are
              reserved before dispatch; failed or interrupted requests may retain estimated cost
              conservatively.
            </p>
          </SettingPanel>
        </div>
        <div className="settings-column">
          <SettingPanel title={t.theme} description="A calmer view, day or night." icon={<Sun size={20} />}>
            <div className="theme-options">
              {[
                { value: 'light', icon: Sun },
                { value: 'dark', icon: Moon },
                { value: 'system', icon: Monitor },
              ].map(({ value, icon: Icon }) => (
                <button
                  className={settings.theme === value ? 'chosen' : ''}
                  key={value}
                  onClick={() => {
                    setAppearance('theme', value);
                    update('theme', value as SettingsType['theme']);
                  }}
                >
                  <Icon size={22} />
                  {value}
                  <Check size={12} />
                </button>
              ))}
            </div>
            <label className="field">
              {t.language}
              <select
                aria-label={t.language}
                value={settings.language}
                onChange={(e) => {
                  setAppearance('language', e.target.value);
                  update('language', e.target.value as SettingsType['language']);
                }}
              >
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </label>
            {installable && (
              <button className="button secondary" onClick={install}>
                <Download size={16} />
                {t.install}
              </button>
            )}
          </SettingPanel>
          <SettingPanel
            title={t.notification}
            description="Only the updates that matter."
            icon={<Bell size={20} />}
          >
            <div className="row between">
              <span className="small">
                Browser permission: <strong>{permission}</strong>
              </span>
              <button
                className="button secondary small-button"
                disabled={permission === 'unavailable' || permission === 'denied'}
                onClick={() => void permissionRequest()}
              >
                Allow notifications
              </button>
            </div>
            <Switch
              label="Show browser notifications"
              checked={draft.notifications}
              disabled={permission !== 'granted'}
              onChange={(v) => update('notifications', v)}
            />
            {notifyStatuses.map((status) => (
              <label className="check-row" key={status}>
                <input
                  type="checkbox"
                  checked={draft.subscriptions.includes(status)}
                  onChange={(e) =>
                    update(
                      'subscriptions',
                      e.target.checked
                        ? [...draft.subscriptions, status]
                        : draft.subscriptions.filter((x) => x !== status),
                    )
                  }
                />
                {statusLabels[status]}
              </label>
            ))}
            <button
              className="text-link"
              disabled={permission !== 'granted'}
              onClick={() => {
                new Notification('ParcelHub · Test notification', {
                  body: 'Your delivery desk is ready.',
                  tag: 'parcelhub-test',
                });
              }}
            >
              Send test notification <ArrowUpRight size={14} />
            </button>
            <p className="small muted">
              Notifications work while this app is open. Reliable delivery while all devices are offline
              requires an always-running backend and push infrastructure. Installing the PWA does not keep the
              server running.
            </p>
          </SettingPanel>
          <SettingPanel
            title={t.data}
            description="A home for your history. A way to take it with you."
            icon={<Database size={20} />}
          >
            <div className="data-buttons">
              <button className="button secondary" onClick={() => void exportJson()}>
                <Download size={16} />
                {t.export}
              </button>
              <label className={`button secondary ${!online ? 'disabled' : ''}`}>
                <Upload size={16} />
                {t.import}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={!online}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void fileImport(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              <a
                className={`button secondary ${!online ? 'disabled' : ''}`}
                href="/api/backup"
                aria-disabled={!online}
                onClick={(e) => {
                  if (!online) e.preventDefault();
                }}
              >
                <Database size={16} />
                Backup SQLite
              </a>
              <label className={`button secondary ${!online ? 'disabled' : ''}`}>
                <Upload size={16} />
                Restore SQLite
                <input
                  type="file"
                  className="sr-only"
                  accept=".sqlite,.db"
                  disabled={!online}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void fileImport(e.target.files[0], true);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="small muted">
              JSON import merges parcels and skips duplicates. SQLite restore replaces the whole database
              after validation and downloads the previous snapshot. Backups contain personal parcel data; keep
              them private.
            </p>
            <button
              className="text-link"
              disabled={!online}
              onClick={() =>
                void api<{ archived: number }>('/archive-delivered', { method: 'POST' })
                  .then(async (r) => {
                    await reload();
                    toast(`${r.archived} delivered parcels archived.`);
                  })
                  .catch((e) => toast(e.message))
              }
            >
              Archive all delivered parcels <ArrowUpRight size={14} />
            </button>
          </SettingPanel>
          <div className="inline-note">
            <Info size={18} />
            <div>
              <strong>ParcelHub 1.0</strong>
              <p>Local-first. Self-hosted. Built for Indonesia.</p>
              <small>
                {statuses.length} normalized statuses · {defaultSettings.providers.length} provider modes
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
