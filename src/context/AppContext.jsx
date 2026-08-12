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
  discount1: 0,
  discount2: 0,
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
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  const [deactivatedAccount, setDeactivatedAccount] = useState(false);
  const [blockedAccount,     setBlockedAccount]     = useState(false);
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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Awaitable profile loader. Used by the session effect below and by Login.jsx
  // post-signup so navigate only fires after AppContext state is actually updated.
  // Uses maybeSingle() — returns {data:null,error:null} for 0 rows, avoiding HTTP 406.
  const refreshProfile = useCallback(async () => {
    if (!isSupabaseConfigured || !session?.user) return true;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (data && !error) {
      if (data.deleted_at) {
        const { data: existing } = await supabase
          .from("restore_requests")
          .select("id")
          .eq("profile_id", data.id)
          .eq("status", "pending")
          .maybeSingle();
        if (!existing) {
          await supabase.from("restore_requests").insert({
            profile_id: data.id,
            contact_value: session.user.email,
            status: "pending",
          });
        }
        await supabase.auth.signOut();
        setSession(null);
        setDeactivatedAccount(true);
        setIsDealer(false);
        setProfileLoaded(true);
        return true;
      }
      // Blocked dealer — sign out immediately, surface error in Login
      if (data.is_blocked && data.is_dealer === true) {
        await supabase.auth.signOut();
        setSession(null);
        setIsDealer(false);
        setProfileLoaded(true);
        setBlockedAccount(true);
        return true;
      }
      setProfile(data);
      setIsDealer(data.is_dealer === true);
      setProfileLoaded(true);
      return true;
    }

    // maybeSingle: {data:null, error:null} = 0 rows = no profile row = customer
    if (!error) {
      setIsDealer(false);
      setProfileLoaded(true);
      return true;
    }

    // Genuine fetch error — let caller decide whether to retry
    console.error('[AppContext] refreshProfile error:', error);
    return false;
  }, [session]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!session?.user) {
      setIsDealer(false);
      setProfileLoaded(false);
      return;
    }
    setProfileLoaded(false);
    let cancelled = false;

    async function load(isRetry = false) {
      if (cancelled) return;
      const ok = await refreshProfile();
      if (!ok && !isRetry && !cancelled) {
        setTimeout(() => load(true), 1500);
      } else if (!ok && !cancelled) {
        console.error('[AppContext] Profile fetch failed after retry');
        // profileLoaded stays false — treat as "still unknown," not confirmed customer
      }
    }
    load();

    return () => { cancelled = true; };
  }, [session, refreshProfile]);

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
    // Dev-only bypass: VITE_DEV_OTP_BYPASS_EMAIL + _CODE in .env.local (never committed).
    // import.meta.env.DEV is false in production builds — Vite strips this at build time.
    if (import.meta.env.DEV &&
        import.meta.env.VITE_DEV_OTP_BYPASS_EMAIL &&
        email === import.meta.env.VITE_DEV_OTP_BYPASS_EMAIL &&
        otp === import.meta.env.VITE_DEV_OTP_BYPASS_CODE) {
      return true;
    }
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

  // Check admins table whenever session changes
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) {
      setIsAdmin(false);
      setAdminChecked(false);
      return;
    }
    supabase
      .from('admins')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(Boolean(data));
        setAdminChecked(true);
      });
  }, [session]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setSession(null);
    setProfile(DEMO_PROFILE);
    setIsDealer(false);
    setProfileLoaded(false);
    setIsAdmin(false);
    setAdminChecked(false);
    setCart([]);
    setDeactivatedAccount(false);
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
            image_urls: (Array.isArray(p.image_urls) && p.image_urls.filter(Boolean).length > 0)
              ? p.image_urls.filter(Boolean)
              : (p.image_url ? [p.image_url] : []),
            video_url: p.video_url || null,
            dlp: p.dlp ?? p.price,
            hsn_code: p.hsn_code || null,
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
          c.id === product.id ? { ...c, qty } : c
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
  const placeOrder = useCallback(async ({ items, address }) => {
    if (isSupabaseConfigured && session?.user) {
      const d1 = Number(profile.discount1 || 0);
      const d2 = Number(profile.discount2 || 0);

      const enriched = items.map((it) => {
        const dlp      = Number(it.dlp ?? it.price);
        const netRate  = dlp * (1 - d1 / 100) * (1 - d2 / 100);
        return { ...it, dlp, netRate };
      });

      const grossTotal = enriched.reduce((s, it) => s + it.netRate * it.qty, 0);
      const total      = Math.round(grossTotal);
      const subtotal   = enriched.reduce((s, it) => s + (it.netRate / 1.18) * it.qty, 0);
      const tax        = subtotal * 0.18;

      // Credit-limit check — approved dealers only; fail open on ledger query error
      const appStatus = profile?.dealer_application_status ?? 'none';
      const isApprovedDealer = profile?.is_dealer === true && (appStatus === 'approved' || appStatus === 'none');
      // Hoisted so consume_credit_grant call below can reference it after the order saves
      let usedGrantId = null;
      if (isApprovedDealer && profile?.credit_limit != null) {
        const { data: ledgerRows, error: creditCheckError } = await supabase
          .from('dealer_ledger')
          .select('type, amount, dr_dealer, cr_dealer')
          .eq('dealer_id', session.user.id);
        if (creditCheckError) {
          console.warn('[placeOrder] credit-check: ledger fetch failed — failing open:', creditCheckError.message);
        } else {
          const liveOutstanding = (ledgerRows || []).reduce((s, row) => {
            const isDr = row.type === 'order' || (row.type === 'journal' && row.dr_dealer);
            const isCr = row.type === 'payment' || row.type === 'credit_note' || (row.type === 'journal' && row.cr_dealer);
            if (isDr) return s + Number(row.amount);
            if (isCr) return s - Number(row.amount);
            return s;
          }, 0);
          const creditLimit = Number(profile.credit_limit);
          const today = new Date().toISOString().slice(0, 10);

          // Active unconsumed extra_limit grant — raises effective limit temporarily (single-use)
          const { data: activeExtraLimit } = await supabase
            .from('credit_requests')
            .select('id, extra_limit_amount')
            .eq('dealer_id', session.user.id)
            .eq('type', 'extra_limit')
            .eq('status', 'approved')
            .gte('valid_until', today)
            .is('consumed_at', null)
            .order('valid_until', { ascending: false })
            .limit(1)
            .maybeSingle();
          const effectiveCreditLimit = creditLimit + Number(activeExtraLimit?.extra_limit_amount || 0);

          // Active unconsumed extra_days grant — bypasses limit check entirely (single-use)
          const { data: activeExtraDays } = await supabase
            .from('credit_requests')
            .select('id')
            .eq('dealer_id', session.user.id)
            .eq('type', 'extra_days')
            .eq('status', 'approved')
            .gte('valid_until', today)
            .is('consumed_at', null)
            .limit(1)
            .maybeSingle();

          const wouldExceedEffective = liveOutstanding + total > effectiveCreditLimit;
          const wouldExceedBase      = liveOutstanding + total > creditLimit;

          if (wouldExceedEffective && !activeExtraDays) {
            const shortfall = Math.round(liveOutstanding + total - effectiveCreditLimit);
            return {
              success: false,
              creditBlock: true,
              orderTotal:      total,
              liveOutstanding: Math.round(liveOutstanding),
              creditLimit:     effectiveCreditLimit,
              shortfall,
            };
          }

          // Record which grant (if any) enabled this order — consumed after successful save
          if (activeExtraDays && wouldExceedEffective) {
            usedGrantId = activeExtraDays.id;
          } else if (activeExtraLimit && wouldExceedBase && !wouldExceedEffective) {
            usedGrantId = activeExtraLimit.id;
          }
        }
      }

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          dealer_id:        session.user.id,
          customer_name:    profile.name  || '',
          customer_phone:   profile.phone || '',
          customer_email:   profile.email || session.user.email || null,
          payment_status:   'pending',
          subtotal:         Math.round(subtotal * 100) / 100,
          tax:              Math.round(tax * 100) / 100,
          total,
          delivery_address: address || profile.address || "",
        })
        .select()
        .single();

      if (error) {
        console.error('[placeOrder] orders insert failed:', error);
        return { success: false, error: error.message };
      }

      const { error: itemsError } = await supabase.from("order_items").insert(
        enriched.map((it) => ({
          order_id:   order.id,
          product_id: it.id,
          name:       it.name,
          price:      Math.round(it.netRate * 100) / 100,
          qty:        it.qty,
          mrp:        it.mrp ?? null,
          dlp:        it.dlp,
          net_rate:   Math.round(it.netRate * 100) / 100,
          discount1:  d1,
          discount2:  d2,
          hsn_code:   it.hsn_code ?? null,
        }))
      );

      if (itemsError) {
        console.error('[placeOrder] order_items insert failed:', itemsError);
        return { success: false, error: itemsError.message };
      }

      // Mirror DealerCRM's Sales Invoice ledger write so outstanding balance stays accurate
      const { count: ledgerCount } = await supabase
        .from('dealer_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('dealer_id', session.user.id)
        .eq('type', 'order');
      const seq = String((ledgerCount || 0) + 1).padStart(4, '0');
      const { error: ledgerError } = await supabase.from('dealer_ledger').insert({
        dealer_id:    session.user.id,
        type:         'order',
        voucher_type: 'sales_invoice',
        voucher_no:   `EEIPL/SI/${seq}`,
        voucher_date: new Date().toISOString().slice(0, 10),
        narration:    '',
        amount:       total,
      });
      if (ledgerError) {
        console.error('[placeOrder] dealer_ledger insert failed:', ledgerError);
        alert('Order placed successfully but the ledger entry could not be saved.\nError: ' + ledgerError.message + '\nPlease contact support.');
      }

      // Consume the credit grant that enabled this order (single-use enforcement).
      // Known edge case: if this RPC fails the grant remains reusable until valid_until;
      // the order itself is already saved so we do not roll back — manual fix required.
      if (usedGrantId) {
        const { data: consumed } = await supabase.rpc('consume_credit_grant', {
          p_request_id: usedGrantId,
          p_order_id:   order.id,
        });
        if (!consumed) {
          console.error('[placeOrder] consume_credit_grant returned false for request', usedGrantId, '— grant may remain reusable; manual correction required');
        }
      }

      clearCart();
      return { success: true, orderId: order.id };
    }
    return { success: false, error: 'Not authenticated' };
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
    isDealer,
    isCustomer: profileLoaded && Boolean(session?.user?.id) && !isDealer && !isAdmin,
    profileLoaded,
    sessionChecked,
    isAdmin,
    adminChecked,
    dealerApplicationStatus: profile?.dealer_application_status ?? 'none',
    dealer: profile,
    products,
    invoices,
    sendOtp,
    verifyOtp,
    signOut,
    refreshProfile,
    authBusy,
    authError,
    toastMsg,
    toastShow,
    showToast,
    deactivatedAccount,
    clearDeactivated: () => setDeactivatedAccount(false),
    blockedAccount,
    clearBlocked:  () => setBlockedAccount(false),
    markBlocked:   () => setBlockedAccount(true),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
