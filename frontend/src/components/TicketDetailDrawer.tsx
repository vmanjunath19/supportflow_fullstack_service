import { useEffect, useState } from 'react';
import {
  X,
  Clock,
  UserCheck,
  Mail,
  Calendar,
  Tag,
  CheckCircle2,
  AlertCircle,
  History,
  ArrowRight,
  Save,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  SupportTeam,
  Ticket,
  TicketEvent,
  TicketStatus,
  UserRole,
} from '../types/database';
import { PriorityBadge, StatusBadge } from './TicketBadges';

interface TicketDetailDrawerProps {
  ticket: Ticket | null;
  activeRole: UserRole;
  teams: SupportTeam[];
  onClose: () => void;
  onTicketUpdated: (updated: Ticket) => void;
}

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  New: ['Triaged', 'In Progress'],
  Triaged: ['In Progress', 'Blocked'],
  'In Progress': ['Blocked', 'Resolved'],
  Blocked: ['In Progress', 'Resolved'],
  Resolved: ['Closed', 'In Progress'],
  Closed: ['In Progress'],
};

const TRANSITION_BUTTON_STYLES: Record<TicketStatus, string> = {
  New: 'bg-sky-600 hover:bg-sky-700 text-white',
  Triaged: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  'In Progress': 'bg-amber-600 hover:bg-amber-700 text-white',
  Blocked: 'bg-rose-600 hover:bg-rose-700 text-white',
  Resolved: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  Closed: 'bg-slate-700 hover:bg-slate-800 text-white',
};

function formatTicketId(num: number): string {
  return `INC-${String(num).padStart(4, '0')}`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketDetailDrawer({
  ticket,
  activeRole,
  teams,
  onClose,
  onTicketUpdated,
}: TicketDetailDrawerProps) {
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Sync local form state whenever a different ticket is opened
  useEffect(() => {
    if (!ticket) return;
    setResolutionNotes(ticket.resolution_notes ?? '');
    setSelectedTeamId(ticket.team_id ?? '');
    setActionError(null);
    setActionSuccess(null);
    fetchTicketEvents(ticket.id);
  }, [ticket?.id]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!ticket) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isUpdating) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ticket, isUpdating, onClose]);

  async function fetchTicketEvents(ticketId: string) {
    setIsLoadingEvents(true);
    const { data } = await supabase
      .from('ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    setEvents((data as TicketEvent[]) ?? []);
    setIsLoadingEvents(false);
  }

  if (!ticket) return null;

  const isTerminalState = ticket.status === 'Resolved' || ticket.status === 'Closed';
  const isSlaBreached =
    !isTerminalState &&
    ticket.sla_due_at !== null &&
    new Date(ticket.sla_due_at).getTime() < Date.now();

  const availableTransitions = VALID_TRANSITIONS[ticket.status] ?? [];
  const actorLabel =
    activeRole === 'Admin/Manager'
      ? 'admin.manager@supportflow.local'
      : activeRole === 'Support Engineer'
        ? 'support.engineer@supportflow.local'
        : ticket.requester_email;

  async function handleTeamChange(newTeamId: string) {
    if (!ticket) return;
    setSelectedTeamId(newTeamId);
    setActionError(null);
    setActionSuccess(null);
    setIsUpdating(true);

    const normalizedTeamId = newTeamId === '' ? null : newTeamId;
    const prevTeamName = ticket.support_teams?.name ?? 'Unassigned';
    const nextTeamObj = teams.find((t) => t.id === normalizedTeamId) ?? null;
    const nextTeamName = nextTeamObj?.name ?? 'Unassigned';

    // Automatically advance 'New' -> 'Triaged' when assigning a team
    const nextStatus: TicketStatus =
      ticket.status === 'New' && normalizedTeamId !== null ? 'Triaged' : ticket.status;

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('tickets')
      .update({
        team_id: normalizedTeamId,
        status: nextStatus,
        updated_at: nowIso,
      })
      .eq('id', ticket.id)
      .select('*, support_teams(name)')
      .single();

    if (error) {
      setActionError(error.message);
      setIsUpdating(false);
      return;
    }

    await supabase.from('ticket_events').insert({
      ticket_id: ticket.id,
      actor: actorLabel,
      event_type: 'TEAM_REASSIGNED',
      previous_state: prevTeamName,
      new_state: nextTeamName,
      metadata: {
        role: activeRole,
        auto_triaged: ticket.status === 'New' && nextStatus === 'Triaged',
      },
    });

    onTicketUpdated(data as Ticket);
    await fetchTicketEvents(ticket.id);
    setActionSuccess(`Assigned to ${nextTeamName}`);
    setIsUpdating(false);
  }

  async function handleStatusTransition(nextStatus: TicketStatus) {
    if (!ticket) return;
    setActionError(null);
    setActionSuccess(null);

    const trimmedNotes = resolutionNotes.trim();
    const requiresResolutionNotes = nextStatus === 'Resolved' || nextStatus === 'Closed';

    // Enforce DB constraint (chk_resolution_notes) before sending request
    if (requiresResolutionNotes && trimmedNotes.length === 0) {
      setActionError(
        `Resolution notes are required before marking a ticket as "${nextStatus}".`
      );
      return;
    }

    setIsUpdating(true);
    const nowIso = new Date().toISOString();
    const resolvedAtValue = requiresResolutionNotes
      ? ticket.resolved_at ?? nowIso
      : null;

    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: nextStatus,
        resolution_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        resolved_at: resolvedAtValue,
        updated_at: nowIso,
      })
      .eq('id', ticket.id)
      .select('*, support_teams(name)')
      .single();

    if (error) {
      setActionError(error.message);
      setIsUpdating(false);
      return;
    }

    await supabase.from('ticket_events').insert({
      ticket_id: ticket.id,
      actor: actorLabel,
      event_type: 'STATUS_CHANGE',
      previous_state: ticket.status,
      new_state: nextStatus,
      metadata: {
        role: activeRole,
        ...(trimmedNotes ? { resolution_notes: trimmedNotes } : {}),
      },
    });

    onTicketUpdated(data as Ticket);
    await fetchTicketEvents(ticket.id);
    setActionSuccess(`Ticket moved to ${nextStatus}`);
    setIsUpdating(false);
  }

  async function handleSaveNotesOnly() {
    if (!ticket) return;
    setActionError(null);
    setActionSuccess(null);

    const trimmedNotes = resolutionNotes.trim();
    if (isTerminalState && trimmedNotes.length === 0) {
      setActionError('Resolved or Closed tickets cannot have empty resolution notes.');
      return;
    }

    setIsUpdating(true);
    const { data, error } = await supabase
      .from('tickets')
      .update({
        resolution_notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id)
      .select('*, support_teams(name)')
      .single();

    if (error) {
      setActionError(error.message);
      setIsUpdating(false);
      return;
    }

    onTicketUpdated(data as Ticket);
    setActionSuccess('Resolution notes saved');
    setIsUpdating(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-ticket-title"
      onClick={() => !isUpdating && onClose()}
    >
      <div
        className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/70">
                {formatTicketId(ticket.ticket_number)}
              </span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {isSlaBreached && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                  <Clock className="w-3 h-3" />
                  SLA Breached
                </span>
              )}
            </div>
            <h2
              id="drawer-ticket-title"
              className="text-base font-semibold text-slate-900 leading-snug"
            >
              {ticket.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            aria-label="Close ticket details"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Feedback Banners */}
          {actionError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {actionSuccess && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-medium text-emerald-800"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Incident Description
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </div>
          </section>

          {/* Metadata Grid */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
              Ticket Metadata
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <dt className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Requester
                </dt>
                <dd className="font-medium text-slate-900 truncate">{ticket.requester_email}</dd>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <dt className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  Category
                </dt>
                <dd className="font-medium text-slate-900">{ticket.category}</dd>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <dt className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Created
                </dt>
                <dd className="font-medium text-slate-900">
                  {formatTimestamp(ticket.created_at)}
                </dd>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <dt className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  SLA Target Deadline
                </dt>
                <dd
                  className={`font-medium ${
                    isSlaBreached ? 'text-rose-600 font-semibold' : 'text-slate-900'
                  }`}
                >
                  {formatTimestamp(ticket.sla_due_at)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Assigned Support Team Selector */}
          <section>
            <label
              htmlFor="drawer-team-select"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
              Assigned Support Team
            </label>
            <select
              id="drawer-team-select"
              value={selectedTeamId}
              disabled={isUpdating || activeRole === 'End-User'}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 cursor-pointer"
            >
              <option value="">Unassigned</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </section>

          {/* Resolution Notes Input */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="drawer-resolution-notes"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Resolution Notes
              </label>
              <span className="text-[11px] text-slate-400">
                Required to Resolve or Close
              </span>
            </div>
            <textarea
              id="drawer-resolution-notes"
              rows={3}
              value={resolutionNotes}
              disabled={isUpdating || activeRole === 'End-User'}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Document root cause, troubleshooting steps, and fix verification..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100"
            />
            {activeRole !== 'End-User' && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNotesOnly}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Notes
                </button>
              </div>
            )}
          </section>

          {/* Status Transition Actions */}
          <section className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Workflow Status Transitions
            </h3>

            {activeRole === 'End-User' ? (
              <p className="text-xs text-slate-500">
                Switch role to <strong>Support Engineer</strong> or{' '}
                <strong>Admin/Manager</strong> in the top bar to execute status transitions.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                {availableTransitions.map((targetStatus) => (
                  <button
                    key={targetStatus}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleStatusTransition(targetStatus)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${TRANSITION_BUTTON_STYLES[targetStatus]}`}
                  >
                    <span>Move to {targetStatus}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Immutable Audit Timeline (ticket_events) */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              <History className="w-3.5 h-3.5 text-slate-400" />
              Audit Trail ({events.length})
            </h3>

            {isLoadingEvents ? (
              <p className="text-xs text-slate-400">Loading activity history...</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-400">No recorded audit events yet.</p>
            ) : (
              <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                {events.map((evt) => (
                  <li key={evt.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800">{evt.event_type}</span>
                      <time className="text-[11px] text-slate-400">
                        {formatTimestamp(evt.created_at)}
                      </time>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {evt.previous_state ? (
                        <>
                          <span className="font-medium">{evt.previous_state}</span> →{' '}
                          <span className="font-medium text-slate-900">{evt.new_state}</span>
                        </>
                      ) : (
                        <>
                          Initialized as{' '}
                          <span className="font-medium text-slate-900">{evt.new_state}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">by {evt.actor}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}