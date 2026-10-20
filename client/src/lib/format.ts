export const ugx = (n: number) => 'UGX ' + Math.round(n).toLocaleString('en-UG');
export const num = (n: number, d = 0) => n.toLocaleString('en-UG', { maximumFractionDigits: d });
export const shortUgx = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
};
export const fmtDate = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const today = () => new Date().toISOString().slice(0, 10);
export const methodLabel: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile money', bank: 'Bank', credit: 'Credit' };
export const customerTypeLabel: Record<string, string> = {
  retail: 'Retail', wholesaler: 'Wholesaler', bar: 'Bar', restaurant: 'Restaurant', hotel: 'Hotel',
  event_planner: 'Event planner', other: 'Other',
};
export const categoryLabel: Record<string, string> = { finished: 'Finished product', raw: 'Raw material', packaging: 'Packaging', other: 'Other' };

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
