// Formatting helpers used by the web app and by server-generated reports.
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

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const under1000 = (n: number) => {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; if (n) parts.push('and'); }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  else if (n) parts.push(ONES[n]);
  return parts.join(' ');
};
// 430000 -> "Four hundred and thirty thousand Uganda Shillings only"
export function amountInWords(amount: number) {
  let n = Math.round(Math.abs(amount));
  if (!n) return 'Zero Uganda Shillings only';
  const scale = ['', 'thousand', 'million', 'billion'];
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const c = n % 1000;
    if (c) parts.unshift(under1000(c) + (scale[i] ? ` ${scale[i]}` : ''));
  }
  const s = parts.join(' ');
  return s[0].toUpperCase() + s.slice(1) + ' Uganda Shillings only';
}
