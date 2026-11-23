import { useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  filterTicketsForRole,
  getRolePermissions,
} from './lib/rbac';
import { supabase } from './lib/supabase';
import type {
  SupportTeam,
  Ticket,
  TicketPriority,
  TicketStatus,
  UserRole,
} from './types/database';
import {
  TicketTable,
  type SortDirection,
  type SortField,
} from './components/TicketTable';
import {
  TicketFilterBar,
  type TicketFilters,
} from './components/TicketFilterBar';
// Add import at the top of frontend/src/App.tsx:
import { CreateTicketModal } from './components/CreateTicketModal';
import { TicketDetailDrawer } from './components/TicketDetailDrawer';

type NavFilter = 'all' | 'urgent' | 'sla' | 'resolved';

const DEFAULT_FILTERS: TicketFilters = {
  search: '',
  status: 'ALL',
  priority: 'ALL',
  category: 'ALL',
};

const PRIORITY_RANK: Record<TicketPriority, number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const STATUS_RANK: Record<TicketStatus, number> = {
  New: 1,
  Triaged: 2,
  'In Progress': 3,
  Blocked: 4,
  Resolved: 5,
  Closed: 6,
};

export function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('Support Engineer');
  const [activeNav, setActiveNav] = useState<NavFilter>('all');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [filters, setFilters] = useState<TicketFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>('ticket_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [teams, setTeams] = useState<SupportTeam[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const permissions = useMemo(() => getRolePermissions(activeRole), [activeRole]);

  const roleScopedTickets = useMemo(
    () => filterTicketsForRole(tickets, activeRole),
    [tickets, activeRole]
  );

  const slaBreachedCount = useMemo(() => {
    const now = Date.now();
    return tickets.filter(
      (t) =>
        t.status !== 'Resolved' &&
        t.status !== 'Closed' &&
        t.sla_due_at !== null &&
        new Date(t.sla_due_at).getTime() < now
    ).length;
  }, [tickets]);

  function handleTicketDeleted(ticketId: string) {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    setSelectedTicket(null);
    setToastMessage('Ticket permanently deleted by Admin/Manager');
  }

  async function fetchTickets() {
    console.log('1. fetchTickets entered');
    setIsLoading(true);
    setError(null);

    try {
      console.log('2. Calling Supabase for tickets and teams...', supabase);
      const [ticketsRes, teamsRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('*, support_teams(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('support_teams')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);

      console.log('3. Supabase responses:', { ticketsRes, teamsRes });

      if (ticketsRes.error) {
        setError(ticketsRes.error.message);
      } else {
        setTickets((ticketsRes.data as Ticket[]) ?? []);
      }

      if (teamsRes.error) {
        console.error('Failed to fetch teams:', teamsRes.error.message);
      } else if (teamsRes.data) {
        setTeams(teamsRes.data as SupportTeam[]);
      }
    } catch (err) {
      console.error('Caught error in fetchTickets:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tickets.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const deepLinkedTicketId = params.get('ticket');
    if (deepLinkedTicketId) {
      const match = tickets.find((t) => t.id === deepLinkedTicketId);
      if (match) {
        setSelectedTicket(match);
      }
    }
  }, [tickets]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  function handleRoleChange(nextRole: UserRole) {
    setActiveRole(nextRole);
    const nextPermissions = getRolePermissions(nextRole);
    if (!nextPermissions.canViewAllTickets && (activeNav === 'urgent' || activeNav === 'sla')) {
      setActiveNav('all');
    }
  }

  async function handleAssignTeam(ticket: Ticket, newTeamId: string) {
    const normalizedTeamId = newTeamId === '' ? null : newTeamId;
    if (ticket.team_id === normalizedTeamId) return;

    setAssigningTicketId(ticket.id);
    setError(null);

    const prevTeamName = ticket.support_teams?.name ?? 'Unassigned';
    const nextTeamObj = teams.find((t) => t.id === normalizedTeamId) ?? null;
    const nextTeamName = nextTeamObj?.name ?? 'Unassigned';

    // Auto-advance 'New' tickets to 'Triaged' upon initial team routing
    const nextStatus: TicketStatus =
      ticket.status === 'New' && normalizedTeamId !== null ? 'Triaged' : ticket.status;

    const nowIso = new Date().toISOString();
    const actorLabel =
      activeRole === 'Admin/Manager'
        ? 'admin.manager@supportflow.local'
        : 'support.engineer@supportflow.local';

    const { data, error: updateError } = await supabase
      .from('tickets')
      .update({
        team_id: normalizedTeamId,
        status: nextStatus,
        updated_at: nowIso,
      })
      .eq('id', ticket.id)
      .select('*, support_teams(name)')
      .single();

    if (updateError) {
      setError(`Failed to assign team: ${updateError.message}`);
      setAssigningTicketId(null);
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

    const updatedTicket = data as Ticket;
    handleTicketUpdated(updatedTicket);

    const formattedId = `INC-${String(ticket.ticket_number).padStart(4, '0')}`;
    setToastMessage(
      normalizedTeamId
        ? `${formattedId} assigned to ${nextTeamName}`
        : `${formattedId} unassigned`
    );
    setAssigningTicketId(null);
  }

  function handleTicketUpdated(updatedTicket: Ticket) {
    setTickets((prev) =>
      prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
    );
    setSelectedTicket(updatedTicket);
  }

  function handleSortChange(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'priority' ? 'desc' : 'asc');
    }
  }

  // 1. Base tickets scoped by Sidebar navigation view
  const navScopedTickets = useMemo(() => {
    const now = Date.now();
    switch (activeNav) {
      case 'urgent':
        return roleScopedTickets.filter(
          (t) =>
            (t.priority === 'Urgent' || t.priority === 'High') &&
            t.status !== 'Resolved' &&
            t.status !== 'Closed'
        );
      case 'sla':
        return roleScopedTickets.filter(
          (t) =>
            t.status !== 'Resolved' &&
            t.status !== 'Closed' &&
            t.sla_due_at !== null &&
            new Date(t.sla_due_at).getTime() < now
        );
      case 'resolved':
        return roleScopedTickets.filter(
          (t) => t.status === 'Resolved' || t.status === 'Closed'
        );
      case 'all':
      default:
        return roleScopedTickets.filter(
          (t) => t.status !== 'Resolved' && t.status !== 'Closed'
        );
    }
  }, [roleScopedTickets, activeNav]);

  // 2. Apply real-time search, dropdown filters, and column sorting
  const visibleTickets = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    const filtered = navScopedTickets.filter((ticket) => {
      if (filters.status !== 'ALL' && ticket.status !== filters.status) return false;
      if (filters.priority !== 'ALL' && ticket.priority !== filters.priority) return false;
      if (filters.category !== 'ALL' && ticket.category !== filters.category) return false;

      if (query) {
        const formattedId = `inc-${String(ticket.ticket_number).padStart(4, '0')}`;
        const teamName = (ticket.support_teams?.name ?? 'unassigned').toLowerCase();
        const matchesQuery =
          formattedId.includes(query) ||
          String(ticket.ticket_number).includes(query) ||
          ticket.title.toLowerCase().includes(query) ||
          ticket.description.toLowerCase().includes(query) ||
          ticket.requester_email.toLowerCase().includes(query) ||
          teamName.includes(query);

        if (!matchesQuery) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'ticket_number':
          comparison = a.ticket_number - b.ticket_number;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          break;
        case 'priority':
          comparison = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'team': {
          const teamA = a.support_teams?.name ?? 'zzz_Unassigned';
          const teamB = b.support_teams?.name ?? 'zzz_Unassigned';
          comparison = teamA.localeCompare(teamB);
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [navScopedTickets, filters, sortField, sortDirection]);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'ALL' ||
    filters.priority !== 'ALL' ||
    filters.category !== 'ALL';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm">
            SF
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900">
              SupportFlow Workspace
            </h1>
            <p className="text-xs text-slate-500">IT Incident Triage &amp; SLA Queue</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Role Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <Shield className="w-4 h-4 text-indigo-600" />
            <label htmlFor="role-select" className="text-xs font-medium text-slate-600">
              Role:
            </label>
            <select
              id="role-select"
              value={activeRole}
              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="End-User">End-User</option>
              <option value="Support Engineer">Support Engineer</option>
              <option value="Admin/Manager">Admin/Manager</option>
            </select>
          </div>

          <button
            type="button"
            onClick={fetchTickets}
            title="Refresh queue"
            aria-label="Refresh queue"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer">
            <Plus className="w-4 h-4" />
            New Ticket
          </button>
        </div>
      </header>

      {/* Workspace Body */}
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <aside className="w-60 bg-white border-r border-slate-200 p-4 hidden md:flex flex-col justify-between shrink-0">
          <nav className="space-y-1" aria-label="Ticket Queue Views">
            <button
              type="button"
              onClick={() => {
                setActiveNav('all');
                setFilters(DEFAULT_FILTERS);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${activeNav === 'all'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <Inbox className="w-4 h-4" />
              All Active Tickets
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveNav('urgent');
                setFilters(DEFAULT_FILTERS);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${activeNav === 'urgent'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Urgent &amp; High Priority
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveNav('sla');
                setFilters(DEFAULT_FILTERS);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${activeNav === 'sla'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <Layers className="w-4 h-4" />
              SLA Breached
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveNav('resolved');
                setFilters(DEFAULT_FILTERS);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${activeNav === 'resolved'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Resolved &amp; Closed
            </button>
          </nav>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <p className="font-medium text-slate-700">Total Seeded: {tickets.length}</p>
            <p className="mt-0.5">Displayed: {visibleTickets.length} tickets</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Incident Queue</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Viewing as <span className="font-medium text-slate-700">{activeRole}</span>
              </p>
            </div>
          </div>

          <TicketFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            totalCount={navScopedTickets.length}
            filteredCount={visibleTickets.length}
          />

          {permissions.canViewSlaGovernance && slaBreachedCount > 0 && (
            <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                    Admin SLA Governance Alert
                  </h2>
                  <p className="text-xs text-rose-800 mt-0.5">
                    <strong>{slaBreachedCount}</strong> active{' '}
                    {slaBreachedCount === 1 ? 'incident has' : 'incidents have'} breached
                    target SLA resolution thresholds and require immediate escalation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('sla')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
              >
                Inspect Breached Queue
              </button>
            </div>
          )}

          <TicketTable
            tickets={visibleTickets}
            teams={teams}
            permissions={permissions}
            assigningTicketId={assigningTicketId}
            isLoading={isLoading}
            error={error}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            onSelectTicket={setSelectedTicket}
            onAssignTeam={handleAssignTeam}
          />
        </main>
      </div>

      #new ticket create modal
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTicketCreated={fetchTickets}
      />

      #for ticket details
      <TicketDetailDrawer
        ticket={selectedTicket}
        permissions={permissions}
        teams={teams}
        onClose={() => setSelectedTicket(null)}
        onTicketUpdated={handleTicketUpdated}
        onTicketDeleted={handleTicketDeleted}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-700"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;