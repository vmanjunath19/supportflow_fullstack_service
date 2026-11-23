import type { TicketPriority, TicketStatus } from '../types/database';

const STATUS_STYLES: Record<TicketStatus, { badge: string; dot: string }> = {
  New: {
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    dot: 'bg-sky-500',
  },
  Triaged: {
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    dot: 'bg-indigo-500',
  },
  'In Progress': {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  Blocked: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    dot: 'bg-rose-500',
  },
  Resolved: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  Closed: {
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  Urgent: 'bg-red-100 text-red-800 ring-red-600/30 font-semibold',
  High: 'bg-orange-50 text-orange-700 ring-orange-600/25 font-medium',
  Medium: 'bg-blue-50 text-blue-700 ring-blue-600/20 font-medium',
  Low: 'bg-slate-100 text-slate-600 ring-slate-500/20 font-normal',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.New;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Medium;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ring-1 ring-inset whitespace-nowrap ${style}`}
    >
      {priority}
    </span>
  );
}