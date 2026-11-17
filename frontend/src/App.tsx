import { useState } from 'react';
import {
  Inbox,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
  Plus,
} from 'lucide-react';
import type { UserRole } from './types/database';

export function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('Support Engineer');
  const [activeNav, setActiveNav] = useState<'all' | 'urgent' | 'sla' | 'resolved'>('all');

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

        <div className="flex items-center gap-4">
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
        <aside className="w-60 bg-white border-r border-slate-200 p-4 hidden md:flex flex-col justify-between">
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveNav('all')}
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
              onClick={() => setActiveNav('urgent')}
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
              onClick={() => setActiveNav('sla')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeNav === 'sla'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              SLA At-Risk / Breached
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('resolved')}
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
            <p className="font-medium text-slate-700">Environment: Local Dev</p>
            <p className="mt-0.5">Schema: 4 tables active</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Incident Queue</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Viewing workspace as <span className="font-medium text-slate-700">{activeRole}</span>
              </p>
            </div>
          </div>

          {/* Placeholder Queue Shell ready for Supabase data */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <p className="text-sm font-medium text-slate-800">
              SupportFlow Engineer Shell Initialized
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Ready to bind live ticket queue from Supabase PostgreSQL.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;