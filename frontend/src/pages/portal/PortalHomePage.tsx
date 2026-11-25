import { Link } from 'react-router-dom';
import { ArrowRight, Clock, PlusCircle, Search, ShieldCheck } from 'lucide-react';

export function PortalHomePage() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 py-12 text-white shadow-md sm:px-12">
        <div className="max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> 24/7 Incident &amp; Access Support
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How can we help you today?
          </h1>
          <p className="text-indigo-100 text-base sm:text-lg">
            Submit a new support request with automatic SLA routing or track real-time
            updates on your existing tickets.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/tickets/new"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Submit a Ticket
            </Link>
            <Link
              to="/tickets"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/40 border border-white/25 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500/60 transition"
            >
              <Search className="h-4 w-4" />
              Track My Tickets
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/tickets/new"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow transition"
        >
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <PlusCircle className="h-5 w-5" />
          </div>
          <h2 className="font-semibold text-slate-900 group-hover:text-indigo-600 flex items-center gap-1">
            Report an Issue <ArrowRight className="h-4 w-4" />
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Log software bugs, network outages, or IAM access requests directly to the engineering queue.
          </p>
        </Link>

        <Link
          to="/tickets"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow transition"
        >
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Search className="h-5 w-5" />
          </div>
          <h2 className="font-semibold text-slate-900 group-hover:text-indigo-600 flex items-center gap-1">
            Check Ticket Status <ArrowRight className="h-4 w-4" />
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Look up your tickets by email, monitor SLA deadlines, and review resolution notes.
          </p>
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
          <h2 className="font-semibold text-slate-900">SLA Response Targets</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li><span className="font-medium text-rose-600">Urgent:</span> 1 hour target</li>
            <li><span className="font-medium text-amber-600">High:</span> 4 hours target</li>
            <li><span className="font-medium text-indigo-600">Medium:</span> 24 hours target</li>
            <li><span className="font-medium text-slate-700">Low:</span> 72 hours target</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
