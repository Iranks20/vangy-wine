import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { methodLabel, ugx } from '../lib/format';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, cx, useToast } from '../components/ui';
import type { Method } from '../lib/types';

type Line = { itemId: number; qty: number; price: number; discount: number };

export default function NewSale() {
  const { db, user, addSale } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const products = db.items.filter((i) => i.category === 'finished');

  const [customerId, setCustomerId] = useState<number | ''>('');
  const [salesperson, setSalesperson] = useState(user!.name);
  const [walkName, setWalkName] = useState('');
  const [walkPhone, setWalkPhone] = useState('');
  const [lines, setLines] = useState<Line[]>([{ itemId: products[0]?.id, qty: 1, price: products[0]?.price ?? 0, discount: 0 }]);
  const [method, setMethod] = useState<Method | 'credit'>('cash');
  const [paidInput, setPaidInput] = useState<string | null>(null);
  const [delivery, setDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });

  const total = lines.reduce((t, l) => t + l.qty * l.price - l.discount, 0);
  const paid = method === 'credit' ? 0 : paidInput === null ? total : Number(paidInput) || 0;
  const balance = total - paid;
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    try {
      const cust = db.customers.find((c) => c.id === customerId);
      const sale = await addSale({
        salesperson, customerId: cust?.id, customerName: cust?.name ?? walkName, customerPhone: cust?.phone ?? walkPhone,
        lines, paid, method, delivery, notes, date: new Date(date).toISOString(),
      });
      toast.success(`Sale ${sale.invoice} saved`);
      nav(`/sales/${sale.id}`, { replace: true });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="New sale" subtitle="Stock is reduced automatically when you save." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Customer">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Registered customer" className="sm:col-span-2">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Walk-in customer (cash sale)</option>
                  {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.location}</option>)}
                </Select>
              </Field>
              {!customerId && <>
                <Field label="Name (optional)"><Input value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="Walk-in customer" /></Field>
                <Field label="Phone (optional)"><Input value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} inputMode="tel" /></Field>
              </>}
              <Field label="Date & time"><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Sold by">
                <Select value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
                  <option value={user!.name}>{user!.name} (me)</option>
                  {db.employees.filter((e) => e.active && e.name !== user!.name).map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Products" action={<Button size="sm" variant="ghost" onClick={() => setLines([...lines, { itemId: products[0].id, qty: 1, price: products[0].price, discount: 0 }])}><Plus size={16} />Add line</Button>}>
            <div className="space-y-3">
              {lines.map((l, i) => {
                const it = db.items.find((x) => x.id === l.itemId)!;
                const short = l.qty > it.qty;
                return (
                  <div key={i} className="rounded-lg border border-stone-200 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                      <Field label="Product" className="col-span-2 sm:col-span-5">
                        <Select value={l.itemId} onChange={(e) => { const p = products.find((x) => x.id === Number(e.target.value))!; update(i, { itemId: p.id, price: p.price }); }}>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Qty" className="sm:col-span-2"><Input type="number" min={1} inputMode="numeric" value={l.qty || ''} onChange={(e) => update(i, { qty: Math.max(0, Number(e.target.value)) })} /></Field>
                      <Field label="Unit price" className="sm:col-span-2"><Input type="number" inputMode="numeric" value={l.price} onChange={(e) => update(i, { price: Math.max(0, Number(e.target.value)) })} /></Field>
                      <Field label="Discount" className="sm:col-span-2"><Input type="number" min={0} inputMode="numeric" value={l.discount || ''} placeholder="0" onChange={(e) => update(i, { discount: Math.max(0, Number(e.target.value)) })} /></Field>
                      <div className="flex items-end justify-end sm:col-span-1">
                        <button disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-lg p-2.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remove line"><Trash2 size={18} /></button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className={cx('flex items-center gap-1', short ? 'font-medium text-red-600' : 'text-stone-500')}>
                        {short && <AlertTriangle size={14} />}{it.qty} {it.unit}s in stock
                      </span>
                      <span className="font-semibold">{ugx(l.qty * l.price - l.discount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Delivery & notes">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Delivery details"><Textarea value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Address, rider, time…" /></Field>
              <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card title="Payment">
            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'mobile_money', 'bank', 'credit'] as const).map((m) => (
                <button key={m} onClick={() => { setMethod(m); setPaidInput(null); }}
                  className={cx('rounded-lg border px-3 py-2.5 text-sm font-medium transition', method === m ? 'border-wine-700 bg-wine-700 text-white' : 'border-stone-300 hover:bg-stone-50')}>
                  {methodLabel[m]}
                </button>
              ))}
            </div>
            {method !== 'credit' && (
              <Field label="Amount paid now" className="mt-4" hint="Lower it for a part-payment.">
                <Input type="number" inputMode="numeric" value={paidInput ?? total} onChange={(e) => setPaidInput(e.target.value)} />
              </Field>
            )}
            <dl className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd>{ugx(lines.reduce((t, l) => t + l.qty * l.price, 0))}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">Discounts</dt><dd>− {ugx(lines.reduce((t, l) => t + l.discount, 0))}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total payable</dt><dd>{ugx(total)}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Paid now</dt><dd>{ugx(paid)}</dd></div>
              <div className={cx('flex justify-between font-semibold', balance > 0 ? 'text-red-600' : 'text-stone-500')}><dt>Balance (credit)</dt><dd>{ugx(balance)}</dd></div>
            </dl>
            {balance > 0 && !customerId && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Choose a registered customer to sell on credit or take a part-payment.</p>}
            <Button className="mt-4 w-full" onClick={save} disabled={total <= 0}>Save sale</Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => nav(-1)}>Cancel</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
