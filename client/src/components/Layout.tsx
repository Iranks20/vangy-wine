import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, ClipboardList, Factory, LayoutDashboard, LogOut, Menu, Plus, Receipt, Settings, ShoppingCart,
  Truck, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { cx } from './ui';

export const NAV: { to: string; label: string; icon: typeof Boxes }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sales', label: 'Sales', icon: ShoppingCart },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/production', label: 'Production', icon: Factory },
  { to: '/purchases', label: 'Purchases', icon: ClipboardList },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/employees', label: 'Employees', icon: UserCog },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? '#ffffff1a' : '#6b1d2f'} />
        <path d="M11 6h10c0 6-1.5 10-5 10s-5-4-5-10zm5 10v8m-4 2h8" stroke="#d4a64a" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className={cx('font-display text-lg font-bold', light ? 'text-white' : 'text-wine-800')}>Vangy Wine</p>
        <p className={cx('text-[11px] uppercase tracking-widest', light ? 'text-gold-300' : 'text-gold-500')}>Business Manager</p>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useStore();
  if (!user) return null;
  return (
    <div className="flex h-full flex-col bg-wine-900 text-wine-100">
      <div className="px-5 py-5"><Logo light /></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#d4a64a]' : 'text-wine-100/80 hover:bg-white/5 hover:text-white')}>
            <n.icon size={18} />{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="text-sm font-semibold text-white">{user.name}</p>
        <p className="text-xs text-wine-200">Administrator · full access</p>
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-gold-300 hover:text-gold-100"><LogOut size={16} />Sign out</button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, db } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  if (!user) return null;
  const quick = NAV.filter((n) => ['/', '/sales', '/inventory'].includes(n.to));

  return (
    <div className="min-h-full lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block no-print"><SideNav /></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <button className="absolute right-3 top-5 z-10 rounded p-1 text-white/80" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-ivory/90 px-4 py-3 backdrop-blur lg:px-8 no-print">
        <button className="rounded-lg p-1.5 text-wine-800 hover:bg-wine-50 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
        <div className="lg:hidden"><Logo /></div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-stone-500 md:inline">{db.settings.businessName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
        <Outlet />
      </main>

      {/* phone bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden no-print" aria-label="Quick">
        {quick.slice(0, 2).map((n) => <BottomLink key={n.to} {...n} />)}
        <button onClick={() => nav('/sales/new')} className="-mt-5 flex flex-col items-center justify-center" aria-label="New sale">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-wine-700 text-white shadow-lg ring-4 ring-ivory"><Plus /></span>
          <span className="mt-0.5 text-[11px] font-medium text-wine-700">New sale</span>
        </button>
        {quick.slice(2, 3).map((n) => <BottomLink key={n.to} {...n} />)}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center justify-center py-2 text-stone-500"><Menu size={20} /><span className="text-[11px]">More</span></button>
      </nav>
    </div>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Boxes }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('flex flex-col items-center justify-center py-2 text-[11px]', isActive ? 'text-wine-700 font-semibold' : 'text-stone-500')}>
      <Icon size={20} />{label}
    </NavLink>
  );
}
