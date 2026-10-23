import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Page } from './components/Page';
import { useStore } from './lib/store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import NewSale from './pages/NewSale';
import SaleDetail from './pages/SaleDetail';
import Invoices from './pages/Invoices';
import Receipts, { ReceiptView } from './pages/Receipts';
import Inventory from './pages/Inventory';
import Production from './pages/Production';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import SettingsPage from './pages/Settings';

export default function App() {
  const { user, ready } = useStore();
  if (!ready) return <div className="flex min-h-full items-center justify-center text-sm text-stone-500">Loading…</div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Page needs={[]}><Dashboard /></Page>} />
        <Route path="sales" element={<Page needs={['sales', 'employees']}><Sales /></Page>} />
        <Route path="sales/new" element={<Page needs={['items', 'customers', 'employees']}><NewSale /></Page>} />
        <Route path="sales/:id" element={<Page needs={['sales', 'customers', 'employees']}><SaleDetail /></Page>} />
        <Route path="invoices" element={<Page needs={['sales', 'employees']}><Invoices /></Page>} />
        <Route path="invoices/:id" element={<Page needs={['sales', 'customers', 'employees']}><SaleDetail /></Page>} />
        <Route path="receipts" element={<Page needs={['sales']}><Receipts /></Page>} />
        <Route path="receipts/:no" element={<Page needs={['sales']}><ReceiptView /></Page>} />
        <Route path="inventory" element={<Page needs={['items', 'movements']}><Inventory /></Page>} />
        <Route path="production" element={<Page needs={['batches', 'recipes', 'items', 'employees']}><Production /></Page>} />
        <Route path="purchases" element={<Page needs={['purchases', 'suppliers', 'items']}><Purchases /></Page>} />
        <Route path="suppliers" element={<Page needs={['suppliers', 'purchases']}><Suppliers /></Page>} />
        <Route path="customers" element={<Page needs={['customers', 'sales']}><Customers /></Page>} />
        <Route path="expenses" element={<Page needs={['expenses']}><Expenses /></Page>} />
        <Route path="finance" element={<Page needs={['sales', 'purchases', 'suppliers', 'expenses', 'cash', 'reconciliations']}><Finance /></Page>} />
        <Route path="reports" element={<Page needs={[]}><Reports /></Page>} />
        <Route path="employees" element={<Page needs={['employees', 'sales']}><Employees /></Page>} />
        <Route path="settings" element={<Page needs={['settings', 'items', 'audit', 'customers', 'suppliers']}><SettingsPage /></Page>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
