// Demonstration data only — generated relative to today so the demo always looks current.
import type { Batch, CashEntry, Customer, Db, Employee, Expense, Item, Method, Movement, Purchase, Sale, Supplier } from './types';

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const int = (lo: number, hi: number) => Math.floor(lo + rand() * (hi - lo + 1));

const daysAgo = (d: number, hour = 10) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(hour, int(0, 59), 0, 0);
  return t.toISOString();
};
const dayOnly = (iso: string) => iso.slice(0, 10);

export const EXPENSE_CATEGORIES = [
  'Transport and delivery', 'Salaries and wages', 'Rent', 'Utilities', 'Marketing and advertising',
  'Packaging', 'Repairs and maintenance', 'Licences and compliance', 'Communications', 'Other operating expenses',
];

export const INVOICE_DEFAULTS = {
  tin: '', bankName: '', accountName: 'Vangy Wine Company Limited', accountNo: '', mobileMoney: '',
  invoiceTerms: 'Payment is due by the date shown. Please quote the invoice number when paying. Goods once sold are only returnable under our returns policy.',
};

export function buildDemoDb(): Db {
  seed = 42;
  const items: Item[] = [
    { id: 1, code: 'FG-750', name: 'Vangy Natural Sweet Red Wine 750ml', category: 'finished', unit: 'bottle', price: 10000, cost: 5200, qty: 0, min: 100, location: 'Main store', lots: [] },
    { id: 2, code: 'FG-1500', name: 'Vangy Natural Sweet Red Wine 1.5L', category: 'finished', unit: 'bottle', price: 18000, cost: 9800, qty: 0, min: 40, location: 'Main store', lots: [] },
    { id: 3, code: 'FG-BULK20', name: 'Bulk Wine — 20L jerrycan', category: 'finished', unit: 'jerrycan', price: 180000, cost: 96000, qty: 0, min: 2, location: 'Cellar', lots: [] },
    { id: 4, code: 'RM-HIB', name: 'Hibiscus flowers (dried)', category: 'raw', unit: 'kg', price: 0, cost: 12000, qty: 38, min: 20, location: 'Raw store', lots: [] },
    { id: 5, code: 'RM-SUG', name: 'Sugar', category: 'raw', unit: 'kg', price: 0, cost: 4200, qty: 135, min: 100, location: 'Raw store', lots: [] },
    { id: 6, code: 'RM-YST', name: 'Wine yeast', category: 'raw', unit: 'sachet', price: 0, cost: 3500, qty: 12, min: 20, location: 'Raw store', lots: [] },
    { id: 7, code: 'RM-CIT', name: 'Citric acid', category: 'raw', unit: 'kg', price: 0, cost: 9000, qty: 6, min: 3, location: 'Raw store', lots: [] },
    { id: 8, code: 'PK-B750', name: 'Glass bottles 750ml', category: 'packaging', unit: 'pcs', price: 0, cost: 900, qty: 820, min: 500, location: 'Packaging store', lots: [] },
    { id: 9, code: 'PK-B1500', name: 'Glass bottles 1.5L', category: 'packaging', unit: 'pcs', price: 0, cost: 1500, qty: 130, min: 150, location: 'Packaging store', lots: [] },
    { id: 10, code: 'PK-CAP', name: 'Bottle caps / corks', category: 'packaging', unit: 'pcs', price: 0, cost: 150, qty: 1240, min: 500, location: 'Packaging store', lots: [] },
    { id: 11, code: 'PK-LBL', name: 'Labels', category: 'packaging', unit: 'pcs', price: 0, cost: 200, qty: 380, min: 500, location: 'Packaging store', lots: [] },
    { id: 12, code: 'PK-CTN', name: 'Cartons (12 x 750ml)', category: 'packaging', unit: 'pcs', price: 0, cost: 2500, qty: 45, min: 30, location: 'Packaging store', lots: [] },
  ];
  // Finished goods lots (batch traceability + expiry)
  const lot = (id: number, lotNo: string, mfgAgo: number, shelfDays: number, qty: number) => {
    const mfg = dayOnly(daysAgo(mfgAgo));
    const exp = new Date(mfg); exp.setDate(exp.getDate() + shelfDays);
    const it = items.find((i) => i.id === id)!;
    it.lots.push({ lotNo, mfg, expiry: dayOnly(exp.toISOString()), qty });
    it.qty += qty;
  };
  lot(1, 'B-2026-001', 330, 365, 46);
  lot(1, 'B-2026-003', 120, 365, 168);
  lot(1, 'B-2026-004', 40, 365, 126);
  lot(2, 'B-2026-003', 120, 365, 18);
  lot(2, 'B-2026-004', 40, 365, 44);
  lot(3, 'B-2026-004', 40, 180, 4);

  const customers: Customer[] = [
    { id: 1, name: 'Nile View Hotel', phone: '0772 410 223', type: 'hotel', location: 'Jinja', terms: 30, notes: 'Orders monthly for restaurant & rooms.' },
    { id: 2, name: 'Mama Grace Bar', phone: '0701 554 018', type: 'bar', location: 'Ntinda, Kampala', terms: 14 },
    { id: 3, name: 'Kololo Hill Restaurant', phone: '0756 300 912', type: 'restaurant', location: 'Kololo, Kampala', terms: 30, followUp: dayOnly(daysAgo(-3)) },
    { id: 4, name: 'Jinja Road Wholesalers', phone: '0782 119 440', type: 'wholesaler', location: 'Mukono', terms: 30, notes: 'Buys in cartons. Wants bulk price.' },
    { id: 5, name: 'Sarah N. Events', phone: '0703 887 651', type: 'event_planner', location: 'Entebbe', terms: 7, notes: 'Weddings — referred by Nile View Hotel.' },
    { id: 6, name: 'Peter Okello', phone: '0774 223 109', type: 'retail', location: 'Bukoto', terms: 0 },
    { id: 7, name: 'Lakeside Lodge Entebbe', phone: '0752 610 004', type: 'hotel', location: 'Entebbe', terms: 30 },
    { id: 8, name: 'Ntinda Mini Supermarket', phone: '0789 345 671', type: 'wholesaler', location: 'Ntinda, Kampala', terms: 14 },
    { id: 9, name: 'Joy Lounge', phone: '0706 912 330', type: 'bar', location: 'Kansanga', terms: 7 },
  ];

  const suppliers: Supplier[] = [
    { id: 1, name: 'Kabale Hibiscus Growers Co-op', contact: 'Moses Tumwine', phone: '0772 501 882', email: '', supplies: 'Dried hibiscus flowers' },
    { id: 2, name: 'Eastern Sugar Traders', contact: 'Hellen Auma', phone: '0701 220 913', email: '', supplies: 'Sugar' },
    { id: 3, name: 'Kampala Glass & Packaging', contact: 'Ivan Kato', phone: '0758 664 210', email: '', supplies: 'Bottles, caps, cartons' },
    { id: 4, name: 'PrintPro Labels', contact: 'Ruth Nabirye', phone: '0785 330 117', email: '', supplies: 'Labels' },
    { id: 5, name: 'BrewSupplies Uganda', contact: 'Samuel Ouma', phone: '0704 778 900', email: '', supplies: 'Yeast, citric acid' },
  ];

  const employees: Employee[] = [
    { id: 1, name: 'Vangy Director', phone: '0700 000 001', position: 'Director', active: true },
    { id: 2, name: 'John Mukasa', phone: '0772 100 200', position: 'Sales Representative', active: true },
    { id: 3, name: 'Aisha Namuli', phone: '0701 300 400', position: 'Sales Representative', active: true },
    { id: 4, name: 'Robert Ssempa', phone: '0756 500 600', position: 'Storekeeper', active: true },
    { id: 5, name: 'Florence Achieng', phone: '0782 700 800', position: 'Production Manager', active: true },
    { id: 6, name: 'David Okot', phone: '0703 900 100', position: 'Finance Officer', active: true },
  ];

  // Sales over the last ~120 days
  const sales: Sale[] = [];
  let payId = 1;
  for (let i = 0; i < 120; i++) {
    const ago = Math.floor(Math.pow(rand(), 1.3) * 120);
    const date = daysAgo(ago, int(8, 19));
    const walkIn = rand() < 0.25;
    const cust = walkIn ? undefined : pick(customers);
    const lines = [];
    const n = cust && cust.type !== 'retail' ? int(1, 3) : 1;
    const used = new Set<number>();
    for (let k = 0; k < n; k++) {
      const it = items[pick([0, 0, 0, 1, 1, 2])];
      if (used.has(it.id)) continue;
      used.add(it.id);
      const qty = it.id === 3 ? int(1, 2) : cust?.type === 'wholesaler' || cust?.type === 'hotel' ? int(12, 48) : int(1, 8);
      const price = cust?.type === 'wholesaler' && it.id === 1 ? 9000 : it.price;
      const discount = qty >= 24 && rand() < 0.4 ? Math.round(qty * price * 0.05 / 100) * 100 : 0;
      lines.push({ itemId: it.id, name: it.name, qty, price, discount, cost: it.cost });
    }
    const total = lines.reduce((s, l) => s + l.qty * l.price - l.discount, 0);
    const method: Method = pick(['cash', 'cash', 'mobile_money', 'mobile_money', 'bank']);
    const r = rand();
    const payments = [];
    if (walkIn || r < 0.6) payments.push({ id: payId++, date, amount: total, method });
    else if (r < 0.85) {
      const first = Math.round((total * (0.3 + rand() * 0.4)) / 1000) * 1000;
      payments.push({ id: payId++, date, amount: first, method });
      if (ago > 20 && rand() < 0.6) payments.push({ id: payId++, date: daysAgo(ago - int(5, 15)), amount: total - first, method: 'mobile_money' as Method });
    } // else: pure credit sale
    const due = new Date(date); due.setDate(due.getDate() + (cust?.terms ?? 0));
    sales.push({
      id: 0, invoice: '', date, customerId: cust?.id, customerName: cust?.name ?? 'Walk-in customer', customerPhone: cust?.phone,
      lines, payments, salesperson: pick(['John Mukasa', 'Aisha Namuli', 'Vangy Director']),
      delivery: cust && rand() < 0.5 ? `Delivered to ${cust.location}` : undefined,
      status: 'completed', dueDate: dayOnly(due.toISOString()),
    });
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  sales.forEach((s, i) => { s.id = i + 1; s.invoice = `INV-2026-${String(i + 1).padStart(5, '0')}`; });
  sales.flatMap((s) => s.payments).sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p, i) => { p.receiptNo = `RCT-2026-${String(i + 1).padStart(5, '0')}`; });
  sales[sales.length - 12].status = 'cancelled';

  const purchases: Purchase[] = [
    { id: 1, po: 'PO-2026-0001', supplierId: 1, supplierInvoice: 'KHG-3321', date: daysAgo(110), lines: [{ itemId: 4, qty: 60, cost: 12000, received: 60 }], transport: 80000, payments: [{ id: payId++, date: daysAgo(108), amount: 800000, method: 'bank' }], status: 'received' },
    { id: 2, po: 'PO-2026-0002', supplierId: 2, supplierInvoice: 'EST-0912', date: daysAgo(95), lines: [{ itemId: 5, qty: 200, cost: 4200, received: 200 }], transport: 50000, payments: [{ id: payId++, date: daysAgo(95), amount: 890000, method: 'cash' }], status: 'received' },
    { id: 3, po: 'PO-2026-0003', supplierId: 3, supplierInvoice: 'KGP-7781', date: daysAgo(70), lines: [{ itemId: 8, qty: 1000, cost: 900, received: 1000 }, { itemId: 9, qty: 200, cost: 1500, received: 200 }, { itemId: 10, qty: 1500, cost: 150, received: 1500 }], transport: 120000, payments: [{ id: payId++, date: daysAgo(68), amount: 1000000, method: 'bank' }], status: 'received' },
    { id: 4, po: 'PO-2026-0004', supplierId: 4, supplierInvoice: 'PPL-221', date: daysAgo(45), lines: [{ itemId: 11, qty: 1000, cost: 200, received: 1000 }], transport: 0, payments: [{ id: payId++, date: daysAgo(44), amount: 200000, method: 'mobile_money' }], status: 'received' },
    { id: 5, po: 'PO-2026-0005', supplierId: 5, date: daysAgo(20), lines: [{ itemId: 6, qty: 30, cost: 3500, received: 15 }, { itemId: 7, qty: 5, cost: 9000, received: 5 }], transport: 20000, payments: [{ id: payId++, date: daysAgo(20), amount: 50000, method: 'mobile_money' }], status: 'partial' },
    { id: 6, po: 'PO-2026-0006', supplierId: 3, date: daysAgo(4), lines: [{ itemId: 9, qty: 300, cost: 1500, received: 0 }, { itemId: 12, qty: 60, cost: 2500, received: 0 }], transport: 60000, payments: [], status: 'ordered' },
  ];

  const mats = (h: number, s: number, y: number, c: number, b750: number, b1500: number) => [
    { itemId: 4, qty: h, cost: 12000 }, { itemId: 5, qty: s, cost: 4200 }, { itemId: 6, qty: y, cost: 3500 },
    { itemId: 7, qty: c, cost: 9000 }, { itemId: 8, qty: b750, cost: 900 }, { itemId: 9, qty: b1500, cost: 1500 },
    { itemId: 10, qty: b750 + b1500, cost: 150 }, { itemId: 11, qty: b750 + b1500, cost: 200 },
  ];
  const stg = (ago: number, list: string[]) => list.map((stage, i) => ({ stage, date: daysAgo(ago - i * 7), notes: '' }));
  const batches: Batch[] = [
    { id: 1, batchNo: 'B-2026-001', startDate: daysAgo(360), responsible: 'Florence Achieng', expectedLitres: 200, stage: 'Released', stages: stg(360, ['Preparation', 'Fermentation', 'Clarification', 'Bottling', 'Quality check']), materials: mats(12, 50, 4, 1, 240, 0), outputs: [{ itemId: 1, good: 236, rejected: 4 }], lossLitres: 8, qc: 'passed', status: 'released', bottlingDate: dayOnly(daysAgo(332)) },
    { id: 2, batchNo: 'B-2026-002', startDate: daysAgo(250), responsible: 'Florence Achieng', expectedLitres: 150, stage: 'Rejected', stages: stg(250, ['Preparation', 'Fermentation', 'Quality check']), materials: mats(9, 38, 3, 1, 0, 0), outputs: [], lossLitres: 150, qc: 'failed', qcNotes: 'Off flavour — contaminated fermentation vessel.', status: 'rejected' },
    { id: 3, batchNo: 'B-2026-003', startDate: daysAgo(150), responsible: 'Florence Achieng', expectedLitres: 300, stage: 'Released', stages: stg(150, ['Preparation', 'Fermentation', 'Clarification', 'Bottling', 'Quality check']), materials: mats(18, 75, 6, 2, 300, 40), outputs: [{ itemId: 1, good: 296, rejected: 4 }, { itemId: 2, good: 40, rejected: 0 }], lossLitres: 6, qc: 'passed', status: 'released', bottlingDate: dayOnly(daysAgo(122)) },
    { id: 4, batchNo: 'B-2026-004', startDate: daysAgo(70), responsible: 'Florence Achieng', expectedLitres: 400, stage: 'Released', stages: stg(70, ['Preparation', 'Fermentation', 'Clarification', 'Bottling', 'Quality check']), materials: mats(24, 100, 8, 2, 240, 60), outputs: [{ itemId: 1, good: 236, rejected: 4 }, { itemId: 2, good: 60, rejected: 0 }, { itemId: 3, good: 6, rejected: 0 }], lossLitres: 7, qc: 'passed', status: 'released', bottlingDate: dayOnly(daysAgo(42)) },
    { id: 5, batchNo: 'B-2026-005', startDate: daysAgo(25), responsible: 'Florence Achieng', expectedLitres: 350, stage: 'Quality check', stages: stg(25, ['Preparation', 'Fermentation', 'Clarification', 'Bottling']), materials: mats(21, 88, 7, 2, 300, 50), outputs: [{ itemId: 1, good: 296, rejected: 4 }, { itemId: 2, good: 50, rejected: 0 }], lossLitres: 5, qc: 'pending', status: 'in_progress', bottlingDate: dayOnly(daysAgo(4)) },
    { id: 6, batchNo: 'B-2026-006', startDate: daysAgo(6), responsible: 'Florence Achieng', expectedLitres: 400, stage: 'Fermentation', stages: stg(6, ['Preparation', 'Fermentation']), materials: mats(24, 100, 8, 2, 0, 0), outputs: [], lossLitres: 0, qc: 'pending', status: 'in_progress' },
  ];

  const expenses: Expense[] = [];
  const recurring: [string, string, number, string][] = [
    ['Rent', 'Monthly rent — production premises', 800000, 'Landlord — Mr. Kizza'],
    ['Salaries and wages', 'Staff wages', 1500000, 'Staff payroll'],
    ['Utilities', 'Electricity (UMEME tokens)', 180000, 'Electricity'],
    ['Utilities', 'Water bill', 65000, 'Water'],
    ['Communications', 'Airtime & internet bundles', 70000, 'Telecom'],
  ];
  for (let m = 3; m >= 0; m--) recurring.forEach(([c, d, a, r]) => expenses.push({ id: 0, ref: '', date: daysAgo(m * 30 + 2), category: c, description: d, amount: a, method: c === 'Rent' || c === 'Salaries and wages' ? 'bank' : 'mobile_money', recipient: r, status: 'active' }));
  const adhoc: [string, string, number, number][] = [
    ['Transport and delivery', 'Boda delivery to customers', 15000, 10], ['Transport and delivery', 'Pickup hire — Jinja delivery', 120000, 3],
    ['Marketing and advertising', 'Radio advert — 1 week', 350000, 1], ['Marketing and advertising', 'Instagram promotion', 80000, 2],
    ['Repairs and maintenance', 'Fermentation tank tap repair', 60000, 1], ['Licences and compliance', 'UNBS certification fees', 450000, 1],
    ['Packaging', 'Gift bags for events', 90000, 1], ['Other operating expenses', 'Cleaning supplies', 40000, 3],
  ];
  adhoc.forEach(([c, d, a, n]) => { for (let k = 0; k < n; k++) expenses.push({ id: 0, ref: '', date: daysAgo(int(0, 115)), category: c, description: d, amount: a, method: pick(['cash', 'mobile_money'] as Method[]), recipient: c === 'Transport and delivery' ? 'Delivery rider' : 'Vendor', status: 'active' }); });
  expenses.sort((a, b) => a.date.localeCompare(b.date));
  expenses.forEach((e, i) => { e.id = i + 1; e.ref = `EXP-2026-${String(i + 1).padStart(4, '0')}`; });

  const cash: CashEntry[] = [
    { id: 1, date: daysAgo(120, 7), direction: 'in', amount: 1500000, method: 'cash', description: 'Opening balance — cash', category: 'Opening balance' },
    { id: 2, date: daysAgo(120, 7), direction: 'in', amount: 800000, method: 'mobile_money', description: 'Opening balance — mobile money', category: 'Opening balance' },
    { id: 3, date: daysAgo(120, 7), direction: 'in', amount: 6500000, method: 'bank', description: 'Opening balance — bank', category: 'Opening balance' },
    { id: 4, date: daysAgo(30, 16), direction: 'out', amount: 2000000, method: 'cash', description: 'Cash deposited to bank', category: 'Transfer' },
    { id: 5, date: daysAgo(30, 16), direction: 'in', amount: 2000000, method: 'bank', description: 'Cash deposited to bank', category: 'Transfer' },
  ];

  const movements: Movement[] = [];
  let mid = 1;
  sales.slice(-25).forEach((s) => s.lines.forEach((l) => movements.push({ id: mid++, date: s.date, itemId: l.itemId, type: 'Sale', qty: -l.qty, ref: s.invoice, user: s.salesperson })));
  purchases.forEach((p) => p.lines.forEach((l) => l.received && movements.push({ id: mid++, date: p.date, itemId: l.itemId, type: 'Purchase received', qty: l.received, ref: p.po, user: 'Robert Ssempa' })));
  batches.forEach((b) => b.materials.forEach((m) => movements.push({ id: mid++, date: b.startDate, itemId: m.itemId, type: 'Used in production', qty: -m.qty, ref: b.batchNo, user: 'Florence Achieng' })));
  batches.filter((b) => b.status === 'released').forEach((b) => b.outputs.forEach((o) => movements.push({ id: mid++, date: b.bottlingDate + 'T15:00:00.000Z', itemId: o.itemId, type: 'Production output', qty: o.good, ref: b.batchNo, user: 'Florence Achieng' })));
  movements.push({ id: mid++, date: daysAgo(12), itemId: 1, type: 'Damaged', qty: -3, ref: 'ADJ-2026-0004', note: 'Bottles broken during delivery', user: 'Robert Ssempa' });
  movements.sort((a, b) => b.date.localeCompare(a.date));

  return {
    account: { name: 'Vangy Director', username: 'admin' },
    settings: {
      businessName: 'Vangy Wine Company Limited', email: 'vangywinecompanylimited@gmail.com', phone: '+256 700 000 001',
      address: 'Kampala, Uganda', country: 'Uganda', currency: 'UGX', taxRate: 0, invoicePrefix: 'INV',
      expiryAlertDays: 60, allowOversell: false, lastBackup: daysAgo(1, 18),
      ...INVOICE_DEFAULTS,
    },
    items, movements, customers, suppliers, sales, purchases, batches, expenses, cash, employees, recipes: [], reconciliations: [],
    audit: [
      { id: 1, date: daysAgo(0, 9), user: 'Vangy Director', action: 'Login', details: 'Signed in' },
      { id: 2, date: daysAgo(1, 18), user: 'System', action: 'Backup', details: 'Automatic backup completed' },
      { id: 3, date: daysAgo(12), user: 'Vangy Director', action: 'Stock adjustment approved', details: 'ADJ-2026-0004 — 3 bottles damaged' },
      { id: 4, date: daysAgo(18), user: 'Vangy Director', action: 'Sale cancelled', details: `${sales[sales.length - 12].invoice} — customer changed order` },
      { id: 5, date: daysAgo(40), user: 'Vangy Director', action: 'Batch released', details: 'B-2026-004 released to saleable stock' },
      { id: 6, date: daysAgo(60), user: 'Vangy Director', action: 'Price changed', details: '1.5L bottle price 17,000 → 18,000' },
    ],
  };
}
