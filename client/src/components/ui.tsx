import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, X, XCircle } from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const variants: Record<Variant, string> = {
  primary: 'bg-wine-700 text-white hover:bg-wine-800 shadow-sm',
  secondary: 'bg-white text-charcoal border border-stone-300 hover:bg-stone-50',
  ghost: 'text-wine-700 hover:bg-wine-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  gold: 'bg-gold-400 text-wine-900 hover:bg-gold-300',
};

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        variants[variant], className,
      )}
    />
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-stone-200 bg-white shadow-sm', className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          <h2 className="font-semibold text-charcoal">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  wine: 'bg-wine-50 text-wine-700 ring-wine-200',
  gray: 'bg-stone-100 text-stone-600 ring-stone-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export type Tone = keyof typeof tones;
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold text-wine-800 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'wine', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'wine' | 'gold' | 'green' | 'red' | 'gray'; icon?: ReactNode }) {
  const bar = { wine: 'bg-wine-700', gold: 'bg-gold-400', green: 'bg-emerald-500', red: 'bg-red-500', gray: 'bg-stone-400' }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <span className={cx('absolute inset-y-0 left-0 w-1', bar)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
        {icon && <span className="text-stone-400">{icon}</span>}
      </div>
      <p className="mt-1.5 text-lg font-bold leading-tight text-charcoal sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx('input', p.className)} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('input', p.className)}>{children}</select>;

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4 no-print" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-wine-800">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Inbox className="text-stone-300" size={40} />
      <p className="font-medium text-stone-700">{title}</p>
      {text && <p className="max-w-sm text-sm text-stone-500">{text}</p>}
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-stone-100 p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition', value === t.id ? 'bg-white text-wine-700 shadow-sm' : 'text-stone-600 hover:text-charcoal')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- toasts & confirm ----------
type Toast = { id: number; kind: 'success' | 'error'; text: string };
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void; confirm: (o: ConfirmOpts) => Promise<string | false> } | null>(null);
type ConfirmOpts = { title: string; text: string; confirmLabel?: string; danger?: boolean; reason?: boolean };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: string | false) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const api = {
    success: (t: string) => push('success', t),
    error: (t: string) => push('error', t),
    confirm: (o: ConfirmOpts) => new Promise<string | false>((resolve) => { setReason(''); setDlg({ ...o, resolve }); }),
  };
  const close = (v: string | false) => { dlg?.resolve(v); setDlg(null); };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 no-print">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600')}>
            {t.kind === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}{t.text}
          </div>
        ))}
      </div>
      <Modal open={!!dlg} onClose={() => close(false)} title={dlg?.title ?? ''}
        footer={<>
          <Button variant="secondary" onClick={() => close(false)}>Go back</Button>
          <Button variant={dlg?.danger ? 'danger' : 'primary'} disabled={dlg?.reason && !reason.trim()} onClick={() => close(reason || 'ok')}>{dlg?.confirmLabel ?? 'Confirm'}</Button>
        </>}>
        <div className="flex gap-3">
          {dlg?.danger && <AlertTriangle className="shrink-0 text-red-500" />}
          <p className="text-sm text-stone-600">{dlg?.text}</p>
        </div>
        {dlg?.reason && <Field label="Reason (required)" className="mt-4"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>}
      </Modal>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast outside provider');
  return c;
}
// Runs an action and shows success / error. Returns true on success.
export function useRun() {
  const t = useToast();
  return async (fn: () => unknown, ok: string) => {
    try { await fn(); if (ok) t.success(ok); return true; } catch (e) { t.error((e as Error).message); return false; }
  };
}
