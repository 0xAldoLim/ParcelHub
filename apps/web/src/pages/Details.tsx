import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, Archive, Trash2, Copy, Info, MapPin } from 'lucide-react';
import { carriers, type Parcel } from '../../../../packages/shared/src/index';
import { useHub } from '../components/HubContext';
import { CarrierLogo, StatusBadge, OfficialLink, time } from '../components/ui';
import { Timeline } from '../components/ParcelCard';
import { api, archiveParcel, deleteParcel } from '../lib/offline';
export function Details() {
  const { id } = useParams();
  const { parcels, t, language, add, reload, toast, online } = useHub();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const p = parcels.find((p) => p.id === id);
  if (!p)
    return (
      <div className="empty-state">
        <h1>Parcel not found</h1>
        <Link to="/" className="button secondary">
          Back to dashboard
        </Link>
      </div>
    );
  const carrier = carriers.find((c) => c.code === p.carrierCode)!;
  async function refresh(parcel: Parcel) {
    setBusy(true);
    try {
      const r = await api<Parcel>(`/parcels/${parcel.id}/refresh`, { method: 'POST' });
      toast(r.error ?? 'Tracking updated.');
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(parcel: Parcel) {
    if (
      !window.confirm(
        'Delete this parcel and its tracking history? This cannot be undone after synchronization.',
      )
    )
      return;
    await deleteParcel(parcel);
    await reload();
    navigate('/parcels');
    toast('Parcel deletion saved.');
  }
  return (
    <>
      <Link to="/parcels" className="text-link back-link">
        <ArrowLeft size={16} />
        {t.parcels}
      </Link>
      <div className="detail-heading">
        <CarrierLogo code={p.carrierCode} large />
        <div>
          <div className="eyebrow">{carrier.name}</div>
          <h1>{p.nickname || p.trackingNumber}</h1>
          <div className="row">
            <code>{p.trackingNumber}</code>
            <button
              className="icon-button"
              aria-label="Copy tracking number"
              onClick={() =>
                void navigator.clipboard.writeText(p.trackingNumber).then(() => toast('Copied.'))
              }
            >
              <Copy size={15} />
            </button>
            {p.trackingMode === 'mock' && <span className="synthetic">Synthetic data</span>}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <div className="detail-actions">
        <button
          className="button primary"
          disabled={!online || busy || !!p.archivedAt}
          onClick={() => void refresh(p)}
        >
          <RefreshCw size={16} className={busy ? 'spin' : ''} />
          {t.refresh}
        </button>
        <button className="button secondary" onClick={() => add(p)}>
          <Pencil size={15} />
          Edit parcel
        </button>
        <button
          className="button secondary"
          onClick={() => void archiveParcel(p, !p.archivedAt).then(reload)}
        >
          <Archive size={15} />
          {p.archivedAt ? t.restore : t.archiveAction}
        </button>
        <OfficialLink parcel={p} />
      </div>
      {p.error && (
        <div className="inline-note warning">
          <Info size={18} />
          <div>
            <strong>Last refresh: {p.errorCategory}</strong>
            <p>{p.error}</p>
            <small>The last valid shipment status and history are preserved.</small>
          </div>
        </div>
      )}
      <div className="detail-grid">
        <section className="panel">
          <h2>{t.tracking}</h2>
          <Timeline parcel={p} />
        </section>
        <div>
          <section className="panel">
            <h2>Shipment details</h2>
            <dl className="detail-list">
              <dt>Normalized status</dt>
              <dd>{p.status}</dd>
              <dt>Original status</dt>
              <dd>{p.rawStatus || 'Not supplied'}</dd>
              <dt>Shipping service</dt>
              <dd>{p.service ?? 'Not supplied'}</dd>
              <dt>Origin</dt>
              <dd>{p.origin ?? 'Not supplied'}</dd>
              <dt>Destination</dt>
              <dd>{p.destination ?? 'Not supplied'}</dd>
              <dt>Last location</dt>
              <dd className="row">
                <MapPin size={13} />
                {p.location ?? 'Not supplied'}
              </dd>
              <dt>Provider</dt>
              <dd>
                {p.providerId ?? 'Not connected'}
                {p.providerId === 'mock' ? ' · SYNTHETIC' : ''}
              </dd>
              <dt>Last successful sync</dt>
              <dd>{time(p.lastSuccessfulRefresh, language, true)}</dd>
              <dt>Last refresh attempt</dt>
              <dd>{time(p.lastRefreshAttempt, language, true)}</dd>
              <dt>Delivered at</dt>
              <dd>{time(p.deliveredAt, language, true)}</dd>
              <dt>Next scheduled refresh</dt>
              <dd>{p.nextRefreshAt ? time(p.nextRefreshAt, language) : 'Not scheduled'}</dd>
              <dt>Store</dt>
              <dd>{p.storeName || '—'}</dd>
              <dt>Order date</dt>
              <dd>{p.orderDate || '—'}</dd>
              <dt>Added</dt>
              <dd>{time(p.createdAt, language, true)}</dd>
            </dl>
            {p.tags.length > 0 && (
              <div className="tags">
                {p.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
          </section>
          <section className="panel notes-panel">
            <h2>{t.notes}</h2>
            <p className="preserve-lines">{p.notes || 'A place for the little details.'}</p>
          </section>
          <button className="text-link danger" onClick={() => void remove(p)}>
            <Trash2 size={15} />
            Delete parcel
          </button>
        </div>
      </div>
    </>
  );
}
