import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { Empty, cx } from './ui';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number; // used for sorting & searching
  align?: 'right';
  hideOnMobile?: boolean;
}

// Searchable, sortable, paginated table. On phones each row becomes a card.
export function DataTable<T>({ rows, columns, onRowClick, pageSize = 12, searchPlaceholder = 'Search…', toolbar, emptyText, initialSort }: {
  rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; pageSize?: number; searchPlaceholder?: string;
  toolbar?: ReactNode; emptyText?: string; initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key] as string | number) ?? '';

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = s ? rows.filter((r) => columns.some((c) => String(val(c, r)).toLowerCase().includes(s))) : rows;
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) out = [...out].sort((a, b) => {
        const va = val(c, a), vb = val(c, b);
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
      });
    }
    return out;
  }, [rows, q, sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, p * pageSize + pageSize);
  const toggle = (k: string) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-stone-100 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input className="input pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search table" />
        </div>
        {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
      </div>

      {!shown.length ? <Empty title="Nothing to show" text={q ? 'No records match your search.' : emptyText} /> : (
        <>
          {/* desktop / tablet */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={cx('px-4 py-2.5 font-medium', c.align === 'right' && 'text-right')}>
                      <button className="inline-flex items-center gap-1 hover:text-charcoal" onClick={() => toggle(c.key)}>
                        {c.label}
                        {sort?.key === c.key && (sort.dir === 1 ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {shown.map((r, i) => (
                  <tr key={i} onClick={() => onRowClick?.(r)} className={cx(onRowClick && 'cursor-pointer hover:bg-wine-50/50')}>
                    {columns.map((c) => (
                      <td key={c.key} className={cx('px-4 py-2.5 align-middle', c.align === 'right' && 'text-right tabular-nums')}>
                        {c.render ? c.render(r) : String(val(c, r))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phone */}
          <ul className="divide-y divide-stone-100 md:hidden">
            {shown.map((r, i) => (
              <li key={i} onClick={() => onRowClick?.(r)} className={cx('space-y-1 px-4 py-3', onRowClick && 'active:bg-wine-50')}>
                {columns.filter((c) => !c.hideOnMobile).map((c, j) => (
                  <div key={c.key} className={cx('flex justify-between gap-3 text-sm', j === 0 && 'font-semibold')}>
                    {j > 0 && <span className="text-stone-500">{c.label}</span>}
                    <span className={cx(j > 0 && 'text-right')}>{c.render ? c.render(r) : String(val(c, r))}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-sm text-stone-500">
        <span>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1">
          <button className="rounded p-1.5 hover:bg-stone-100 disabled:opacity-30" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span>{p + 1} / {pages}</span>
          <button className="rounded p-1.5 hover:bg-stone-100 disabled:opacity-30" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
