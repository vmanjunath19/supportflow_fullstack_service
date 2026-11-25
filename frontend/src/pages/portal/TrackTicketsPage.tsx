import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  PlusCircle,
  RefreshCw,
  Search,
  Ticket as TicketIcon,
  X,
} from 'lucide-react';
import { PriorityBadge, StatusBadge } from '../../components/TicketBadges';
import { EmptyState } from '../../components/portal/EmptyState';
import {
  TicketDetailSkeleton,
  TicketListSkeleton,
} from '../../components/portal/PortalSkeletons';
import type { Ticket, TicketEvent, TicketStatus } from '../../types/database';

interface TicketDetailPayload {
  ticket: Ticket;
  sla: {
    sla_due_at: string | null;
    is_breached: boolean;
    remaining_seconds: number | null;
  };
  audit_events: TicketEvent[];
}

type TicketBucketTab = 'open' | 'resolved' | 'all';

const TERMINAL_STATUSES: ReadonlySet<TicketStatus> = new Set(['Resolved', 'Closed']);

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

function SlaCountdownBadge({
  ticket,
  nowMs,
}: {
  ticket: Ticket;
  nowMs: number;
}) {
  if (TERMINAL_STATUSES.has(ticket.status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {ticket.resolved_at
            ? `Resolved ${new Date(ticket.resolved_at).toLocaleDateString()}`
            : 'Completed'}
        </span>
      </span>
    );
  }

  if (!ticket.sla_due_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>No SLA target</span>
      </span>
    );
  }

  const dueMs = new Date(ticket.sla_due_at).getTime();
  const remainingSeconds = Math.floor((dueMs - nowMs) / 1000);

  if (remainingSeconds < 0) {
    return (
      <span
        title={`SLA deadline passed at ${new Date(dueMs).toLocaleString()}`}
        className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/25 tabular-nums"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>SLA Breached ({formatDuration(remainingSeconds)} overdue)</span>
      </span>
    );
  }

  const isWarning = remainingSeconds <= 1800; // <= 30 minutes
  return (
    <span
      title={`Target due: ${new Date(dueMs).toLocaleString()}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset tabular-nums ${
        isWarning
          ? 'bg-amber-50 text-amber-800 ring-amber-600/25 font-semibold'
          : 'bg-slate-100 text-slate-700 ring-slate-500/20'
      }`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>SLA: {formatDuration(remainingSeconds)} left</span>
    </span>
  );
}

export function TrackTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeEmail = searchParams.get('email') ?? '';

  const [emailFilter, setEmailFilter] = useState(activeEmail);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<TicketBucketTab>('open');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [selectedDetail, setSelectedDetail] = useState<TicketDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 1-second ticker for live SLA countdowns
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setEmailFilter(activeEmail);
  }, [activeEmail]);

  const fetchTickets = useCallback(
    async (email: string, { silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ limit: '50' });
        if (email.trim()) {
          params.set('requester_email', email.trim());
        }
        const res = await fetch(`/api/tickets?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to load tickets.');
        }
        setTickets(data.items ?? []);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Unable to load tickets.');
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchTickets(activeEmail);
  }, [activeEmail, fetchTickets]);

  // Real-time background status polling every 20 seconds
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchTickets(activeEmail, { silent: true });
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [activeEmail, fetchTickets]);

  async function openTicketDetail(ticketId: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.ok) {
        const data = (await res.json()) as TicketDetailPayload;
        setSelectedDetail(data);
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (!selectedDetail) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedDetail(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDetail]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (emailFilter.trim()) {
      setSearchParams({ email: emailFilter.trim() });
    } else {
      setSearchParams({});
    }
  }

  const openTickets = useMemo(
    () => tickets.filter((t) => !TERMINAL_STATUSES.has(t.status)),
    [tickets]
  );

  const resolvedTickets = useMemo(
    () => tickets.filter((t) => TERMINAL_STATUSES.has(t.status)),
    [tickets]
  );

  const visibleTickets = useMemo(() => {
    const base =
      activeTab === 'open'
        ? openTickets
        : activeTab === 'resolved'
          ? resolvedTickets
          : tickets;

    const q = searchQuery.trim().toLowerCase();

    return base.filter((ticket) => {
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;
      if (!q) return true;

      const formattedId = `inc-${String(ticket.ticket_number).padStart(4, '0')}`;
      return (
        formattedId.includes(q) ||
        String(ticket.ticket_number).includes(q) ||
        ticket.title.toLowerCase().includes(q) ||
        ticket.description.toLowerCase().includes(q) ||
        ticket.category.toLowerCase().includes(q) ||
        ticket.requester_email.toLowerCase().includes(q)
      );
    });
  }, [activeTab, openTickets, resolvedTickets, tickets, searchQuery, statusFilter]);

  const hasLocalFilters = searchQuery.trim() !== '' || statusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Header & Requester Email Lookup */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">My Tickets</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Status
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Track open requests, live SLA countdowns, and resolved support history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex flex-1 sm:flex-initial gap-2">
            <input
              type="email"
              aria-label="Filter by requester email"
              placeholder="Filter by requester email..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer shrink-0"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Lookup
            </button>
          </form>

          <button
            type="button"
            onClick={() => fetchTickets(activeEmail, { silent: true })}
            title="Refresh ticket statuses"
            aria-label="Refresh ticket statuses"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`}
              aria-hidden="true"
            />
          </button>

          <Link
            to="/tickets/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            New Ticket
          </Link>
        </div>
      </div>

      {/* Open / Resolved Tabs + Keyword Search & Status Filter */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Ticket status groups"
            className="inline-flex rounded-lg bg-slate-100 p-1 self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'open'}
              onClick={() => {
                setActiveTab('open');
                setStatusFilter('ALL');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'open'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Open</span>
              <span className="rounded-full bg-indigo-50 px-1.5 py-0.2 text-[11px] text-indigo-700">
                {openTickets.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'resolved'}
              onClick={() => {
                setActiveTab('resolved');
                setStatusFilter('ALL');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'resolved'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Resolved</span>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[11px] text-emerald-700">
                {resolvedTickets.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => {
                setActiveTab('all');
                setStatusFilter('ALL');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All</span>
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[11px] text-slate-700">
                {tickets.length}
              </span>
            </button>
          </div>

          <div className="flex flex-1 sm:max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search tickets by ID, title, or category"
                placeholder="Search ID, subject, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs sm:text-sm focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'ALL')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="New">New</option>
              <option value="Triaged">Triaged</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ticket List / Skeleton / Empty States */}
      {loading ? (
        <TicketListSkeleton count={4} />
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </div>
      ) : visibleTickets.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title={
            hasLocalFilters
              ? 'No matching tickets found'
              : activeTab === 'open'
                ? 'No open tickets'
                : activeTab === 'resolved'
                  ? 'No resolved tickets yet'
                  : 'No tickets found'
          }
          description={
            hasLocalFilters
              ? 'Try clearing your keyword search or status filter to view all tickets in this tab.'
              : activeEmail
                ? `No support requests matched "${activeEmail}". Check the address or submit a new request.`
                : 'There are no support tickets to display yet. Submit a new request to get started.'
          }
          actionLabel={hasLocalFilters ? 'Clear Search & Filters' : 'Submit a Request'}
          actionTo={hasLocalFilters ? undefined : '/tickets/new'}
          onAction={
            hasLocalFilters
              ? () => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }
              : undefined
          }
          secondaryAction={
            activeEmail ? (
              <button
                type="button"
                onClick={() => {
                  setEmailFilter('');
                  setSearchParams({});
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Clear Filter
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleTickets.map((ticket) => (
            <article
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => openTicketDetail(ticket.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openTicketDetail(ticket.id);
                }
              }}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-indigo-600">
                      INC-{String(ticket.ticket_number).padStart(4, '0')}
                    </span>
                    <span aria-hidden="true">&bull;</span>
                    <span className="font-medium text-slate-700">{ticket.category}</span>
                    <span aria-hidden="true">&bull;</span>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {ticket.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <SlaCountdownBadge ticket={ticket} nowMs={nowMs} />
                  <StatusBadge status={ticket.status} />
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{ticket.description}</p>

              {ticket.resolution_notes && (
                <div className="mt-3 rounded-lg bg-emerald-50/70 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-900">
                  <span className="font-semibold">Resolution:</span> {ticket.resolution_notes}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>Requester: {ticket.requester_email}</span>
                <span>
                  Opened {new Date(ticket.created_at).toLocaleString()} &bull; Click for timeline
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Ticket Timeline & Detail Modal */}
      {(loadingDetail || selectedDetail) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ticket timeline details"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail && !selectedDetail ? (
              <TicketDetailSkeleton />
            ) : (
              selectedDetail && (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-indigo-600">
                          INC-{String(selectedDetail.ticket.ticket_number).padStart(4, '0')}
                        </span>
                        <StatusBadge status={selectedDetail.ticket.status} />
                        <PriorityBadge priority={selectedDetail.ticket.priority} />
                      </div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {selectedDetail.ticket.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      aria-label="Close ticket details"
                      onClick={() => setSelectedDetail(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-xs">
                    <span className="text-slate-600">
                      Category: <strong>{selectedDetail.ticket.category}</strong>
                    </span>
                    <SlaCountdownBadge ticket={selectedDetail.ticket} nowMs={nowMs} />
                  </div>

                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {selectedDetail.ticket.description}
                  </p>

                  {selectedDetail.ticket.resolution_notes && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <p className="font-semibold mb-0.5">Resolution Notes</p>
                      <p>{selectedDetail.ticket.resolution_notes}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      Activity Timeline ({selectedDetail.audit_events.length})
                    </h3>
                    <ol className="relative border-l border-slate-200 ml-2 space-y-3">
                      {selectedDetail.audit_events.map((evt) => (
                        <li key={evt.id} className="ml-4 text-xs">
                          <span className="absolute -left-1.5 mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="font-semibold text-slate-800">{evt.event_type}</span>
                            <span>{new Date(evt.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-slate-600 mt-0.5">
                            {evt.previous_state
                              ? `${evt.previous_state} → ${evt.new_state}`
                              : `Created as ${evt.new_state}`}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}