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
import { supabase } from './lib/supabase';
import type { Ticket, TicketPriority, TicketStatus, UserRole } from './types/database';
import {
  TicketTable,
  type SortDirection,
  type SortField,
} from './components/TicketTable';
import {
  TicketFilterBar,
  type TicketFilters,
} from './components/TicketFilterBar';

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

  const [filters, setFilters] = useState<TicketFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>('ticket_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  async function fetchTickets() {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('tickets')
      .select('*, support_teams(name)')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTickets((data as Ticket[]) ?? []);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    fetchTickets();
  }, []);

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
        return tickets.filter(
          (t) =>
            (t.priority === 'Urgent' || t.priority === 'High') &&
            t.status !== 'Resolved' &&
            t.status !== 'Closed'
        );
      case 'sla':
        return tickets.filter(
          (t) =>
            t.status !== 'Resolved' &&
            t.status !== 'Closed' &&
            t.sla_due_at !== null &&
            new Date(t.sla_due_at).getTime() < now
        );
      case 'resolved':
        return tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed');
      case 'all':
      default:
        return tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed');
    }
  }, [tickets, activeNav]);

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
              onChange={(e) => setActiveRole(e.target.value as UserRole)}
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
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeNav === 'all'
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeNav === 'urgent'
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeNav === 'sla'
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeNav === 'resolved'
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

          <TicketTable
            tickets={visibleTickets}
            isLoading={isLoading}
            error={error}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        </main>
      </div>
    </div>
  );
}

export default App;