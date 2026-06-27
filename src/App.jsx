import { Navigate, Route, Routes } from "react-router-dom";
import PhoneFrame from "./components/PhoneFrame";
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
