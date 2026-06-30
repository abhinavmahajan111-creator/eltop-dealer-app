import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { products as staticProducts } from "../data/products";
import { invoices as staticInvoices } from "../data/invoices";

const AppContext = createContext(null);

const DEMO_PROFILE = {
  name: "Shree Balaji Electricals",
  dealer_code: "ETP-DLR-4521",
  gstin: "07AABCE1234F1Z5",
  address: "Karol Bagh, New Delhi - 110005",
  credit_limit: 500000,
  outstanding: 125000,
};

export function AppProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(DEMO_PROFILE);
  const [products, setProducts] = useState(staticProducts);
  const [invoices, setInvoices] = useState(staticInvoices);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastShow(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 1600);
  }, []);

  // ---------- AUTH ----------
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setProfile(data);
      });
  }, [session]);

  const sendOtp = useCallback(async (emailAddress) => {
    setEmail(emailAddress);
    setAuthError("");
    if (!isSupabaseConfigured) return true; // demo mode, no real email sent
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: emailAddress,
      options: { shouldCreateUser: true, emailRedirectTo: undefined },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, []);

  const verifyOtp = useCallback(async (otp) => {
    setAuthError("");
    if (!isSupabaseConfigured) return true; // demo mode, any OTP passes
    setAuthBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, [email]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setSession(null);
    setProfile(DEMO_PROFILE);
    setCart([]);
  }, []);

  // ---------- PRODUCTS ----------
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from("products")
      .select("*")
      .order("id")
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        setProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            cat: p.category,
            price: p.price,
            mrp: p.mrp,
            stock: p.stock,
            img: p.image_url,
            image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
            video_url: p.video_url || null,
            wh: {
              delhi: p.warehouse_delhi,
              ludhiana: p.warehouse_ludhiana,
              jaipur: p.warehouse_jaipur,
            },
          }))
        );
      });
  }, [session]);

  // ---------- INVOICES ----------
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return;
    supabase
      .from("invoices")
      .select("*")
      .eq("dealer_id", session.user.id)
      .order("invoice_date", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return;
        setInvoices(
          data.map((inv) => ({
            inv: inv.invoice_no,
            date: inv.invoice_date,
            amt: inv.amount,
            status: inv.status,
          }))
        );
      });
  }, [session]);

  // ---------- CART ----------
  const addToCart = useCallback((product, qty) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.id === product.id ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [...prev, { ...product, qty }];
    });
    showToast("Added to cart");
  }, [showToast]);

  const changeCartQty = useCallback((id, delta) => {
    setCart((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c
      )
    );
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ---------- ORDERS ----------
  const placeOrder = useCallback(async ({ items, subtotal, tax, total, address }) => {
    if (isSupabaseConfigured && session?.user) {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          dealer_id: session.user.id,
          subtotal,
          tax,
          total,
          delivery_address: address || profile.address || "",
        })
        .select()
        .single();

      if (!error && order) {
        await supabase.from("order_items").insert(
          items.map((it) => ({
            order_id: order.id,
            product_id: it.id,
            name: it.name,
            price: it.price,
            qty: it.qty,
          }))
        );
      }
    }
    clearCart();
  }, [session, profile, clearCart]);

  const value = {
    cart,
    addToCart,
    changeCartQty,
    removeFromCart,
    clearCart,
    placeOrder,
    email,
    setEmail,
    session,
    isLoggedIn: isSupabaseConfigured ? Boolean(session) : null,
    dealer: profile,
    products,
    invoices,
    sendOtp,
    verifyOtp,
    signOut,
    authBusy,
    authError,
    toastMsg,
    toastShow,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
