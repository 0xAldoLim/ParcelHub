import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  RefreshCw,
  Archive,
  ArchiveRestore,
  ChevronDown,
  MapPin,
  ArrowUpRight,
  Pencil,
  FlaskConical,
  Clock3,
} from 'lucide-react';
import { carriers, type Parcel } from '../../../../packages/shared/src/index';
import { useHub } from './HubContext';
import { CarrierLogo, StatusBadge, time, relative } from './ui';
import { api, archiveParcel } from '../lib/offline';
export function Timeline({ parcel, compact = false }: { parcel: Parcel; compact?: boolean }) {
  const { t, language } = useHub();
  const events = [...parcel.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events.length ? (
    <ol className={`timeline ${compact ? 'compact' : ''}`}>
      {events.map((e, i) => (
        <li key={e.id}>
          <span className={`timeline-node ${i === 0 ? 'current' : ''}`} />
          <div>
            <div className="timeline-description">{e.originalDescription}</div>
            <div className="timeline-meta">
              {e.location && (
                <span>
                  <MapPin size={12} />
                  {e.location}
                </span>
              )}
              <time dateTime={e.timestamp}>{time(e.timestamp, language, true)}</time>
            </div>
            {!compact && (
              <div className="muted small">
                {e.providerId} · {e.type} · {e.timezone}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="empty-timeline">
      <Clock3 size={18} />
      {t.noHistory}
    </p>
  );
}
export function ParcelCard({ parcel: p }: { parcel: Parcel }) {
  const { t, language, online, toast, reload, add, pending } = useHub();
  const [expanded, setExpanded] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const carrier = carriers.find((c) => c.code === p.carrierCode)!;
  const unsynced = pending.some((c) => c.parcelId === p.id);
  async function refresh() {
    setRefreshing(true);
    try {
      const result = await api<Parcel>(`/parcels/${p.id}/refresh`, { method: 'POST' });
      toast(result.error ?? 'Tracking updated.');
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  async function archive() {
    await archiveParcel(p, !p.archivedAt);
    await reload();
    toast(p.archivedAt ? 'Parcel restored.' : 'Parcel archived.');
  }
  return (
    <article className={`parcel-card ${p.trackingMode === 'mock' ? 'demo-card' : ''}`}>
      <div className="parcel-main">
        <CarrierLogo code={p.carrierCode} />
        <div className="parcel-identity">
          <Link to={`/parcels/${p.id}`} className="parcel-name">
            {p.nickname || p.trackingNumber}
          </Link>
          <div className="parcel-number">
            <span>{carrier.name}</span>
            <span className="dot-separator">·</span>
            <code>{p.trackingNumber}</code>
            <button
              className="copy-button"
              aria-label={`Copy ${p.trackingNumber}`}
              onClick={() =>
                void navigator.clipboard
                  .writeText(p.trackingNumber)
                  .then(() => toast('Tracking number copied.'))
                  .catch(() => toast('Clipboard is unavailable in this browser.'))
              }
            >
              <Copy size={12} />
            </button>
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <div className="parcel-information">
        <div className="parcel-location">
          <MapPin size={14} />
          <span>
            {p.location ??
              (p.status === 'UNKNOWN'
                ? 'Waiting for a tracking update'
                : (p.destination ?? 'Location not supplied'))}
          </span>
        </div>
        <div className="parcel-source">
          {p.trackingMode === 'mock' ? (
            <span className="synthetic">
              <FlaskConical size={12} />
              {t.synthetic}
            </span>
          ) : (
            <span>
              {p.providerId ?? (p.trackingMode === 'manual' ? 'Manual tracking' : 'No provider connected')}
            </span>
          )}
          {unsynced && <span className="queued">Pending sync</span>}
        </div>
      </div>
      {p.error && (
        <div className={`parcel-error ${p.errorCategory === 'MANUAL' ? 'neutral' : ''}`}>
          <span>{p.error}</span>
          {carrier.url && p.errorCategory === 'MANUAL' && (
            <a href={carrier.url} target="_blank" rel="noopener noreferrer">
              Track manually <ArrowUpRight size={13} />
            </a>
          )}
        </div>
      )}
      <div className="parcel-bottom">
        <button className="timeline-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <ChevronDown size={14} className={expanded ? 'rotate' : ''} />
          {t.tracking}
          {p.events.length > 0 && <span className="mini-count">{p.events.length}</span>}
        </button>
        <div className="parcel-actions">
          <span
            className="last-refresh"
            title={`${t.updated}: ${time(p.lastSuccessfulRefresh, language)}${p.lastRefreshAttempt !== p.lastSuccessfulRefresh ? ` · Last attempt: ${time(p.lastRefreshAttempt, language)}` : ''}`}
          >
            {p.lastSuccessfulRefresh ? relative(p.lastSuccessfulRefresh, language) : t.notTracked}
          </span>
          <button
            className="icon-button"
            aria-label={`Edit ${p.nickname || p.trackingNumber}`}
            onClick={() => add(p)}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={`${p.archivedAt ? t.restore : t.archiveAction} ${p.nickname || p.trackingNumber}`}
            onClick={() => void archive()}
          >
            {p.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label={`Refresh ${p.nickname || p.trackingNumber}`}
            disabled={refreshing || !online || !!p.archivedAt || unsynced}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="card-timeline">
          <Timeline parcel={p} compact />
          <Link className="text-link" to={`/parcels/${p.id}`}>
            {t.details}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
    </article>
  );
}
