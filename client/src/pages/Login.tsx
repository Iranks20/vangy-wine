import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useStore } from '../lib/store';
import { Logo } from '../components/Layout';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { db, login } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true); setError('');
    try { await login(username, password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-wine-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-wine-700/40" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-gold-400/10" />
        <Logo light />
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">Hibiscus Natural Sweet Red Wine — run the whole business from one place.</h1>
          <p className="mt-4 text-wine-100/80">Sales, stock, production batches, purchases, expenses and cash — all in step, on your laptop or phone.</p>
        </div>
        <p className="relative text-sm text-wine-200">{db.settings.businessName} · {db.settings.country}</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden"><Logo /></div>
          <div>
            <h2 className="font-display text-2xl font-bold text-wine-800">Sign in</h2>
            <p className="text-sm text-stone-500">Welcome back.</p>
          </div>
          <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}><Lock size={16} />{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </div>
    </div>
  );
}
