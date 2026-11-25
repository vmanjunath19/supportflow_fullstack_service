import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Layers,
  Mail,
  PauseCircle,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { PriorityBadge, StatusBadge } from '../../components/TicketBadges';
import { Breadcrumbs } from '../../components/portal/Breadcrumbs';
import { EmptyState } from '../../components/portal/EmptyState';
import { TicketDetailSkeleton } from '../../components/portal/PortalSkeletons';
import { useTicketDetailQuery } from '../../hooks/useTickets';
import type { TicketEvent, TicketStatus } from '../../types/database';

const LIFECYCLE_STAGES: {
  status: TicketStatus;
  label: string;
  description: string;
}[] = [
  { status: 'New', label: 'Submitted', description: 'Logged in queue' },
  { status: 'Triaged', label: 'Triaged', description: 'Routed & prioritized' },
  { status: 'In Progress', label: 'In Progress', description: 'Engineer investigating' },
  { status: 'Resolved', label: 'Resolved', description: 'Fix verified' },
  { status: 'Closed', label: 'Closed', description: 'Ticket archived' },
];

const STAGE_ORDER: Record<TicketStatus, number> = {
  New: 0,
  Triaged: 1,
  'In Progress': 2,
  Blocked: 2,
  Resolved: 3,
  Closed: 4,
};

function formatTicketId(num: number): string {
  return `INC-${String(num).padStart(4, '0')}`;
}

function formatDuration(totalSeconds: number): string {
  const abs = Math.abs(Math.floor(totalSeconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function getEventPresentation(evt: TicketEvent) {
  const type = evt.event_type.toUpperCase();

  if (type.includes('CREATE')) {
    return {
      title: 'Ticket Created',
      icon: PlusCircle,
      badgeClass: 'bg-sky-50 text-sky-700 ring-sky-600/20',
      dotClass: 'bg-sky-500',
    };
  }

  if (type.includes('TEAM') || type.includes('ASSIGN')) {
    return {
      title: 'Engineer / Team Assignment',
      icon: UserCheck,
      badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
      dotClass: 'bg-indigo-600',
    };
  }

  if (evt.new_state === 'Resolved' || evt.new_state === 'Closed') {
    return {
      title: `Ticket ${evt.new_state}`,
      icon: CheckCircle2,
      badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
      dotClass: 'bg-emerald-500',
    };
  }

  if (evt.new_state === 'Blocked') {
    return {
      title: 'Work Blocked / Awaiting Info',
      icon: PauseCircle,
      badgeClass: 'bg-rose-50 text-rose-700 ring-rose-600/20',
      dotClass: 'bg-rose-500',
    };
  }

  if (type.includes('STATUS') || type.includes('TRIAGE')) {
    return {
      title: evt.new_state === 'Triaged' ? 'Triaged & Prioritized' : 'Status Updated',
      icon: Wrench,
      badgeClass: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      dotClass: 'bg-amber-500',
    };
  }

  return {
    title: evt.event_type.replace(/_/g, ' '),
    icon: History,
    badgeClass: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    dotClass: 'bg-slate-500',
  };
}

export function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const {
    data: detail,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useTicketDetailQuery(ticketId);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <TicketDetailSkeleton />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={AlertCircle}
          title="Ticket could not be loaded"
          description={
            error instanceof Error
              ? error.message
              : 'The requested support ticket does not exist or may have been removed.'
          }
          actionLabel="Back to My Tickets"
          actionTo="/tickets"
        />
      </div>
    );
  }

  const { ticket, audit_events } = detail;
  const formattedId = formatTicketId(ticket.ticket_number);
  const currentStageIndex = STAGE_ORDER[ticket.status] ?? 0;
  const isBlocked = ticket.status === 'Blocked';
  const isTerminal = ticket.status === 'Resolved' || ticket.status === 'Closed';

  const dueMs = ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() : null;
  const remainingSeconds = dueMs !== null ? Math.floor((dueMs - nowMs) / 1000) : null;
  const isBreached = !isTerminal && remainingSeconds !== null && remainingSeconds < 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Help Center', to: '/' },
          {
            label: 'My Tickets',
            to: `/tickets?email=${encodeURIComponent(ticket.requester_email)}`,
          },
          { label: formattedId },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/tickets?email=${encodeURIComponent(ticket.requester_email)}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to My Tickets
        </Link>

        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-indigo-600' : ''}`}
            aria-hidden="true"
          />
          Refresh Status
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200/70">
                {formattedId}
              </span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              {ticket.title}
            </h1>
          </div>

          <div className="shrink-0">
            {isTerminal ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {ticket.resolved_at
                  ? `Resolved ${new Date(ticket.resolved_at).toLocaleDateString()}`
                  : 'Completed'}
              </span>
            ) : remainingSeconds !== null ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset tabular-nums ${
                  isBreached
                    ? 'bg-rose-50 text-rose-700 ring-rose-600/25'
                    : remainingSeconds <= 1800
                      ? 'bg-amber-50 text-amber-800 ring-amber-600/25'
                      : 'bg-slate-100 text-slate-700 ring-slate-500/20'
                }`}
              >
                {isBreached ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4" aria-hidden="true" />
                )}
                {isBreached
                  ? `SLA Breached (${formatDuration(remainingSeconds)} overdue)`
                  : `SLA Target: ${formatDuration(remainingSeconds)} left`}
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Current Progress State
            </h2>
            <span className="text-xs font-medium text-slate-600">
              Stage {currentStageIndex + 1} of {LIFECYCLE_STAGES.length}
            </span>
          </div>

          <ol
            aria-label="Ticket workflow stages"
            className="grid grid-cols-1 gap-3 sm:grid-cols-5"
          >
            {LIFECYCLE_STAGES.map((stage, idx) => {
              const isCompleted =
                idx < currentStageIndex || (idx === currentStageIndex && isTerminal);
              const isActive = idx === currentStageIndex && !isTerminal;

              return (
                <li
                  key={stage.status}
                  aria-current={isActive ? 'step' : undefined}
                  className={`relative rounded-xl border p-3 transition-colors ${
                    isActive
                      ? isBlocked
                        ? 'border-rose-300 bg-rose-50/70'
                        : 'border-indigo-600 bg-indigo-50/60'
                      : isCompleted
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50/50 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isCompleted
                          ? 'bg-emerald-600 text-white'
                          : isActive
                            ? isBlocked
                              ? 'bg-rose-600 text-white'
                              : 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{stage.label}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 pl-8">{stage.description}</p>
                </li>
              );
            })}
          </ol>

          {isBlocked && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900"
            >
              <PauseCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Progress Temporarily Blocked</p>
                <p className="mt-0.5 text-rose-800">
                  An engineer has flagged this request as blocked while awaiting additional information or upstream dependency resolution.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <FileText className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Request Details
            </h2>

            <dl className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Mail className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <dt className="text-slate-500">Requester</dt>
                  <dd className="font-medium text-slate-900 truncate">{ticket.requester_email}</dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Layers className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="font-medium text-slate-900">{ticket.category}</dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <UserCheck className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">Assigned Queue</dt>
                  <dd className="font-medium text-slate-900">
                    {ticket.support_teams?.name ?? 'Pending Triage Assignment'}
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">Created At</dt>
                  <dd className="font-medium text-slate-900">
                    {new Date(ticket.created_at).toLocaleString()}
                  </dd>
                </div>
              </div>

              {ticket.sla_due_at && (
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-slate-500">SLA Deadline</dt>
                    <dd className="font-medium text-slate-900">
                      {new Date(ticket.sla_due_at).toLocaleString()}
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Submitted Description
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </section>

          {ticket.resolution_notes && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 space-y-2">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Resolution Summary
              </h2>
              <p className="text-sm text-emerald-950 whitespace-pre-wrap leading-relaxed">
                {ticket.resolution_notes}
              </p>
            </section>
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              Complete Historical Timeline
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {audit_events.length} {audit_events.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {audit_events.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No historical events recorded for this ticket yet.
            </p>
          ) : (
            <ol className="relative border-l-2 border-slate-200 ml-3.5 space-y-6">
              {audit_events.map((evt) => {
                const presentation = getEventPresentation(evt);
                const EventIcon = presentation.icon;
                const notesInMeta =
                  evt.metadata && typeof evt.metadata.resolution_notes === 'string'
                    ? evt.metadata.resolution_notes
                    : null;

                return (
                  <li key={evt.id} className="ml-6">
                    <span
                      className={`absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${presentation.dotClass}`}
                    />

                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${presentation.badgeClass}`}
                        >
                          <EventIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {presentation.title}
                        </span>
                        <time
                          dateTime={evt.created_at}
                          className="text-xs text-slate-500"
                        >
                          {new Date(evt.created_at).toLocaleString()}
                        </time>
                      </div>

                      <p className="text-sm text-slate-800">
                        {evt.previous_state ? (
                          <>
                            Transitioned from{' '}
                            <span className="font-medium text-slate-600">
                              {evt.previous_state}
                            </span>{' '}
                            to{' '}
                            <span className="font-semibold text-slate-900">
                              {evt.new_state}
                            </span>
                          </>
                        ) : (
                          <>
                            Initialized with state{' '}
                            <span className="font-semibold text-slate-900">
                              {evt.new_state}
                            </span>
                          </>
                        )}
                      </p>

                      {notesInMeta && (
                        <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-emerald-800">Notes: </span>
                          {notesInMeta}
                        </div>
                      )}

                      <p className="text-xs text-slate-500">
                        Recorded by <span className="font-medium text-slate-700">{evt.actor}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export default TicketDetailPage;
