import { createContext, useCallback, useContext, useRef, useState } from "react";
import { invoices } from "../data/invoices";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [mobile, setMobile] = useState("");
  const [dealer] = useState({
    name: "Shree Balaji Electricals",
    dealerId: "ETP-DLR-4521",
    gstin: "07AABCE1234F1Z5",
    address: "Karol Bagh, New Delhi - 110005",
  });
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastShow(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 1600);
  }, []);

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

  const value = {
    cart,
    addToCart,
    changeCartQty,
    removeFromCart,
    clearCart,
    mobile,
    setMobile,
    dealer,
    invoices,
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
