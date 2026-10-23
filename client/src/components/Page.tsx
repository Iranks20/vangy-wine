import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, type ApiKey } from '../lib/store';
import { Button } from './ui';

// Loads the records a page needs from the API each time the page is opened, so it always shows
// current data (including changes made on another device). Shows a loader only on the first visit.
export function Page({ needs, children }: { needs: ApiKey[]; children: ReactNode }) {
  const { refresh, loaded } = useStore();
  const { pathname } = useLocation();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = needs.join(',');

  useEffect(() => {
    if (!needs.length) return;
    setError('');
    refresh(...needs).catch((e) => setError((e as Error).message));
  }, [key, pathname, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = needs.every((k) => loaded.has(k));
  if (!ready && error) return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-red-600">{error}</p>
      <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
    </div>
  );
  if (!ready) return <div className="py-16 text-center text-sm text-stone-500">Loading…</div>;
  return <>{children}</>;
}
