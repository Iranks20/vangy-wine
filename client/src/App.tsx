import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
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
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<NewSale />} />
        <Route path="sales/:id" element={<SaleDetail />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<SaleDetail />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="receipts/:no" element={<ReceiptView />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="production" element={<Production />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="customers" element={<Customers />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="finance" element={<Finance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="employees" element={<Employees />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
