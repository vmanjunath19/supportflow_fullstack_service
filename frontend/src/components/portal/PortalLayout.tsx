import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  PlusCircle,
  Search,
  X,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Help Center', icon: Home, end: true },
  { to: '/tickets/new', label: 'Submit Request', icon: PlusCircle, end: false },
  { to: '/tickets', label: 'My Tickets', icon: Search, end: true },
];

export function PortalLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
``
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Responsive Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <span className="text-base sm:text-lg">
              SupportFlow <span className="text-indigo-600">Portal</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Portal Navigation">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <div className="mx-2 h-5 w-px bg-slate-200" />
            <Link
              to="/workspace"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600" />
              Agent Workspace
            </Link>
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-3 space-y-1 md:hidden">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileMenuOpen(false)}
                className={linkClass}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <Link
              to="/workspace"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              <LayoutDashboard className="h-4 w-4" />
              Switch to Agent Workspace
            </Link>
          </nav>
        )}
      </header>

      {/* Main Content Shell */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        SupportFlow Self-Service Portal &bull; FastAPI + Supabase
      </footer>
    </div>
  );
}