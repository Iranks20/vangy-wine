// Starting values shared by the server (first run) and the web app (before data loads).
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'Vangy Wine Company Limited',
  email: 'vangywinecompanylimited@gmail.com',
  phone: '',
  address: 'Kampala, Uganda',
  country: 'Uganda',
  currency: 'UGX',
  taxRate: 0,
  invoicePrefix: 'INV',
  expiryAlertDays: 60,
  allowOversell: false,
  tin: '',
  bankName: '',
  accountName: 'Vangy Wine Company Limited',
  accountNo: '',
  mobileMoney: '',
  invoiceTerms: 'Payment is due by the date shown. Please quote the invoice number when paying. Goods once sold are only returnable under our returns policy.',
};

export const EXPENSE_CATEGORIES = [
  'Transport and delivery', 'Salaries and wages', 'Rent', 'Utilities', 'Marketing and advertising',
  'Packaging', 'Repairs and maintenance', 'Licences and compliance', 'Communications', 'Other operating expenses',
];
