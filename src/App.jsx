import { Navigate, Route, Routes } from "react-router-dom";
import PhoneFrame from "./components/PhoneFrame";
import AdminRoute from "./components/AdminRoute";
import Splash from "./screens/Splash";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import Catalogue from "./screens/Catalogue";
import ProductDetail from "./screens/ProductDetail";
import Cart from "./screens/Cart";
import OrderConfirm from "./screens/OrderConfirm";
import OrderTracking from "./screens/OrderTracking";
import Ledger from "./screens/Ledger";
import Profile from "./screens/Profile";
import AdminLayout from "./admin/AdminLayout";
import AdminDashboard from "./admin/AdminDashboard";
import AdminOrders from "./admin/AdminOrders";
import AdminProducts from "./admin/AdminProducts";
import AdminDealers from "./admin/AdminDealers";
import SalesOrder from "./admin/SalesOrder";
import DealerCRM from "./admin/DealerCRM";

export default function App() {
  return (
    <Routes>
      <Route element={<PhoneFrame />}>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/confirm" element={<OrderConfirm />} />
        <Route path="/tracking" element={<OrderTracking />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/dealers" element={<AdminDealers />} />
        </Route>
        {/* Full-page views — no sidebar */}
        <Route path="/admin/orders/:id/print" element={<SalesOrder />} />
        <Route path="/admin/crm/:dealerId" element={<DealerCRM />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
