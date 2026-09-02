import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import PhoneFrame from "./components/PhoneFrame";
import AdminRoute from "./components/AdminRoute";
import DealerRoute from "./components/DealerRoute";
import DealerProfileRoute from "./components/DealerProfileRoute";
import CustomerRoute from "./components/CustomerRoute";
import StaffRoute from "./components/StaffRoute";
import Store from "./pages/Store";
import MyAccount from "./pages/MyAccount";
import Splash from "./screens/Splash";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import Catalogue from "./screens/Catalogue";
import ProductDetail from "./screens/ProductDetail";
import Cart from "./screens/Cart";
import ResolveOrder from "./screens/ResolveOrder";
import OrderConfirm from "./screens/OrderConfirm";
import OrderTracking from "./screens/OrderTracking";
import Ledger from "./screens/Ledger";
import Profile from "./screens/Profile";
import Schemes from "./screens/Schemes";
import Support from "./screens/Support";
import StaffHome from "./screens/StaffHome";
import SalesDashboard from "./screens/staff/SalesDashboard";
import DealerDetail from "./screens/staff/DealerDetail";
import AdminLayout from "./admin/AdminLayout";
import AdminDashboard from "./admin/AdminDashboard";
import AdminOrders from "./admin/AdminOrders";
import AdminProducts from "./admin/AdminProducts";
import AdminDealers from "./admin/AdminDealers";
import AdminStaff from "./admin/AdminStaff";
import AdminHealth from "./admin/AdminHealth";
import AgingReport from "./admin/AgingReport";
import SalesOrder from "./admin/SalesOrder";
import DealerCRM from "./admin/DealerCRM";
import GuestCRM from "./admin/GuestCRM";
import CustomerCRM from "./admin/CustomerCRM";
import TrackOrder from "./pages/TrackOrder";
import ContactSupport from "./pages/ContactSupport";

// Resets window scroll to top on every client-side route change.
// Fixes carry-over scroll position when navigating (e.g. guest login → Store).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* /login and / (Splash) live outside PhoneFrame — full-width, no phone-frame CLS */}
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Splash />} />

      <Route element={<PhoneFrame />}>
        <Route element={<DealerRoute />}>
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/resolve-order" element={<ResolveOrder />} />
          <Route path="/confirm/:orderId" element={<OrderConfirm />} />
          <Route path="/confirm" element={<OrderConfirm />} />
          <Route path="/tracking/:orderId" element={<OrderTracking />} />
          <Route path="/tracking" element={<OrderTracking />} />
          <Route path="/schemes" element={<Schemes />} />
          <Route path="/support" element={<Support />} />
        </Route>
        <Route element={<DealerProfileRoute />}>
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route element={<AdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/dealers" element={<AdminDealers />} />
          <Route path="/admin/staff" element={<AdminStaff />} />
          <Route path="/admin/health" element={<AdminHealth />} />
          <Route path="/admin/aging" element={<AgingReport />} />
        </Route>
        {/* Full-page views — no sidebar */}
        <Route path="/admin/orders/:id/print" element={<SalesOrder />} />
        <Route path="/admin/crm/:dealerId" element={<DealerCRM />} />
        <Route path="/admin/crm/guest/:guestKey" element={<GuestCRM />} />
        <Route path="/admin/crm/customer/:profileId" element={<CustomerCRM />} />
      </Route>

      {/* Full-width dealer routes — outside PhoneFrame, like /store */}
      <Route element={<DealerRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/ledger" element={<Ledger />} />
      </Route>

      {/* Staff routes — full-width, outside PhoneFrame (internal desktop tools).
          Every path below renders the same placeholder today; each swaps to
          its real department dashboard independently as those get built. */}
      <Route element={<StaffRoute />}>
        <Route path="/staff" element={<StaffHome />} />
        <Route path="/staff/sales" element={<SalesDashboard />} />
        <Route path="/staff/sales/dealer/:id" element={<DealerDetail />} />
        <Route path="/staff/after-sales" element={<StaffHome />} />
        <Route path="/staff/dispatch" element={<StaffHome />} />
        <Route path="/staff/logistics" element={<StaffHome />} />
        <Route path="/staff/back-office" element={<StaffHome />} />
        <Route path="/staff/support-desk" element={<StaffHome />} />
        <Route path="/staff/content" element={<StaffHome />} />
      </Route>

      <Route path="/store" element={<Store />} />
      <Route path="/track" element={<TrackOrder />} />
      <Route path="/contact" element={<ContactSupport />} />
      <Route element={<CustomerRoute />}>
        <Route path="/my-account" element={<MyAccount />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
