import { useEffect, useState } from 'react';
import { ChevronDown, Info, Plus, ArrowRight, CopyCheck } from 'lucide-react';
import {
  carriers,
  parcelInput,
  suggestCarrier,
  duplicateKey,
  type Parcel,
} from '../../../../packages/shared/src/index';
import { Modal } from './ui';
import { useHub } from './HubContext';
import { saveParcel } from '../lib/offline';
export function ParcelForm({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Parcel;
}) {
  const { t, parcels, toast, reload, online } = useHub();
  const [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [values, setValues] = useState({
    trackingNumber: '',
    carrierCode: '',
    nickname: '',
    storeName: '',
    orderDate: '',
    notes: '',
    tags: '',
    trackingMode: 'auto',
    phoneVerification: '',
    providerTrackingId: '',
  });
  useEffect(() => {
    if (open) {
      setError('');
      setMore(!!existing);
      setValues(
        existing
          ? { ...existing, tags: existing.tags.join(', ') }
          : {
              trackingNumber: '',
              carrierCode: '',
              nickname: '',
              storeName: '',
              orderDate: '',
              notes: '',
              tags: '',
              trackingMode: 'auto',
              phoneVerification: '',
              providerTrackingId: '',
            },
      );
    }
  }, [open, existing]);
  function change(key: string, value: string) {
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(key === 'trackingNumber' && !v.carrierCode && suggestCarrier(value)
        ? { carrierCode: suggestCarrier(value)! }
        : {}),
    }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const result = parcelInput.safeParse({
      ...values,
      tags: values.tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    });
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    if (!existing && parcels.some((p) => duplicateKey(p) === duplicateKey(result.data))) {
      setError('This tracking number is already saved for this courier.');
      return;
    }
    setBusy(true);
    try {
      await saveParcel(result.data, existing);
      await reload();
      toast(online ? 'Parcel saved.' : 'Saved on this device. It will sync when the backend reconnects.');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit parcel' : t.add}
      description={existing ? 'Keep the little details together.' : t.intro}
    >
      <form onSubmit={submit} className="form">
        <div className="field">
          <label htmlFor="trackingNumber">
            {t.number} <span>*</span>
          </label>
          <input
            autoFocus
            id="trackingNumber"
            name="trackingNumber"
            value={values.trackingNumber}
            disabled={!!existing}
            onChange={(e) => change('trackingNumber', e.target.value.toUpperCase())}
            placeholder="e.g. JX1234567890"
            required
            minLength={4}
            maxLength={64}
          />
        </div>
        <div className="field">
          <label htmlFor="carrierCode">
            {t.courier} <span>*</span>
          </label>
          <select
            id="carrierCode"
            value={values.carrierCode}
            disabled={!!existing}
            onChange={(e) => change('carrierCode', e.target.value)}
            required
          >
            <option value="">Select a courier</option>
            {carriers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <small className="muted">Suggestions are hints. Confirm the courier on your receipt.</small>
        </div>
        <div className="field">
          <label htmlFor="nickname">
            {t.name} <span className="optional">optional</span>
          </label>
          <input
            id="nickname"
            value={values.nickname}
            onChange={(e) => change('nickname', e.target.value)}
            maxLength={100}
            placeholder="Something to look forward to"
          />
        </div>
        <div className="field">
          <label htmlFor="trackingMode">{t.mode}</label>
          <select
            id="trackingMode"
            value={values.trackingMode}
            onChange={(e) => change('trackingMode', e.target.value)}
          >
            <option value="auto">{t.auto}</option>
            <option value="manual">{t.manual}</option>
            <option value="mock">{t.mock}</option>
          </select>
        </div>
        {values.trackingMode === 'mock' ? (
          <div className="inline-note warning">
            <Info size={17} />
            Mock data is generated for development. It does not describe a real shipment.
          </div>
        ) : (
          <div className="inline-note">
            <Info size={17} />
            No API subscription? Your parcel is still saved. Use the official courier website anytime.
          </div>
        )}
        <button className="text-link disclosure" type="button" onClick={() => setMore(!more)}>
          More details <ChevronDown size={16} className={more ? 'rotate' : ''} />
        </button>
        {more && (
          <>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="storeName">{t.store}</label>
                <input
                  id="storeName"
                  value={values.storeName}
                  onChange={(e) => change('storeName', e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="orderDate">{t.order}</label>
                <input
                  id="orderDate"
                  type="date"
                  value={values.orderDate}
                  onChange={(e) => change('orderDate', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="tags">{t.tags}</label>
              <input
                id="tags"
                value={values.tags}
                onChange={(e) => change('tags', e.target.value)}
                placeholder="Personal, work, gifts"
              />
            </div>
            <div className="field">
              <label htmlFor="notes">{t.notes}</label>
              <textarea
                id="notes"
                value={values.notes}
                onChange={(e) => change('notes', e.target.value)}
                maxLength={5000}
                rows={3}
              />
            </div>
            <div className="field">
              <label htmlFor="phoneVerification">Recipient phone verification</label>
              <input
                id="phoneVerification"
                value={values.phoneVerification}
                onChange={(e) => change('phoneVerification', e.target.value)}
                inputMode="numeric"
                maxLength={15}
              />
              <small>
                RajaOngkir JNE: last 5 digits. Klik Resi ID Express: recipient phone number. Stored privately
                on your server.
              </small>
            </div>
            <div className="field">
              <label htmlFor="providerTrackingId">Biteship tracking ID</label>
              <input
                id="providerTrackingId"
                value={values.providerTrackingId}
                onChange={(e) => change('providerTrackingId', e.target.value)}
                maxLength={100}
              />
              <small>Only for shipments created through your Biteship account.</small>
            </div>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              'Saving…'
            ) : (
              <>
                <Plus size={17} />
                {t.save}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function BulkImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { parcels, t, toast, reload } = useHub();
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<
      { number: string; carrier: string; duplicate: boolean; error: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState('auto'),
    [error, setError] = useState('');
  function prepare() {
    const seen = new Set(parcels.map(duplicateKey));
    const rows = text
      .split(/[\r\n]+/)
      .filter((l) => l.trim())
      .slice(0, 100)
      .map((line) => {
        const [number, carrier] = line.trim().split(/[,;\t ]+/);
        const code =
          carriers.find((c) => c.code === carrier?.toLowerCase())?.code ?? suggestCarrier(number) ?? '';
        const key = `${code}:${number.toUpperCase()}`;
        const duplicate = seen.has(key);
        seen.add(key);
        return {
          number: number.toUpperCase(),
          carrier: code,
          duplicate,
          error: /^[A-Z0-9-]{4,64}$/i.test(number) ? '' : 'Invalid number',
        };
      });
    setPreview(rows);
  }
  function choose(index: number, carrier: string) {
    setPreview((rows) =>
      rows.map((r, i) =>
        i === index
          ? {
              ...r,
              carrier,
              duplicate:
                parcels.some((p) => p.trackingNumber === r.number && p.carrierCode === carrier) ||
                rows.some((p, j) => j < index && p.number === r.number && p.carrier === carrier),
            }
          : r,
      ),
    );
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      let count = 0;
      for (const r of preview) {
        if (r.duplicate) continue;
        await saveParcel(
          parcelInput.parse({ trackingNumber: r.number, carrierCode: r.carrier, trackingMode: mode }),
        );
        count++;
      }
      await reload();
      toast(`${count} parcels saved.`);
      setText('');
      setPreview([]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.bulk}
      description="One tracking number per line. Optionally add a courier code after a comma."
      wide
    >
      <div className="form">
        <textarea
          aria-label="Bulk tracking numbers"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview([]);
          }}
          placeholder={'JX1234567890,jnt\nSPXID123456789\n012345678901,jne'}
        />
        <small>Up to 100 parcels per import. Numbers with uncertain couriers need your selection.</small>
        <div className="row between">
          <select aria-label="Bulk tracking source" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">{t.auto}</option>
            <option value="manual">{t.manual}</option>
            <option value="mock">{t.mock}</option>
          </select>
          <button className="button secondary" disabled={!text.trim()} onClick={prepare}>
            Preview <ArrowRight size={16} />
          </button>
        </div>
        {preview.length > 0 && (
          <div className="import-preview">
            {preview.map((r, i) => (
              <div className="import-row" key={i}>
                <code>{r.number}</code>
                <select
                  aria-label={`Courier for ${r.number}`}
                  value={r.carrier}
                  onChange={(e) => choose(i, e.target.value)}
                >
                  <option value="">Select courier</option>
                  {carriers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className={r.duplicate ? 'muted' : 'green'}>
                  {r.error ||
                    (r.duplicate ? (
                      'Duplicate · skipped'
                    ) : !r.carrier ? (
                      'Needs courier'
                    ) : (
                      <>
                        <CopyCheck size={14} /> Ready
                      </>
                    ))}
                </span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="button secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !preview.length ||
              preview.some((r) => !r.duplicate && (!r.carrier || r.error)) ||
              preview.every((r) => r.duplicate)
            }
            onClick={() => void submit()}
          >
            {busy ? 'Importing…' : 'Import parcels'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
