export type Method = 'cash' | 'mobile_money' | 'bank';
export type ItemCategory = 'finished' | 'raw' | 'packaging' | 'other';
export type CustomerType = 'retail' | 'wholesaler' | 'bar' | 'restaurant' | 'hotel' | 'event_planner' | 'other';

export interface Lot { lotNo: string; mfg?: string; expiry?: string; qty: number }

export interface Item {
  id: number; code: string; name: string; category: ItemCategory; unit: string;
  price: number; cost: number; qty: number; min: number; location: string;
  lots: Lot[];
}

export interface Movement {
  id: number; date: string; itemId: number; type: string; qty: number; ref: string; note?: string; user: string;
}

export interface Customer {
  id: number; name: string; phone: string; type: CustomerType; location: string;
  terms: number; notes?: string; followUp?: string;
}

export interface Supplier { id: number; name: string; contact: string; phone: string; email: string; supplies: string }

export interface Payment { id: number; date: string; amount: number; method: Method; ref?: string }

export interface SaleLine { itemId: number; name: string; qty: number; price: number; discount: number; cost: number }

export interface Sale {
  id: number; invoice: string; date: string; customerId?: number; customerName: string; customerPhone?: string;
  lines: SaleLine[]; payments: Payment[]; salesperson: string; delivery?: string; notes?: string;
  status: 'completed' | 'cancelled'; dueDate?: string;
}

export interface PurchaseLine { itemId: number; qty: number; cost: number; received: number }

export interface Purchase {
  id: number; po: string; supplierId: number; supplierInvoice?: string; date: string;
  lines: PurchaseLine[]; transport: number; payments: Payment[];
  status: 'ordered' | 'partial' | 'received' | 'cancelled';
}

export interface BatchStage { stage: string; date: string; notes: string }

export interface Batch {
  id: number; batchNo: string; startDate: string; responsible: string; expectedLitres: number;
  stage: string; stages: BatchStage[];
  materials: { itemId: number; qty: number; cost: number }[];
  outputs: { itemId: number; good: number; rejected: number }[];
  lossLitres: number; qc: 'pending' | 'passed' | 'failed'; qcNotes?: string;
  status: 'in_progress' | 'released' | 'rejected'; bottlingDate?: string;
}

export interface Expense {
  id: number; ref: string; date: string; category: string; description: string;
  amount: number; method: Method; recipient: string; reference?: string; status: 'active' | 'voided';
}

export interface CashEntry {
  id: number; date: string; direction: 'in' | 'out'; amount: number; method: Method; description: string; category: string;
}

export interface Employee {
  id: number; name: string; phone: string; position: string; active: boolean;
}

// The single login account — the director manages everything.
export interface Account { name: string; username: string }

export interface AuditEntry { id: number; date: string; user: string; action: string; details: string }

export interface Settings {
  businessName: string; email: string; phone: string; address: string; country: string; currency: string;
  taxRate: number; invoicePrefix: string; expiryAlertDays: number; allowOversell: boolean;
  lastBackup?: string;
}

export interface Db {
  account: Account; settings: Settings; items: Item[]; movements: Movement[]; customers: Customer[]; suppliers: Supplier[];
  sales: Sale[]; purchases: Purchase[]; batches: Batch[]; expenses: Expense[]; cash: CashEntry[];
  employees: Employee[]; audit: AuditEntry[];
}
