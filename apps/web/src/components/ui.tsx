import * as Dialog from '@radix-ui/react-dialog';
import { X, Package, CircleCheck, Truck, Clock3, CircleAlert, CircleHelp, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  carriers,
  statusLabels,
  statusLabelsId,
  type Status,
  type Parcel,
} from '../../../../packages/shared/src/index';
import { useHub } from './HubContext';
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'wide' : ''}`}
          aria-describedby={description ? 'modal-description' : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && <Dialog.Description id="modal-description">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  const Icon =
    status === 'DELIVERED'
      ? CircleCheck
      : ['EXCEPTION', 'DELIVERY_ATTEMPT_FAILED', 'RETURNING', 'RETURNED'].includes(status)
        ? CircleAlert
        : status === 'UNKNOWN'
          ? CircleHelp
          : status === 'PENDING'
            ? Clock3
            : Truck;
  return <Icon size={size} />;
}
export function StatusBadge({ status }: { status: Status }) {
  const { language } = useHub();
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {(language === 'id' ? statusLabelsId : statusLabels)[status]}
    </span>
  );
}
export function CarrierLogo({ code, large = false }: { code: string; large?: boolean }) {
  const c = carriers.find((c) => c.code === code);
  return (
    <span className={`carrier-logo ${large ? 'large' : ''}`} style={{ color: c?.color }}>
      {c?.short ?? <Package size={20} />}
    </span>
  );
}
export function time(value: string | null, language = 'en', full = false) {
  if (!value) return '—';
  return (
    new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-GB', {
      dateStyle: full ? 'medium' : 'short',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}
export function relative(value: string | null, language = 'en') {
  if (!value) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return language === 'id' ? 'Baru saja' : 'Just now';
  if (minutes < 60) return language === 'id' ? `${minutes} menit lalu` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === 'id' ? `${hours} jam lalu` : `${hours}h ago`;
  return language === 'id' ? `${Math.floor(hours / 24)} hari lalu` : `${Math.floor(hours / 24)}d ago`;
}
export function OfficialLink({ parcel }: { parcel: Parcel }) {
  const { language } = useHub();
  const c = carriers.find((c) => c.code === parcel.carrierCode);
  return c?.url ? (
    <a className="text-link" href={c.url} target="_blank" rel="noopener noreferrer">
      {language === 'id' ? 'Buka situs kurir' : 'Open courier website'} <ArrowUpRight size={15} />
    </a>
  ) : (
    <span className="muted small">Official tracking URL not verified</span>
  );
}
export function EmptyArt() {
  return (
    <div className="empty-art" aria-hidden="true">
      <div className="art-orbit" />
      <div className="art-dot one" />
      <div className="art-dot two" />
      <div className="art-package">
        <Package size={52} strokeWidth={1.25} />
      </div>
      <span className="art-check">
        <CircleCheck size={23} />
      </span>
      <span className="art-route">··········</span>
    </div>
  );
}
