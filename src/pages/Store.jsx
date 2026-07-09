import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";

// ── Cart helpers ──────────────────────────────────────────────────────────────
function useCart() {
  const [items, setItems] = useState([]);

  const add = (product) =>
    setItems(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });

  const change = (id, delta) =>
    setItems(prev =>
      prev.map(i => i.product.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)
    );

  const clear = () => setItems([]);

  const total = items.reduce((s, i) => s + (Number(i.product.mrp) || 0) * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  return { items, add, change, clear, total, count };
}

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

// Handle image_urls (array or JSON string) or image_url (string)
function getImages(p) {
  let urls = p.image_urls ?? p.image_url ?? null;
  if (!urls) return [];
  if (typeof urls === "string") {
    // Could be a JSON array string or a plain URL
    try { urls = JSON.parse(urls); } catch { urls = [urls]; }
  }
  if (Array.isArray(urls)) return urls.filter(Boolean);
  return [urls].filter(Boolean);
}
function getFirstImage(p) { return getImages(p)[0] || null; }

const CAT_ICONS = {
  "Fans": "🌀", "Wiring Devices": "🔌", "Cables": "🔋", "Lighting": "💡",
  "Switches": "🔘", "MCB": "⚡", "Distribution": "🗂️", "Motors": "⚙️", "Tools": "🔧",
  "Coolers": "❄️", "Geysers": "🔥", "Heaters": "♨️", "Kitchen": "🍳",
};
const catIcon = (name) => CAT_ICONS[name] || "📦";

// ── Indian States list ────────────────────────────────────────────────────────
const INDIAN_STATES = [
  'Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar',
  'Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand',
  'Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra',
  'Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal',
];

// ── Checkout Modal ────────────────────────────────────────────────────────────
function CheckoutModal({ cart, onClose, onConfirm, onLoginClick, initialData, otpVerified, setOtpVerified, effectiveTotal, isCustomer }) {
  const [form, setForm] = useState(initialData || { name: '', phone: '', email: '', line1: '', line2: '', city: '', state: 'Delhi', pincode: '' });
  const [errors, setErrors] = useState({});
  const [dealerBanner, setDealerBanner] = useState(false);
  const [dismissedFor, setDismissedFor] = useState(null);

  // ── Repeat guest OTP state ──
  const [repeatGuest, setRepeatGuest] = useState(false);       // email matched a past guest order
  const [repeatGuestName, setRepeatGuestName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  // otpVerified / setOtpVerified are lifted to Store parent (passed as props)
  const [otpCooldown, setOtpCooldown] = useState(0);
  const otpRefs = useRef([]);
  const cooldownRef = useRef(null);

  const phoneValid = /^\d{10}$/.test(form.phone.trim());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(form.email.trim());

  useEffect(() => {
    if (!phoneValid && !emailValid) setDealerBanner(false);
  }, [phoneValid, emailValid]);

  useEffect(() => {
    if (!phoneValid && !emailValid) return;
    if (
      dismissedFor &&
      dismissedFor.phone === form.phone.trim() &&
      dismissedFor.email === form.email.trim()
    ) return;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('check_dealer_match', {
        check_phone: phoneValid ? form.phone.trim() : null,
        check_email: emailValid ? form.email.trim() : null,
      });
      setDealerBanner(data === true);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.phone, form.email]);

  // Debounced repeat-guest check on email change
  useEffect(() => {
    if (!emailValid) { setRepeatGuest(false); setOtpSent(false); setOtpVerified(false); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('check_repeat_guest', { check_email: form.email.trim() });
      setRepeatGuest(data === true);
      if (data === true) {
        const { data: row } = await supabase
          .from('orders')
          .select('customer_name')
          .is('dealer_id', null)
          .ilike('customer_email', form.email.trim())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setRepeatGuestName(row?.customer_name?.trim() || '');
      } else {
        setOtpSent(false); setOtpVerified(false); setRepeatGuestName('');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.email]);

  const startCooldown = () => {
    setOtpCooldown(30);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendGuestOtp = async () => {
    setOtpError('');
    setOtpBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: form.email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: undefined },
    });
    setOtpBusy(false);
    if (error) { setOtpError(error.message); return; }
    setOtpSent(true);
    setOtpDigits(['', '', '', '', '', '']);
    startCooldown();
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const verifyGuestOtp = async () => {
    const token = otpDigits.join('');
    if (token.length < 6) { setOtpError('Enter all 6 digits'); return; }
    setOtpError('');
    setOtpBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: form.email.trim(), token, type: 'email' });
    if (!error) await supabase.auth.signOut(); // immediately clear transient session
    setOtpBusy(false);
    if (error) { setOtpError('Invalid or expired code. Try again.'); return; }
    setOtpVerified(true);
    clearInterval(cooldownRef.current);
  };

  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpChange = (idx, val) => {
    const ch = val.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[idx] = ch;
    setOtpDigits(next);
    setOtpError('');
    if (ch && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())                    e.name    = 'Required';
    if (!/^\d{10}$/.test(form.phone.trim()))  e.phone   = 'Enter valid 10-digit number';
    if (!form.line1.trim())                   e.line1   = 'Required';
    if (!form.city.trim())                    e.city    = 'Required';
    if (!form.state)                          e.state   = 'Required';
    if (!/^\d{6}$/.test(form.pincode.trim())) e.pincode = 'Enter valid 6-digit pincode';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onConfirm(form, { emailVerified: otpVerified });
  };

  const field = (label, key, opts = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
        {label}
        {!opts.optional && <span style={{ color: '#DC2626' }}> *</span>}
        {opts.optional && <span style={{ color: '#94a3b8', fontWeight: 400 }}> (optional)</span>}
      </label>
      <input
        type={opts.type || 'text'}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        onBlur={opts.onBlur}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder || ''}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: errors[key] ? '1.5px solid #DC2626' : '1.5px solid #ddd', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}
      />
      {errors[key] && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{errors[key]}</div>}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2500 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(480px, 95vw)', maxHeight: '90vh', background: '#fff', borderRadius: 16, zIndex: 2501, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', background: '#7B2D8B', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>📦 Delivery Details</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 6, color: '#fff', width: 32, height: 32, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7B2D8B', marginBottom: 14 }}>Contact</div>
          {field('Full Name', 'name', { placeholder: 'Your full name' })}
          {field('Phone Number', 'phone', { placeholder: '10-digit mobile number', maxLength: 10 })}
          {field('Email', 'email', { type: 'email', placeholder: 'example@email.com', optional: true })}

          <div style={{ fontSize: 13, fontWeight: 700, color: '#7B2D8B', marginBottom: 14, marginTop: 6 }}>Delivery Address</div>
          {field('Address Line 1', 'line1', { placeholder: 'House/Flat no., Street, Area' })}
          {field('Address Line 2', 'line2', { placeholder: 'Landmark, Colony', optional: true })}
          {field('City', 'city', { placeholder: 'City' })}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
              State <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <select
              value={form.state}
              onChange={e => set('state', e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: errors.state ? '1.5px solid #DC2626' : '1.5px solid #ddd', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}
            >
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {errors.state && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{errors.state}</div>}
          </div>

          {field('Pincode', 'pincode', { placeholder: '6-digit pincode', maxLength: 6 })}
        </div>

        <div style={{ padding: '14px 20px 20px', borderTop: '1px solid #eee' }}>
          {/* ── Repeat guest recognition ── */}
          {repeatGuest && !otpVerified && !isCustomer && (
            <div style={{ background: '#e0f7f4', border: '1px solid #00bfa5', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#00695c', marginBottom: 4 }}>
                👋 Welcome back{repeatGuestName ? `, ${repeatGuestName}` : ''}!
              </div>
              <div style={{ fontSize: 12, color: '#004d40', marginBottom: otpSent ? 10 : 8, lineHeight: 1.5 }}>
                We recognise your email from a previous order. Verify to save your details and speed up checkout.
              </div>
              {!otpSent ? (
                <button
                  onClick={sendGuestOtp}
                  disabled={otpBusy}
                  style={{ background: '#00897b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: otpBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {otpBusy ? 'Sending…' : 'Send Verification Code'}
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#004d40', marginBottom: 8 }}>
                    Enter the 6-digit code sent to <strong>{form.email.trim()}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={el => otpRefs.current[i] = el}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKey(i, e)}
                        style={{ width: 36, height: 40, textAlign: 'center', fontSize: 18, fontWeight: 700, borderRadius: 8, border: otpError ? '1.5px solid #DC2626' : '1.5px solid #00bfa5', fontFamily: 'inherit', background: '#fff' }}
                      />
                    ))}
                  </div>
                  {otpError && <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 6 }}>{otpError}</div>}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      onClick={verifyGuestOtp}
                      disabled={otpBusy || otpDigits.join('').length < 6}
                      style={{ background: '#00897b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: otpBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {otpBusy ? 'Verifying…' : 'Verify'}
                    </button>
                    <button
                      onClick={sendGuestOtp}
                      disabled={otpCooldown > 0 || otpBusy}
                      style={{ background: 'none', border: 'none', color: otpCooldown > 0 ? '#94a3b8' : '#00897b', fontSize: 12, cursor: otpCooldown > 0 ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                    >
                      {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {otpVerified && (
            <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>
              ✓ Identity verified — thanks for confirming{repeatGuestName ? `, ${repeatGuestName}` : ''}!
            </div>
          )}
          {dealerBanner && (
            <div style={{ background: '#FF6600', border: '1px solid #E55A00', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 13, color: '#fff', lineHeight: 1.4 }}>
                📋 This contact matches a registered dealer account.{' '}
                <button onClick={onLoginClick} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                  Login as a dealer
                </button>
                {' '}to get special pricing.
              </div>
              <button onClick={() => { setDealerBanner(false); setDismissedFor({ phone: form.phone.trim(), email: form.email.trim() }); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
            <span style={{ color: '#555', fontWeight: 600 }}>Order Total</span>
            <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 18 }}>₹{fmt(effectiveTotal)}</span>
          </div>
          <button onClick={handleSubmit} style={{ width: '100%', padding: '14px 0', background: '#7B2D8B', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>
            Continue to Payment →
          </button>
        </div>
      </div>
    </>
  );
}

// ── Cart Drawer ───────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose, onLoginClick, onCheckout, getPrice }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1999 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(380px, 100vw)", background: "#fff",
        zIndex: 2000, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#7B2D8B" }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>
            🛒 Cart {cart.count > 0 && <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.85 }}>({cart.count})</span>}
          </span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 6, color: "#fff", width: 32, height: 32, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {cart.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🛒</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Your cart is empty</div>
            </div>
          ) : cart.items.map(({ product: p, qty }) => (
            <div key={p.id} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ width: 60, height: 60, borderRadius: 8, overflow: "hidden", border: "1px solid #eee", flexShrink: 0, background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {getFirstImage(p)
                  ? <img src={getFirstImage(p)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <span style={{ fontSize: 26 }}>📦</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#DC2626" }}>
                  ₹{fmt(getPrice(p))}
                  {getPrice(p) < Number(p.mrp) && (
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginLeft: 4, textDecoration: "line-through" }}>₹{fmt(p.mrp)}</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <button onClick={() => cart.change(p.id, +1)} style={qtyBtnStyle}>+</button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{qty}</span>
                <button onClick={() => cart.change(p.id, -1)} style={qtyBtnStyle}>−</button>
              </div>
            </div>
          ))}
        </div>

        {cart.items.length > 0 && (
          <div style={{ padding: "14px 16px", borderTop: "2px solid #eee" }}>
            {(() => {
              const drawerTotal = cart.items.reduce((s, { product, qty }) => s + getPrice(product) * qty, 0);
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>Your Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#1e293b" }}>₹{fmt(drawerTotal)}</span>
                </div>
              );
            })()}
            <button
              onClick={onCheckout}
              style={{ width: "100%", padding: "14px 0", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", position: "relative", zIndex: 10, pointerEvents: "all" }}
            >
              Proceed to Pay →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const qtyBtnStyle = {
  width: 28, height: 28, border: "1.5px solid #e2e8f0", borderRadius: 6,
  background: "#f8f8f8", cursor: "pointer", fontSize: 15, fontWeight: 700,
  lineHeight: 1, padding: 0, fontFamily: "inherit",
};

// ── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({ cat, count, image, isAll, onClick }) {
  const [hov, setHov] = useState(false);
  const bg = isAll
    ? "linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%)"
    : image
      ? `url(${image})`
      : "linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%)";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="cat-card"
      style={{
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: hov ? "scale(1.03)" : "scale(1)",
        boxShadow: hov ? "0 0 0 3px #7B2D8B, 0 8px 24px rgba(123,45,139,.3)" : "0 2px 12px rgba(0,0,0,.15)",
      }}
    >
      <div className="cat-card-overlay" style={{ background: hov ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.35)" }} />
      <div className="cat-card-content">
        <span className="cat-card-icon">{catIcon(cat)}</span>
        <div className="cat-card-name">{cat}</div>
        <div className="cat-card-count">{count} Product{count !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product: p, onAdd, onSelect, qty, onIncrease, onDecrease, effectivePrice, pricingMode }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={() => { onSelect(p); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #edf0f7",
        boxShadow: hov ? "0 8px 28px rgba(124,58,237,.14)" : "0 1px 6px rgba(0,0,0,.06)",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all .18s", overflow: "hidden",
        display: "flex", flexDirection: "column",
        cursor: "pointer",
      }}
    >
      <div style={{ background: "#f9f8ff", position: "relative", paddingTop: "75%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
          {getFirstImage(p)
            ? <img src={getFirstImage(p)} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 40, opacity: 0.35 }}>📦</span>}
        </div>
        {p.category && (
          <span style={{ position: "absolute", top: 6, left: 6, background: "#7B2D8B", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {p.category}
          </span>
        )}
        {pricingMode === 'guest-verified' && (
          <span style={{ position: "absolute", top: 6, right: 6, background: "#E8001C", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 20 }}>
            -15%
          </span>
        )}
      </div>

      <div style={{ padding: "10px 10px 8px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b", lineHeight: 1.4, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: "2.8em" }}>
          {p.name}
        </div>

        <div>
          {p.sku      && <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU <span style={{ color: "#64748b", fontWeight: 600 }}>{p.sku}</span></div>}
          {p.hsn_code && <div style={{ fontSize: 10, color: "#94a3b8" }}>HSN <span style={{ color: "#64748b", fontWeight: 600 }}>{p.hsn_code}</span></div>}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            {pricingMode === 'guest-verified' && (
              <span style={{ fontSize: 9, color: "#94a3b8", textDecoration: "line-through" }}>₹{fmt(p.mrp)}</span>
            )}
            <span style={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>₹{fmt(effectivePrice)}</span>
          </div>
          {pricingMode === 'guest-verified' && (
            <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, marginTop: 1 }}>
              15% off MRP
            </div>
          )}
          {pricingMode === 'dealer' && (
            <div style={{ fontSize: 10, color: "#7B2D8B", fontWeight: 700, marginTop: 1 }}>
              Your dealer price
            </div>
          )}
        </div>

        {!qty ? (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p); }}
            style={{ width: "100%", padding: "8px 0", background: hov ? "#6A1F7A" : "#7B2D8B", color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background .15s", marginTop: 2 }}
          >
            + Add to Cart
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#7B2D8B", borderRadius: 7, overflow: "hidden", width: "100%", marginTop: 2 }}>
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onDecrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 20, fontWeight: "bold", cursor: "pointer", padding: "6px 14px", lineHeight: 1 }}>−</button>
            <span style={{ color: "white", fontWeight: "bold", fontSize: 14 }}>{qty}</span>
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onIncrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 20, fontWeight: "bold", cursor: "pointer", padding: "6px 14px", lineHeight: 1 }}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Product Detail View ───────────────────────────────────────────────────────
function ProductDetailView({ product: p, onBack, onAdd, qty, onIncrease, onDecrease, effectivePrice, pricingMode }) {
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);
  const [showItemDetails, setShowItemDetails] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const images = getImages(p);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  const handleShare = async () => {
    const productUrl = `${window.location.origin}/store?product=${p.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text: `Check out ${p.name} - MRP ₹${p.mrp}`, url: productUrl });
      } catch (_) {}
    } else {
      setShareUrl(productUrl);
      setShowShareModal(true);
    }
  };

  const handleDownload = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = (p.name || "product") + ".jpg";
    a.target = "_blank";
    a.click();
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <button
        onClick={onBack}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1.5px solid #7B2D8B", color: "#7B2D8B", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}
      >
        ← Back to Products
      </button>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {/* Left: image viewer */}
        <div style={{ flex: "0 0 420px", minWidth: 0, display: "flex", gap: 10 }}>

          {/* Thumbnail column — left of main image */}
          {images.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 72, flexShrink: 0, overflowY: "auto", maxHeight: 440 }}>
              {images.map((url, i) => (
                <div
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{
                    width: 70, height: 70, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                    border: i === activeImg ? "2px solid #7B2D8B" : "2px solid transparent",
                    cursor: "pointer", background: "#f9f8ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: i === activeImg ? 1 : 0.6,
                    transition: "opacity .15s, border-color .15s",
                    boxShadow: i === activeImg ? "0 0 0 1px #7B2D8B" : "0 1px 4px rgba(0,0,0,.1)",
                  }}
                >
                  <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          )}

          {/* Main image */}
          <div
            onClick={() => images[activeImg] && setLightbox(true)}
            style={{
              flex: 1, background: "#f9f8ff", borderRadius: 14, overflow: "hidden",
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "20px 40px 20px 20px", backgroundColor: "#f9f9f9",
              borderRadius: 12, margin: "0 16px 0 0", minHeight: 380,
              border: "1px solid #edf0f7", cursor: images[activeImg] ? "zoom-in" : "default",
              position: "relative",
            }}
          >
            {images[activeImg]
              ? <img src={images[activeImg]} alt={p.name} style={{ maxWidth: "85%", maxHeight: 360, objectFit: "contain", cursor: "zoom-in", display: "block", margin: "0 auto" }} />
              : <span style={{ fontSize: 80, opacity: 0.2 }}>📦</span>}
            {images[activeImg] && (
              <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 11, color: "#94a3b8", background: "rgba(255,255,255,.8)", borderRadius: 6, padding: "2px 8px" }}>
                🔍 Click to zoom
              </span>
            )}
          </div>
        </div>

        {/* Right: info */}
        <div style={{ flex: 1, minWidth: 260 }}>
          {p.category && (
            <span style={{ display: "inline-block", background: "#7B2D8B", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {p.category}
            </span>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", lineHeight: 1.3, margin: "0 0 8px" }}>{p.name}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px 0' }}>
            <button
              onClick={handleShare}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: '1px solid #7B2D8B', background: 'white', color: '#7B2D8B', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}
            >
              🔗 Share This Product
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {p.sku      && <div style={{ fontSize: 13, color: "#64748b" }}>SKU: <strong style={{ color: "#334155" }}>{p.sku}</strong></div>}
            {p.hsn_code && <div style={{ fontSize: 13, color: "#64748b" }}>HSN Code: <strong style={{ color: "#334155" }}>{p.hsn_code}</strong></div>}
            {p.unit     && <div style={{ fontSize: 13, color: "#64748b" }}>Unit: <strong style={{ color: "#334155" }}>{p.unit}</strong></div>}
          </div>

          <div style={{ background: "#fff7f7", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
              {pricingMode === 'dealer' ? 'Your Price (incl. all taxes)' : 'Price (incl. all taxes)'}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: "#DC2626" }}>₹{fmt(effectivePrice)}</span>
              {pricingMode === 'guest-verified' && (
                <>
                  <span style={{ fontSize: 16, color: "#94a3b8", textDecoration: "line-through" }}>₹{fmt(p.mrp)}</span>
                  <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>15% off</span>
                </>
              )}
              {pricingMode === 'full' && (
                <span style={{ fontSize: 13, color: "#94a3b8" }}>MRP</span>
              )}
            </div>
          </div>

          {!qty ? (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p); }}
              style={{ width: "100%", padding: "13px 0", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}
            >
              + Add to Cart
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#7B2D8B", borderRadius: 10, overflow: "hidden", width: "100%", marginBottom: 10 }}>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onDecrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 28, fontWeight: "bold", cursor: "pointer", padding: "10px 20px", lineHeight: 1 }}>−</button>
              <span style={{ color: "white", fontWeight: "bold", fontSize: 20 }}>{qty}</span>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onIncrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 28, fontWeight: "bold", cursor: "pointer", padding: "10px 20px", lineHeight: 1 }}>+</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Sign up to place orders at dealer pricing
          </div>

          {/* Quick specs */}
          {(p.standard_packing || p.unit || p.brand || p.warranty) && (
            <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[
                    ["Brand", p.brand],
                    ["Unit", p.unit],
                    ["Standard Packing", p.standard_packing ? `${p.standard_packing} pcs` : null],
                    ["Warranty", p.warranty],
                    ["Colour", p.colour],
                    ["Material", p.material],
                    ["Weight", p.weight],
                    ["Dimensions", p.dimensions],
                    ["Power Source", p.power_source],
                    ["Wattage", p.wattage],
                    ["Voltage", p.voltage],
                    ["Mounting Type", p.mounting_type],
                    ["Room Type", p.room_type],
                  ].filter(([, v]) => v).map(([label, val], i, arr) => (
                    <tr key={label} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "9px 14px", color: "#64748b", width: "42%", fontSize: 12 }}>{label}</td>
                      <td style={{ padding: "9px 14px", color: "#1e293b", fontWeight: 600 }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── About This Item (collapsible) ── */}
      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
        <div
          onClick={() => setShowAbout(!showAbout)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#7B2D8B', cursor: 'pointer', userSelect: 'none' }}
        >
          <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>📋 About This Item</h3>
          <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showAbout ? '▲' : '▼'}</span>
        </div>
        {showAbout && (
          <div style={{ padding: 16, background: '#fafafa' }}>
            {Array.isArray(p.about_item) && p.about_item.filter(Boolean).length > 0 ? (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {p.about_item.filter(Boolean).map((pt, i) => (
                  <li key={i} style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.6 }}>{pt}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#bbb', fontSize: 14, margin: 0 }}>No description added yet</p>
            )}
          </div>
        )}
      </div>

      {/* ── Features & Specs (collapsible) ── */}
      {(() => {
        const SPEC_FIELDS = [
          { key: 'power_source', label: 'Power Source' },
          { key: 'room_type', label: 'Room Type' },
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'special_features', label: 'Special Features' },
          { key: 'recommended_use', label: 'Recommended Use' },
          { key: 'colour', label: 'Colour' },
          { key: 'style', label: 'Style' },
          { key: 'material', label: 'Material' },
          { key: 'wattage', label: 'Wattage' },
          { key: 'voltage', label: 'Voltage' },
          { key: 'speed', label: 'Speed' },
          { key: 'capacity', label: 'Capacity' },
          { key: 'warranty', label: 'Warranty' },
          { key: 'weight', label: 'Weight' },
          { key: 'dimensions', label: 'Dimensions' },
        ];
        const ITEM_DETAIL_FIELDS = [
          { key: 'brand', label: 'Brand' },
          { key: 'colour', label: 'Colour' },
          { key: 'style', label: 'Style' },
          { key: 'warranty', label: 'Warranty' },
          { key: 'weight', label: 'Weight' },
          { key: 'dimensions', label: 'Dimensions' },
          { key: 'material', label: 'Material' },
          { key: 'wattage', label: 'Wattage' },
          { key: 'voltage', label: 'Voltage' },
          { key: 'power_source', label: 'Power Source' },
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'room_type', label: 'Room Type' },
          { key: 'special_features', label: 'Special Features' },
        ];
        const specsVis = p.features_specs?.visibility || {};
        const specs = p.features_specs?.values || {};
        const itemVis = p.item_details?.visibility || {};
        const itemDetails = p.item_details?.values || {};
        const hdrStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#7B2D8B', cursor: 'pointer', userSelect: 'none' };
        const renderRow = (key, label, val, vis) => {
          if (vis[key] === false) return null;
          return (
            <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, width: '40%', background: '#f9f9f9', fontSize: 14 }}>{label}</td>
              <td style={{ padding: '10px 12px', fontSize: 14, color: val ? '#333' : '#bbb' }}>{val || '—'}</td>
            </tr>
          );
        };
        return (
          <>
            <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setShowSpecs(!showSpecs)} style={hdrStyle}>
                <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>⚡ Features &amp; Specs</h3>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showSpecs ? '▲' : '▼'}</span>
              </div>
              {showSpecs && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>{SPEC_FIELDS.map(({ key, label }) => renderRow(key, label, specs[key], specsVis))}</tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setShowItemDetails(!showItemDetails)} style={hdrStyle}>
                <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>📦 Item Details</h3>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showItemDetails ? '▲' : '▼'}</span>
              </div>
              {showItemDetails && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>{ITEM_DETAIL_FIELDS.map(({ key, label }) => renderRow(key, label, itemDetails[key], itemVis))}</tbody>
                </table>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Share Modal ── */}
      {showShareModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, padding: 24, width: 320, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Share This Product</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={shareUrl}
                readOnly
                style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Link copied!'); }}
                style={{ padding: '8px 12px', background: '#7B2D8B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Copy
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(p.name + ' - MRP ₹' + p.mrp + '\n' + shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#25D366', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                📱 WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#1877F2', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                👍 Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(p.name)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#1DA1F2', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                🐦 Twitter
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(p.name)}&body=${encodeURIComponent('Check out ' + p.name + ' - MRP ₹' + p.mrp + '\n' + shareUrl)}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#64748b', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                📧 Email
              </a>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              style={{ marginTop: 16, width: '100%', padding: '10px', background: 'none', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: '#64748b' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && images[activeImg] && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* Controls top-right */}
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => handleDownload(images[activeImg])}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              ⬇️ Download
            </button>
            <button
              onClick={() => setLightbox(false)}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, width: 40, height: 40, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <img
            src={images[activeImg]}
            alt={p.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }}
          />

          {/* Thumbnail strip at bottom */}
          {images.length > 1 && (
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
              {images.map((url, i) => (
                <div
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{ width: 52, height: 52, borderRadius: 6, overflow: "hidden", border: i === activeImg ? "2px solid #fff" : "2px solid rgba(255,255,255,.3)", cursor: "pointer", background: "#222", flexShrink: 0 }}
                >
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Store() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState(null); // null = show category landing
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showFanmanModal, setShowFanmanModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastProduct, setToastProduct] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const productsRef = useRef(null);
  const containerRef = useRef(null);
  const cart = useCart();
  const { session, dealer, isDealer, isCustomer } = useApp();
  const [showCheckout, setShowCheckout] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const savedCheckoutData = useRef(null);

  const getPrice = useCallback((p) => {
    if (isDealer) {
      const d1 = Number(dealer?.discount1 || 0);
      const d2 = Number(dealer?.discount2 || 0);
      return Math.round(Number((p.dlp ?? p.mrp) || 0) * (1 - d1 / 100) * (1 - d2 / 100) * 100) / 100;
    }
    if (otpVerified || isCustomer) return Math.round(Number(p.mrp || 0) * 0.85);
    return Number(p.mrp || 0);
  }, [isDealer, otpVerified, isCustomer, dealer]);

  const effectiveTotal = useMemo(
    () => cart.items.reduce((s, i) => s + getPrice(i.product) * i.qty, 0),
    [cart.items, getPrice]
  );

  const pricingMode = isDealer ? 'dealer' : (otpVerified || isCustomer) ? 'guest-verified' : 'full';

  const cartQty = Object.fromEntries(cart.items.map(i => [i.product.id, i.qty]));

  const handleAddToCart = (product) => {
    cart.add(product);
    setToastProduct(product);
    setShowToast(true);
  };

  const handleIncrease = (id) => cart.change(id, +1);
  const handleDecrease = (id) => cart.change(id, -1);

  const handlePayment = (data, { emailVerified = false } = {}) => {
    // Snapshot pricing at call time — avoids stale closures in the async Razorpay handler
    const d1 = isDealer ? Number(dealer?.discount1 || 0) : 0;
    const d2 = isDealer ? Number(dealer?.discount2 || 0) : 0;
    const capturedItems = cart.items.map(i => ({ ...i, effectivePrice: getPrice(i.product) }));
    const capturedTotal = capturedItems.reduce((s, i) => s + i.effectivePrice * i.qty, 0);

    const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!RAZORPAY_KEY) {
      console.error('VITE_RAZORPAY_KEY_ID is not set!');
      alert('Payment gateway is not configured. Please contact support.');
      return;
    }

    const existingScript = document.getElementById('razorpay-script');
    if (existingScript) existingScript.remove();

    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    script.onload = () => {
      const options = {
        key: RAZORPAY_KEY,
        amount: Math.round(capturedTotal * 100),
        currency: 'INR',
        name: 'Eltop by Embassy',
        description: 'Product Order',
        image: '/assets/ELTOP%20LOGO.png',
        prefill: { name: data.name, email: data.email || '', contact: data.phone },
        handler: async function (response) {
          const { razorpay_payment_id } = response;
          console.log('Payment success:', razorpay_payment_id);

          const grossTotal   = capturedTotal;
          const taxableValue = grossTotal / 1.18;
          const totalTax     = grossTotal - taxableValue;
          const isDelhi      = data.state === 'Delhi';
          const cgst         = isDelhi ? Math.round(totalTax / 2 * 100) / 100 : 0;
          const sgst         = isDelhi ? Math.round(totalTax / 2 * 100) / 100 : 0;
          const igst         = isDelhi ? 0 : Math.round(totalTax * 100) / 100;
          const subtotal     = Math.round(taxableValue * 100) / 100;
          const tax          = Math.round(totalTax * 100) / 100;
          const total        = Math.round(grossTotal);
          const deliveryAddress = [data.line1, data.line2, data.city, data.state, data.pincode].filter(Boolean).join(', ');

          // 1. Insert order row
          const { data: orderRows, error: orderError } = await supabase
            .from('orders')
            .insert([{
              dealer_id:        isDealer ? session.user.id : null,
              customer_name:    data.name,
              customer_phone:   data.phone,
              customer_email:   data.email || null,
              subtotal:         Math.round(subtotal * 100) / 100,
              tax,
              cgst,
              sgst,
              igst,
              total,
              delivery_address: deliveryAddress,
              payment_id:       razorpay_payment_id,
              payment_status:   'paid',
              status:           'confirmed',
              email_verified:   emailVerified || false,
              created_at:       new Date().toISOString(),
            }])
            .select('id');

          console.log('Order insert result:', orderRows, orderError);

          if (orderError) {
            console.error('Order insert error:', orderError);
            alert('Payment done but order save failed.\nPayment ID: ' + razorpay_payment_id + '\nError: ' + orderError.message);
            return;
          }

          const orderId = orderRows[0].id;

          // 2. Insert order_items
          const orderItems = capturedItems.map(item => ({
            order_id:   orderId,
            product_id: item.product.id,
            name:       item.product.name,
            price:      Math.round(item.effectivePrice * 100) / 100,
            qty:        item.qty,
            mrp:        item.product.mrp ?? null,
            dlp:        item.product.dlp ?? item.product.mrp ?? null,
            net_rate:   Math.round(item.effectivePrice * 100) / 100,
            discount1:  d1,
            discount2:  d2,
            hsn_code:   item.product.hsn_code ?? null,
          }));

          const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

          console.log('Order items insert error:', itemsError);

          if (itemsError) {
            console.error('Order items error:', itemsError);
            alert('Order saved but items failed.\nPayment ID: ' + razorpay_payment_id + '\nError: ' + itemsError.message);
            return;
          }

          cart.clear();
          setCartOpen(false);
          setShowToast(false);
          alert('✅ Order Confirmed!\nPayment ID: ' + razorpay_payment_id);
        },
        theme: { color: '#7B2D8B' },
        modal: {
          ondismiss: () => setShowCheckout(true),
          escape: true,
          animation: false,
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    };

    script.onerror = () => alert('Failed to load payment gateway. Please try again.');
    document.body.appendChild(script);
  };

  const scrollToTop = () => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase
      .from("products")
      .select("id, name, mrp, unit, stock, hsn_code, category, image_urls, image_url, sku, about_item, brand, colour, style, dimensions, room_type, special_features, recommended_use, mounting_type, power_source, material, wattage, voltage, warranty, weight, features_specs, item_details, standard_packing")
      .order("category", { nullsFirst: true })
      .order("name")
      .then(({ data, error }) => {
        console.log("products:", data, "error:", error);
        if (data) setProducts(data);
        setLoading(false);
      });
  }, []);

  // Open product from URL ?product=ID
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId && products.length > 0 && !selectedProduct) {
      const found = products.find(p => String(p.id) === String(productId));
      if (found) { setSelectedProduct(found); scrollToTop(); }
    }
  }, [searchParams, products]);

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [products]);

  // Category metadata: count + first image
  const catMeta = useMemo(() => {
    const meta = {};
    for (const cat of categories) {
      const prods = products.filter(p => p.category === cat);
      meta[cat] = {
        count: prods.length,
        image: getFirstImage(prods.find(p => getFirstImage(p)) || {}),
      };
    }
    return meta;
  }, [categories, products]);

  const filtered = useMemo(() => {
    if (!category && !search) return [];
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchCat = !category || category === "All" || p.category === category;
      const matchQ   = !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.hsn_code?.includes(q);
      return matchCat && matchQ;
    });
  }, [products, search, category]);

  // When search is typed from landing, switch to "All" view
  function handleSearch(val) {
    setSearch(val);
    if (val && !category) setCategory("All");
  }

  function selectCategory(cat) {
    setCategory(cat);
    scrollToTop();
  }

  function backToCategories() {
    setCategory(null);
    setSearch("");
    scrollToTop();
  }

  const showLanding = !category && !search;

  return (
    <div className="store-root" ref={containerRef}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .store-root { min-height: 100vh; background: #F1F3F6; font-family: inherit; overflow-x: hidden; max-width: 100vw; }

        /* ── Header ── */
        .store-header { position: sticky; top: 0; z-index: 200; background: #FFFFFF; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
        .store-header-inner { max-width: 1400px; margin: 0 auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
        .store-row1 { display: flex; align-items: center; gap: 12px; width: 100%; justify-content: space-between; }
        .store-row2 { display: flex; width: 100%; }
        .store-search-wrap { display: flex; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.2); flex: 1; min-width: 0; }
        .store-search-wrap input { flex: 1; padding: 9px 14px; border: none; outline: none; font-size: 14px; font-family: inherit; min-width: 0; width: 100%; }
        .store-search-icon { background: #F59E0B; padding: 0 16px; display: flex; align-items: center; justify-content: center; font-size: 17px; cursor: pointer; flex-shrink: 0; }
        .store-row1-search { display: none; }
        @media (min-width: 640px) {
          .store-header-inner { flex-direction: row; align-items: center; padding: 10px 20px; gap: 16px; justify-content: space-between; }
          .store-row1 { flex: none; }
          .store-row2 { display: none; }
          .store-row1-search { display: flex; flex: 0 1 400px; max-width: 400px; min-width: 0; }
        }

        /* Header right buttons */
        .store-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .btn-login-primary { background: #7B2D8B; border: none; border-radius: 8px; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 14px; cursor: pointer; white-space: nowrap; font-family: inherit; }
        .btn-dealer-login { background: none; border: 1.5px solid #7B2D8B; border-radius: 8px; color: #7B2D8B; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; text-decoration: none; padding: 7px 12px; }
        .store-cart-btn { background: none; border: none; color: #7B2D8B; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 2px 8px; position: relative; flex-shrink: 0; }
        @media (max-width: 639px) {
          .btn-login-primary { font-size: 11px; padding: 7px 10px; }
          .btn-dealer-login  { display: none; }
        }

        /* Hero banner */
        .store-hero { background: linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%); color: #fff; text-align: center; padding: 28px 20px; }
        .store-hero-title { font-weight: 900; font-size: 22px; margin-bottom: 6px; }
        .store-hero-sub { font-size: 15px; opacity: 0.9; margin-bottom: 16px; }
        .store-hero-btn { display: inline-block; background: #fff; color: #7B2D8B; font-weight: 800; font-size: 14px; padding: 10px 24px; border-radius: 24px; cursor: pointer; border: none; font-family: inherit; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
        @media (max-width: 639px) {
          .store-hero { padding: 18px 14px; }
          .store-hero-title { font-size: 16px; }
          .store-hero-sub   { font-size: 12px; }
          .store-hero-btn   { font-size: 13px; padding: 9px 20px; }
        }

        /* Category card grid */
        .cat-grid-wrap { max-width: 1400px; margin: 0 auto; padding: 24px 16px 40px; }
        .cat-grid-title { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 16px; }
        .cat-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 640px)  { .cat-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; } }
        @media (min-width: 1024px) { .cat-grid { grid-template-columns: repeat(4, 1fr); } }

        .cat-card {
          position: relative; height: 200px; border-radius: 14px; overflow: hidden;
          cursor: pointer; transition: transform .2s, box-shadow .2s;
        }
        .cat-card-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,.7) 100%);
          transition: background .2s;
        }
        .cat-card-content {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 14px 16px; color: #fff;
        }
        .cat-card-icon { font-size: 22px; display: block; margin-bottom: 4px; }
        .cat-card-name { font-size: 16px; font-weight: 800; line-height: 1.2; text-shadow: 0 1px 4px rgba(0,0,0,.5); }
        .cat-card-count { font-size: 12px; opacity: 0.85; margin-top: 2px; font-weight: 500; }
        @media (max-width: 639px) {
          .cat-card { height: 160px; }
          .cat-card-name { font-size: 14px; }
        }

        /* Product section */
        .store-content { max-width: 1400px; margin: 0 auto; padding: 16px 12px 80px; }
        .store-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 480px)  { .store-grid { gap: 12px; } }
        @media (min-width: 640px)  { .store-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
        @media (min-width: 900px)  { .store-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1200px) { .store-grid { grid-template-columns: repeat(5, 1fr); } }

        /* Skeleton */
        .store-skeleton { border-radius: 10px; background: #e2e8f0; animation: pulse 1.4s ease infinite; }
        .cat-skeleton { border-radius: 14px; background: #e2e8f0; animation: pulse 1.4s ease infinite; height: 200px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

        /* Back button */
        .back-btn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1.5px solid #7B2D8B; color: #7B2D8B; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; margin-bottom: 16px; transition: background .15s; }
        .back-btn:hover { background: #7B2D8B; color: #fff; }
      `}</style>

      {/* ── Header ── */}
      <header className="store-header">
        <div className="store-header-inner">
          <div className="store-row1">
            {/* Dual logos */}
            <div
              onClick={() => { setSelectedProduct(null); setCategory(null); navigate('/store'); scrollToTop(); }}
              title="Go to Home"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px', minWidth: '280px', flexShrink: 0, cursor: 'pointer' }}
            >
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start' }}>
                <img
                  src="/assets/ELTOP%20LOGO.png"
                  alt="Eltop"
                  style={{ height: '60px', width: 'auto', objectFit: 'contain', display: 'block', filter: 'brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' }}
                  onError={e => e.target.style.display = 'none'}
                />
                <span style={{ fontSize: '10px', color: '#FF0000', fontWeight: 'bold', lineHeight: 1 }}>®</span>
              </div>
              <img
                src="/assets/EMBASSY%20LOGO.png"
                alt="Embassy"
                style={{ height: '50px', width: 'auto', objectFit: 'contain', display: 'block', filter: 'brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' }}
                onError={e => e.target.style.display = 'none'}
              />
            </div>

            {/* Search — desktop only */}
            <div className="store-row1-search">
              <div className="store-search-wrap">
                <input type="search" placeholder="Search for electrical products…"
                  value={search} onChange={e => handleSearch(e.target.value)} />
                <div className="store-search-icon">🔍</div>
              </div>
            </div>

            {/* Actions */}
            <div className="store-header-actions">
              <button className="btn-login-primary" onClick={() => navigate("/login")}>
                👤 Login / Sign Up
              </button>
              <button className="btn-dealer-login" onClick={() => navigate("/login")}>
                🤝 Dealer Login
              </button>
              <button className="store-cart-btn" onClick={() => setCartOpen(true)}>
                <span style={{ fontSize: 22 }}>🛒</span>
                <span style={{ fontSize: 10, color: "#7B2D8B", fontWeight: 700 }}>Cart</span>
                {cart.count > 0 && (
                  <span style={{ position: "absolute", top: 0, right: 4, background: "#F59E0B", color: "#1e293b", fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                    {cart.count}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: search — mobile only */}
          <div className="store-row2">
            <div className="store-search-wrap">
              <input type="search" placeholder="Search products…"
                value={search} onChange={e => handleSearch(e.target.value)} />
              <div className="store-search-icon">🔍</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero banner ── */}
      {!selectedProduct && (
        <div style={{ background: 'linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '30px 20px' : '0 60px', minHeight: 200 }}>
          {/* Text content */}
          <div style={{ flex: 1, textAlign: 'center', zIndex: 2, padding: '30px 0' }}>
            <div className="store-hero-title">Welcome to Eltop by Embassy</div>
            <div className="store-hero-sub">✨ Sign up &amp; get Flat 15% OFF on your first order!</div>
            <button className="store-hero-btn" onClick={() => navigate("/login")}>Claim 15% Discount →</button>
          </div>
        </div>
      )}

      {/* ── Category landing grid ── */}
      {!selectedProduct && showLanding && (
        <div className="cat-grid-wrap">
          <div className="cat-grid-title">Shop by Category</div>
          {loading ? (
            <div className="cat-grid">
              {[...Array(8)].map((_, i) => <div key={i} className="cat-skeleton" />)}
            </div>
          ) : (
            <div className="cat-grid">
              {categories.map(cat => (
                <CategoryCard
                  key={cat}
                  cat={cat}
                  count={catMeta[cat]?.count || 0}
                  image={catMeta[cat]?.image}
                  isAll={false}
                  onClick={() => selectCategory(cat)}
                />
              ))}
              {/* All Products card — last */}
              <CategoryCard
                cat="All Products"
                count={products.length}
                image={null}
                isAll={true}
                onClick={() => selectCategory("All")}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Product grid (shown when category selected or searching) ── */}
      {selectedProduct && (
        <ProductDetailView
          product={selectedProduct}
          onBack={() => { setSelectedProduct(null); navigate('/store'); scrollToTop(); }}
          onAdd={p => { handleAddToCart(p); }}
          qty={cartQty[selectedProduct.id]}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
          effectivePrice={getPrice(selectedProduct)}
          pricingMode={pricingMode}
        />
      )}

      {!selectedProduct && !showLanding && (
        <div className="store-content" ref={productsRef}>
          <button className="back-btn" onClick={backToCategories}>
            ← Back to Categories
          </button>

          {/* Section heading */}
          {category && category !== "All" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>{catIcon(category)}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{category}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{(catMeta[category]?.count || 0)} products</div>
              </div>
            </div>
          )}

          {/* Result count */}
          {!loading && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "#64748b" }}>
              {search
                ? <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> results for "{search}"{category && category !== "All" ? ` in ${category}` : ""}</>
                : <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> products{category && category !== "All" ? ` in ${category}` : ""}</>
              }
            </div>
          )}

          {loading ? (
            <div className="store-grid">
              {[...Array(10)].map((_, i) => <div key={i} className="store-skeleton" style={{ height: 300 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>🔍</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#475569", marginBottom: 6 }}>No products found</div>
              <div style={{ fontSize: 13 }}>Try a different search or category</div>
            </div>
          ) : (
            <div className="store-grid">
              {filtered.map(p => <ProductCard key={p.id} product={p} onAdd={handleAddToCart} onSelect={p => { setSelectedProduct(p); navigate(`/store?product=${p.id}`); scrollToTop(); }} qty={cartQty[p.id]} onIncrease={handleIncrease} onDecrease={handleDecrease} effectivePrice={getPrice(p)} pricingMode={pricingMode} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <CartDrawer cart={cart} onClose={() => setCartOpen(false)}
          onLoginClick={() => { setCartOpen(false); navigate("/login"); }}
          onCheckout={() => { setCartOpen(false); setShowCheckout(true); }}
          getPrice={getPrice} />
      )}
      {showCheckout && (
        <CheckoutModal
          cart={cart}
          onClose={() => setShowCheckout(false)}
          onConfirm={(data, opts) => { const finalOpts = { ...opts, emailVerified: opts.emailVerified || isCustomer }; savedCheckoutData.current = { data, opts: finalOpts }; setShowCheckout(false); handlePayment(data, finalOpts); }}
          onLoginClick={() => { setShowCheckout(false); navigate('/login'); }}
          initialData={savedCheckoutData.current?.data}
          otpVerified={otpVerified}
          setOtpVerified={setOtpVerified}
          effectiveTotal={effectiveTotal}
          isCustomer={isCustomer}
        />
      )}

      {/* ── Bottom bar: Social + Care + WhatsApp ── */}
      <div style={{ background: '#1A1A1A', color: 'white', padding: isMobile ? '16px 20px' : '16px 40px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', gap: '16px', textAlign: isMobile ? 'center' : 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#aaa', fontSize: '12px' }}>FOLLOW US</span>
          <a href="https://facebook.com" target="_blank" rel="noreferrer">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M16 8h-2a1 1 0 00-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 014-4h2v3z" fill="white"/></svg>
          </a>
          <a href="https://twitter.com" target="_blank" rel="noreferrer">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="black"/><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="white"/></svg>
          </a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="igGrad" x1="0" y1="24" x2="24" y2="0"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#dc2743"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#igGrad)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8a3 3 0 110-6 3 3 0 010 6zm5.2-8.8a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/><rect x="3" y="3" width="18" height="18" rx="5" stroke="white" strokeWidth="2" fill="none"/></svg>
          </a>
          <a href="https://youtube.com" target="_blank" rel="noreferrer">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#FF0000"/><path d="M19.615 7.184A2.5 2.5 0 0017.85 5.4C16.265 5 12 5 12 5s-4.265 0-5.85.4a2.5 2.5 0 00-1.765 1.784C4 8.77 4 12 4 12s0 3.23.385 4.816A2.5 2.5 0 006.15 18.6C7.735 19 12 19 12 19s4.265 0 5.85-.4a2.5 2.5 0 001.765-1.784C20 15.23 20 12 20 12s0-3.23-.385-4.816zM10 15V9l5 3-5 3z" fill="white"/></svg>
          </a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a href="tel:18001230906" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: 'white' }}>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Eltop Care — Toll Free</span>
            <span style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', letterSpacing: '1px', color: 'white' }}>1800-123-0906</span>
          </a>
          <div style={{ width: '1px', height: '40px', background: '#444' }}></div>
          <a href="https://wa.me/919310159139" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', textDecoration: 'none' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#aaa' }}>WhatsApp</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>9310159139</span>
            </div>
          </a>
        </div>
      </div>

      {/* ── Main footer ── */}
      <div style={{ background: '#111', color: '#ccc', padding: isMobile ? '24px 16px' : '40px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? '28px' : '40px' }}>
        {/* Column 1: Head Office */}
        <div>
          <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold', borderBottom: '2px solid #FF0000', paddingBottom: '8px', display: 'inline-block' }}>HEAD OFFICE</h4>
          <p style={{ fontSize: '13px', lineHeight: '1.8', margin: 0 }}>
            Embassy Electricals (India) Pvt. Ltd.<br/>
            Kh. No. 154/632, Phirni Road,<br/>
            Pooth Khurd, Bawana Ind. Area,<br/>
            Delhi - 110039<br/><br/>
            <strong style={{ color: 'white' }}>Ph:</strong>{' '}<a href="tel:+919310159139" style={{ color: '#ccc', textDecoration: 'none' }}>+91 93101 59139</a><br/>
            <strong style={{ color: 'white' }}>Email:</strong>{' '}<a href="mailto:embassyelectricindia@gmail.com" style={{ color: '#ccc', textDecoration: 'none' }}>embassyelectricindia@gmail.com</a><br/>
            <strong style={{ color: 'white' }}>GSTIN:</strong> 07AAGCE1173M1ZH<br/>
            <strong style={{ color: 'white' }}>Udyam Reg:</strong> UDYAM-DL-06-0006878
          </p>
        </div>
        {/* Column 2: Quick Links */}
        <div>
          <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold', borderBottom: '2px solid #FF0000', paddingBottom: '8px', display: 'inline-block' }}>QUICK LINKS</h4>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr', gap: '10px', fontSize: '13px' }}>
            <a href="/store" style={{ color: '#ccc', textDecoration: 'none' }}>🏠 Home</a>
            <a href="/store" style={{ color: '#ccc', textDecoration: 'none' }}>📦 All Products</a>
            <a href="/login" style={{ color: '#ccc', textDecoration: 'none' }}>🤝 Dealer Login</a>
            <a href="/login" style={{ color: '#ccc', textDecoration: 'none' }}>👤 Sign Up</a>
            <a href="https://wa.me/919310159139" target="_blank" rel="noreferrer" style={{ color: '#ccc', textDecoration: 'none' }}>💬 WhatsApp Us</a>
          </div>
        </div>
        {/* Column 3: Stay Connected */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img
            src="/assets/fan%20man%20eltop.png"
            alt="Eltop Fanman"
            style={{ height: 180, width: 'auto', display: 'block', margin: '0 auto 16px auto', cursor: 'pointer', transition: 'transform 0.2s' }}
            onClick={() => setShowFanmanModal(true)}
            onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.target.style.transform = 'scale(1)'; }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold', borderBottom: '2px solid #FF0000', paddingBottom: '8px', display: 'inline-block' }}>STAY CONNECTED</h4>
          <p style={{ fontSize: '13px', marginBottom: '16px', lineHeight: '1.6', textAlign: 'center' }}>Subscribe for latest products, offers and updates from Eltop by Embassy.</p>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <input placeholder="Your Email Id" style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: 'none', fontSize: '13px' }} />
            <button style={{ padding: '8px 16px', background: '#FF0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>SUBSCRIBE</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
            <img src="/assets/ELTOP%20LOGO.png" style={{ height: '40px', width: 'auto', filter: 'brightness(0) invert(1)' }} alt="Eltop" onError={e => { e.target.style.display = 'none'; }} />
            <img src="/assets/EMBASSY%20LOGO.png" style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)' }} alt="Embassy" onError={e => { e.target.style.display = 'none'; }} />
          </div>
        </div>
      </div>

      {/* ── Copyright bar ── */}
      <div style={{ background: '#0a0a0a', color: '#666', padding: isMobile ? '12px 16px' : '12px 40px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', gap: '8px', textAlign: isMobile ? 'center' : 'left' }}>
        <span>© 2026 Embassy Electricals (India) Pvt. Ltd. All rights reserved.</span>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="#" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="#" style={{ color: '#666', textDecoration: 'none' }}>Terms of Use</a>
          <a href="#" style={{ color: '#666', textDecoration: 'none' }}>About Us</a>
        </div>
      </div>

      {/* ── Fanman Modal ── */}
      {showFanmanModal && (
        <div onClick={() => setShowFanmanModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <img src="/assets/fan%20man%20eltop.png" alt="Eltop Fanman" style={{ height: '70vh', maxHeight: 500, width: 'auto', objectFit: 'contain' }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="/assets/fan%20man%20eltop.png" download="Eltop-Fanman.png" title="Download" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#7B2D8B', color: 'white', textDecoration: 'none', fontSize: 22 }}>⬇️</a>
              <button title="Share" onClick={async () => { if (navigator.share) { await navigator.share({ title: 'Hey I am Eltop Fanman! 🎉', text: 'Check out Eltop Fanman - brand mascot of Eltop by Embassy!', url: window.location.origin + '/store' }); } else { navigator.clipboard.writeText(window.location.origin + '/store'); alert('Link copied!'); } }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#FF0000', color: 'white', border: 'none', cursor: 'pointer', fontSize: 22 }}>🔗</button>
              <button title="Close" onClick={() => setShowFanmanModal(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to Cart Toast ── */}
      {showToast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1A1A1A', color: 'white', padding: '12px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minWidth: 280, maxWidth: '90vw' }}>
          {toastProduct?.image_urls?.[0] && (
            <img src={toastProduct.image_urls[0]} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, background: 'white' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold' }}>✅ Added to Cart!</div>
            <div style={{ fontSize: 12, color: '#aaa', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toastProduct?.name}</div>
          </div>
          <button onClick={() => { setShowToast(false); setCartOpen(true); }} style={{ padding: '8px 14px', background: '#7B2D8B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap' }}>View Cart →</button>
          <button onClick={() => setShowToast(false)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
        </div>
      )}
    </div>
  );
}
