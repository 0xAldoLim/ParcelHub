import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck, Info, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { carriers, type Usage as UsageType } from '../../../../packages/shared/src/index';
import { useHub } from '../components/HubContext';
import { CarrierLogo, StatusIcon, relative } from '../components/ui';
import { api } from '../lib/offline';
export function Couriers() {
  const { providers, t } = useHub();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACROSS THE ARCHIPELAGO</div>
          <h1>{t.carriers}</h1>
          <p>Know exactly how each courier connects.</p>
        </div>
        <Link to="/settings" className="button secondary">
          Configure providers
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="inline-note">
        <Info size={18} />
        An SDK or documented endpoint verifies the integration contract. Only a successful real request
        verifies tracking for your account. Mock support never counts as live tracking.
      </div>
      <div className="courier-grid">
        {carriers.map((c) => {
          const configured = providers.filter(
              (p) => p.id !== 'mock' && p.id !== 'manual' && p.configured && p.couriers.includes(c.code),
            ),
            eligible = configured
              .filter((p) => p.enabled && !p.disabledReason && p.externalTracking)
              .sort((a, b) => a.priority - b.priority);
          const status = eligible.length
            ? 'Active API provider'
            : configured.length
              ? 'Another configured provider'
              : c.url
                ? 'Manual tracking available'
                : 'Integration not verified';
          return (
            <article className="panel courier-card" key={c.code}>
              <CarrierLogo code={c.code} />
              <h2>{c.name}</h2>
              <span className={`capability ${eligible.length ? 'ready' : ''}`}>{status}</span>
              <p>
                {eligible[0]?.name ??
                  (configured.length
                    ? configured.map((p) => p.name).join(', ')
                    : 'No eligible live API connected')}
              </p>
              <small className="muted">
                {eligible.length
                  ? 'Account credentials present. Live courier tracking requires a successful request.'
                  : c.url
                    ? 'Copy your number and enter it on the official tracking page.'
                    : 'Store this number and configure a verified provider. Official tracking URL has not been verified.'}
              </small>
              {c.url && (
                <a className="text-link" href={c.url} target="_blank" rel="noopener noreferrer">
                  Official tracking <ExternalLink size={14} />
                </a>
              )}
            </article>
          );
        })}
      </div>
      <div className="inline-note">
        <ShieldCheck size={18} />
        Biteship requires a Biteship-generated tracking ID. Phone verification and other courier restrictions
        are respected.
      </div>
    </>
  );
}
const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    value,
  );
export function Usage() {
  const { settings, online, t } = useHub();
  const query = useQuery({
    queryKey: ['usage'],
    queryFn: () => api<UsageType>('/usage'),
    enabled: online,
    refetchInterval: 30000,
  });
  const u = query.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NO SURPRISES</div>
          <h1>{t.usage}</h1>
          <p>A clear view of every request.</p>
        </div>
        <span className={`api-state ${settings.allowPaid ? 'enabled' : ''}`}>
          <span />
          {settings.allowPaid ? 'Real API calls enabled' : 'Real API calls disabled'}
        </span>
      </div>
      <div className="usage-stats">
        {[
          { label: 'Requests today', value: u?.today ?? '—', sub: `Daily limit: ${settings.dailyCap}` },
          {
            label: 'Requests this month',
            value: u?.month ?? '—',
            sub: `Monthly limit: ${settings.monthlyCap}`,
          },
          {
            label: 'Estimated spend',
            value: u ? rupiah(u.estimatedCost) : '—',
            sub: `Maximum: ${rupiah(settings.monthlyBudget)}`,
          },
          {
            label: 'Remaining budget',
            value: u ? rupiah(u.budgetRemaining) : '—',
            sub: 'Estimated · not provider billing',
          },
        ].map((s) => (
          <div className="panel" key={s.label}>
            <span className="muted small">{s.label}</span>
            <h2>{s.value}</h2>
            <small className="muted">{s.sub}</small>
          </div>
        ))}
      </div>
      <section className="panel usage-panel">
        <div className="section-heading">
          <h2>Requests by provider</h2>
          <span className="small muted">Current UTC calendar month</span>
        </div>
        {u ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Requests</th>
                  <th>Successful</th>
                  <th>Failed</th>
                  <th>Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {u.byProvider.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.id}
                      {p.id === 'mock' && <span className="synthetic"> · Synthetic</span>}
                    </td>
                    <td>{p.requests}</td>
                    <td>{p.success}</td>
                    <td>{p.failed}</td>
                    <td>{rupiah(p.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            {online ? 'Loading usage…' : 'Connect to your backend to view request usage.'}
          </p>
        )}
        <div className="usage-footer">
          <span>
            {u?.success ?? 0} successful · {u?.failed ?? 0} failed ·{' '}
            {(u?.month ?? 0) - (u?.success ?? 0) - (u?.failed ?? 0)} in flight
          </span>
          <Link className="text-link" to="/settings">
            Manage budgets
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </section>
      <div className="inline-note">
        <Info size={18} />
        <div>
          <strong>Estimates, with room for caution.</strong>
          <p>
            Costs use your configured IDR price per request. Reservations, fallback attempts, and interrupted
            requests count toward caps. Klik Resi HTTP failures do not accrue estimated charges. Provider
            invoices and subscription fees may differ.
          </p>
        </div>
      </div>
    </>
  );
}
export function Activity() {
  const { notices, t, language } = useHub();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE LITTLE UPDATES</div>
          <h1>{t.activity}</h1>
          <p>Meaningful changes, without the noise.</p>
        </div>
      </div>
      <section className="panel">
        {notices.length ? (
          notices.map((n) => (
            <Link key={n.id} to={`/parcels/${n.parcelId}`} className="activity-item full-activity">
              <span className="activity-icon">
                <StatusIcon status={n.status} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>
                  {n.status.replaceAll('_', ' ').toLowerCase()}
                  {n.synthetic ? ' · Synthetic data' : ''}
                </p>
                <small>{relative(n.createdAt, language)}</small>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))
        ) : (
          <div className="empty-state compact-empty">
            <h2>{t.quiet}</h2>
            <p>{t.quietBody}</p>
          </div>
        )}
      </section>
    </>
  );
}
