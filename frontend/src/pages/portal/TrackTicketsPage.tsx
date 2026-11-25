import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, History, Loader2, Search, Ticket as TicketIcon, X } from 'lucide-react';
import { PriorityBadge, StatusBadge } from '../../components/TicketBadges';
import type { Ticket, TicketEvent } from '../../types/database';

interface TicketDetailPayload {
  ticket: Ticket;
  sla: {
    sla_due_at: string | null;
    is_breached: boolean;
    remaining_seconds: number | null;
  };
  audit_events: TicketEvent[];
}

export function TrackTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [emailFilter, setEmailFilter] = useState(searchParams.get('email') ?? '');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<TicketDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function fetchTickets(email: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '25' });
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
      setError(err instanceof Error ? err.message : 'Unable to load tickets.');
    } finally {
      setLoading(false);
    }
  }

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
    fetchTickets(searchParams.get('email') ?? '');
  }, [searchParams]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (emailFilter.trim()) {
      setSearchParams({ email: emailFilter.trim() });
    } else {
      setSearchParams({});
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track status transitions, SLA due times, and resolution updates.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex w-full gap-2 sm:w-auto">
          <input
            type="email"
            placeholder="Filter by requester email..."
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="w-full sm:w-72 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
          >
            <Search className="h-4 w-4" />
            Filter
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Loading tickets...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">No tickets found</h2>
          <p className="mt-1 text-sm text-slate-500">
            No support requests matched your filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => openTicketDetail(ticket.id)}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 cursor-pointer"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">
                      INC-{String(ticket.ticket_number).padStart(4, '0')}
                    </span>
                    <span>&bull;</span>
                    <span>{ticket.category}</span>
                    <span>&bull;</span>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-slate-900">{ticket.title}</h3>
                </div>

                <StatusBadge status={ticket.status} />
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{ticket.description}</p>

              {ticket.resolution_notes && (
                <div className="mt-3 rounded-lg bg-emerald-50/70 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-900">
                  <span className="font-semibold">Resolution:</span> {ticket.resolution_notes}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>Requester: {ticket.requester_email}</span>
                {ticket.sla_due_at && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    SLA Due: {new Date(ticket.sla_due_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(loadingDetail || selectedDetail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail && !selectedDetail ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
                Loading ticket timeline...
              </div>
            ) : (
              selectedDetail && (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
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
                      onClick={() => setSelectedDetail(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
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
                      <History className="h-3.5 w-3.5" />
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
