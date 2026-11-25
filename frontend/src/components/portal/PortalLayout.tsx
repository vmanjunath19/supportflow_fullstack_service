import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  PlusCircle,
  Search,
  X,
} from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';

const navItems = [
  { to: '/', label: 'Help Center', icon: Home, end: true },
  { to: '/tickets/new', label: 'Submit Request', icon: PlusCircle, end: false },
  { to: '/tickets', label: 'My Tickets', icon: Search, end: true },
];

export function PortalLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      isActive
        ? 'bg-indigo-50 text-indigo-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <a
        href="#portal-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Top Responsive Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base sm:text-lg">
              SupportFlow <span className="text-indigo-600">Portal</span>
            </span>
          </Link>

          {/* Tablet & Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Portal Navigation">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
            <div className="mx-2 h-5 w-px bg-slate-200" aria-hidden="true" />
            <Link
              to="/workspace"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
              <span>Agent Workspace</span>
            </Link>
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-portal-nav"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <nav
            id="mobile-portal-nav"
            aria-label="Mobile Portal Navigation"
            className="border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-md md:hidden"
          >
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
            <div className="my-2 border-t border-slate-100" />
            <Link
              to="/workspace"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Switch to Agent Workspace</span>
            </Link>
          </nav>
        )}
      </header>

      {/* Responsive Main Container */}
      <main
        id="portal-main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 focus:outline-none"
      >
        <Breadcrumbs />
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <span>SupportFlow Self-Service Portal &bull; FastAPI + Supabase</span>
          <span>Need urgent help? Priority SLAs start at 1 hour.</span>
        </div>
      </footer>
    </div>
  );
}