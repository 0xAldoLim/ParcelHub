import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Truck,
  Clock3,
  CircleCheck,
  CircleAlert,
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  Plus,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  FlaskConical,
} from 'lucide-react';
import {
  statuses,
  statusLabels,
  statusLabelsId,
  carriers,
  attentionStatuses,
  terminalStatuses,
  type Parcel,
} from '../../../../packages/shared/src/index';
import { useHub } from '../components/HubContext';
import { ParcelCard } from '../components/ParcelCard';
import { EmptyArt, relative, StatusIcon } from '../components/ui';
import { api } from '../lib/offline';
export function Dashboard({ archived = false, full = false }: { archived?: boolean; full?: boolean }) {
  const { parcels, t, language, add, online, toast, reload, notices, settings } = useHub();
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [carrier, setCarrier] = useState(''),
    [tag, setTag] = useState(''),
    [since, setSince] = useState(''),
    [changed, setChanged] = useState(''),
    [sort, setSort] = useState('newest'),
    [filters, setFilters] = useState(false),
    [busy, setBusy] = useState(false);
  const unarchived = parcels.filter((p) => !p.archivedAt),
    active = unarchived.filter((p) => !terminalStatuses.includes(p.status));
  const needsAttention = (p: Parcel) => attentionStatuses.includes(p.status) || !!p.error;
  const stats = [
    { label: t.active, count: active.length, icon: Package, key: 'active' },
    {
      label: t.pending,
      count: unarchived.filter((p) => p.status === 'PENDING').length,
      icon: Clock3,
      key: 'PENDING',
    },
    {
      label: t.transit,
      count: unarchived.filter((p) => ['IN_TRANSIT', 'PICKED_UP'].includes(p.status)).length,
      icon: Truck,
      key: 'IN_TRANSIT',
    },
    {
      label: t.out,
      count: unarchived.filter((p) => p.status === 'OUT_FOR_DELIVERY').length,
      icon: Truck,
      key: 'OUT_FOR_DELIVERY',
    },
    {
      label: t.delivered,
      count: unarchived.filter((p) => p.status === 'DELIVERED').length,
      icon: CircleCheck,
      key: 'DELIVERED',
    },
    {
      label: t.attention,
      count: unarchived.filter(needsAttention).length,
      icon: CircleAlert,
      key: 'attention',
    },
  ];
  const base = parcels.filter((p) => (archived ? !!p.archivedAt : !p.archivedAt));
  const q = search.toLowerCase();
  const visible = base
    .filter(
      (p) =>
        `${p.nickname} ${p.trackingNumber} ${p.notes} ${p.storeName}`.toLowerCase().includes(q) &&
        (!carrier || p.carrierCode === carrier) &&
        (!tag || p.tags.includes(tag)) &&
        (!since || p.createdAt.slice(0, 10) >= since) &&
        (!changed || (p.lastStatusChange ?? '').slice(0, 10) >= changed) &&
        (filter === 'all' ||
          (filter === 'active'
            ? !terminalStatuses.includes(p.status)
            : filter === 'attention'
              ? needsAttention(p)
              : filter === 'IN_TRANSIT'
                ? ['IN_TRANSIT', 'PICKED_UP'].includes(p.status)
                : p.status === filter)),
    )
    .sort((a, b) =>
      sort === 'name'
        ? (a.nickname || a.trackingNumber).localeCompare(b.nickname || b.trackingNumber)
        : sort === 'updated'
          ? (b.lastStatusChange ?? '').localeCompare(a.lastStatusChange ?? '')
          : sort === 'oldest'
            ? a.createdAt.localeCompare(b.createdAt)
            : b.createdAt.localeCompare(a.createdAt),
    );
  const latest = unarchived
    .map((p) => p.lastSuccessfulRefresh)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const reset = () => {
    setSearch('');
    setFilter('all');
    setCarrier('');
    setTag('');
    setSince('');
    setChanged('');
  };
  async function refreshAll() {
    setBusy(true);
    let success = 0;
    for (const p of active.filter((p) => p.trackingMode !== 'manual')) {
      try {
        const result = await api<Parcel>(`/parcels/${p.id}/refresh`, { method: 'POST' });
        if (!result.error) success++;
      } catch {
        /* per-parcel error remains visible */
      }
    }
    await reload();
    setBusy(false);
    toast(`${success} parcels updated. See each parcel for provider errors or cooldowns.`);
  }
  async function demo() {
    try {
      await api('/demo', { method: 'POST' });
      await reload();
      toast('Demo parcels added. All demo tracking is synthetic.');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {archived ? 'SHIPMENT RECORDS' : full ? 'TRACKING CENTER' : 'YOUR LOGISTICS AT A GLANCE'}
          </div>
          <h1>{archived ? t.archive : full ? t.parcels : t.welcome}</h1>
          <p>{archived ? 'Your completed and archived shipment records.' : t.intro}</p>
        </div>
        <button className="button primary" onClick={() => add()}>
          <Plus size={17} />
          {t.add}
        </button>
      </div>
      {!archived && (
        <div className="stats">
          {stats.map(({ label, count, icon: Icon, key }, i) => (
            <button
              className={`stat stat-${key.toLowerCase()} ${i === 0 ? 'featured' : ''} ${filter === key ? 'selected' : ''}`}
              key={key}
              onClick={() => setFilter(filter === key ? 'all' : key)}
            >
              <div className="stat-label">
                {label}
                <Icon size={16} />
              </div>
              <div className="stat-number">
                {count}
                <span className="stat-caption">{language === 'id' ? 'paket' : 'parcels'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className={`dashboard-grid ${full || archived ? 'full' : ''}`}>
        <section className="parcel-section">
          <div className="section-heading">
            <div className="row">
              <h2>{archived ? t.archive : t.parcels}</h2>
              <span className="count">{base.length}</span>
            </div>
            {base.length > 0 && !archived && (
              <button
                className="text-link muted"
                disabled={!online || busy}
                onClick={() => void refreshAll()}
              >
                <RefreshCw size={14} className={busy ? 'spin' : ''} />
                {t.refreshAll}
              </button>
            )}
          </div>
          <div className="parcel-toolbar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search parcels"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.search}
              />
              <kbd>/</kbd>
            </div>
            <button
              className={`button filter-button ${filters ? 'selected' : ''}`}
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={16} />
              <span>Filters</span>
            </button>
          </div>
          <div className="filter-line">
            <div className="filter-tabs">
              {[
                { id: 'all', text: t.all },
                { id: 'active', text: 'On the way' },
                { id: 'DELIVERED', text: t.delivered },
                { id: 'attention', text: t.attention },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={filter === tab.id ? 'current' : ''}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.text}
                </button>
              ))}
            </div>
            <label className="sort-label">
              <ArrowDownUp size={13} />
              <select aria-label="Sort parcels" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Status updated</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          {filters && (
            <div className="advanced-filters">
              <label>
                Courier
                <select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  <option value="">All couriers</option>
                  {carriers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="attention">Needs attention</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {(language === 'id' ? statusLabelsId : statusLabels)[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tag
                <select value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">All tags</option>
                  {[...new Set(parcels.flatMap((p) => p.tags))].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Added since
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
              </label>
              <label>
                Status changed since
                <input type="date" value={changed} onChange={(e) => setChanged(e.target.value)} />
              </label>
              <button className="text-link" onClick={reset}>
                {t.reset}
              </button>
            </div>
          )}
          {!online && (
            <div className="cached-banner">
              <WifiOff size={16} />
              {t.offline}. Background tracking is paused. You can still add and edit parcels.
            </div>
          )}
          {base.length === 0 ? (
            <div className="empty-state">
              <EmptyArt />
              <span className="eyebrow">YOUR TRACKING WORKSPACE</span>
              <h2>{archived ? 'Nothing archived yet.' : t.empty}</h2>
              <p>{archived ? 'Archive a parcel to keep it here, out of your everyday view.' : t.emptyBody}</p>
              {!archived && (
                <>
                  <button className="button primary" onClick={() => add()}>
                    <Plus size={17} />
                    {t.getStarted}
                  </button>
                  <button className="demo-link" disabled={!online} onClick={() => void demo()}>
                    <FlaskConical size={14} />
                    {t.demo}
                    <ArrowUpRight size={14} />
                  </button>
                </>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state compact-empty">
              <Search size={30} />
              <h3>{t.noMatches}</h3>
              <button className="text-link" onClick={reset}>
                {t.reset}
              </button>
            </div>
          ) : (
            <div className="parcel-list">
              {visible.map((p) => (
                <ParcelCard key={p.id} parcel={p} />
              ))}
            </div>
          )}
          <div className="list-footer">
            <span>
              <ShieldCheck size={13} />
              {t.saved}
            </span>
            <span>{latest ? `${t.updated}: ${relative(latest, language)}` : t.noUpdates}</span>
          </div>
        </section>
        {!full && !archived && (
          <aside className="activity-rail">
            <div className="focus-card">
              <div className="row between">
                <span className="eyebrow">DELIVERY BRIEF</span>
                <span className="focus-icon">
                  <Truck size={18} />
                </span>
              </div>
              <div className="delivery-count">
                {unarchived.filter((p) => p.status === 'OUT_FOR_DELIVERY').length}
                <span>{t.out}</span>
              </div>
              <h3>{language === 'id' ? 'Pengantaran tahap akhir' : 'On the final mile'}</h3>
              <p>
                {unarchived.some((p) => p.status === 'OUT_FOR_DELIVERY')
                  ? 'These shipments have been marked out for delivery by their tracking source.'
                  : 'No shipments are currently marked out for delivery. New updates will appear here.'}
              </p>
              {unarchived.some((p) => p.trackingMode === 'mock') && (
                <span className="small synthetic">Includes synthetic demo data</span>
              )}
            </div>
            <div className="activity-block">
              <div className="section-heading">
                <h2>{t.activity}</h2>
                <span className="live-dot" />
              </div>
              {notices.length ? (
                <div className="activity-list">
                  {notices.slice(0, 4).map((n) => (
                    <Link key={n.id} to={`/parcels/${n.parcelId}`} className="activity-item">
                      <span className={`activity-icon status-${n.status.toLowerCase()}`}>
                        <StatusIcon status={n.status} />
                      </span>
                      <div>
                        <strong>{(language === 'id' ? statusLabelsId : statusLabels)[n.status]}</strong>
                        <p>
                          {n.title}
                          {n.synthetic ? ' · Synthetic' : ''}
                        </p>
                        <small>{relative(n.createdAt, language)}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="quiet">
                  <Clock3 size={23} />
                  <strong>{t.quiet}</strong>
                  <p>{t.quietBody}</p>
                </div>
              )}
              <Link to="/activity" className="text-link activity-link">
                View activity
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="privacy-card">
              <span>
                <ShieldCheck size={19} />
              </span>
              <h3>{t.notice}</h3>
              <p>{t.noticeBody}</p>
              <Link to="/settings" className="text-link">
                {t.help}
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="rail-caption">LOCAL STORAGE / PRIVATE BY DESIGN</div>
          </aside>
        )}
      </div>
      <div className="page-caption">
        CONNECTING INDONESIA'S DELIVERIES <span>12 couriers · One workspace</span>
      </div>
      {!settings.allowPaid && <div className="sr-only">Paid API calls are disabled.</div>}
    </>
  );
}
