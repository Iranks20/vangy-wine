import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useStore } from './lib/store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import NewSale from './pages/NewSale';
import SaleDetail from './pages/SaleDetail';
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
  const { user } = useStore();
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<NewSale />} />
        <Route path="sales/:id" element={<SaleDetail />} />
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
