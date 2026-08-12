import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID")        ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")    ?? "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")           ?? "";
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")      ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1. Authenticate dealer from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }
    const dealerId = user.id;

    // 2. Re-fetch live outstanding balance and credit_limit server-side
    //    (never trust client-passed amounts — amounts are computed here)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [ledgerResult, profileResult] = await Promise.all([
      adminClient
        .from("dealer_ledger")
        .select("type, amount, dr_dealer, cr_dealer")
        .eq("dealer_id", dealerId),
      adminClient
        .from("profiles")
        .select("credit_limit")
        .eq("id", dealerId)
        .single(),
    ]);

    if (ledgerResult.error) {
      console.error("create-payment-order: ledger fetch failed:", ledgerResult.error);
      return new Response(JSON.stringify({ error: "Could not fetch ledger balance" }), { status: 500, headers: CORS });
    }
    if (profileResult.error) {
      console.error("create-payment-order: profile fetch failed:", profileResult.error);
      return new Response(JSON.stringify({ error: "Could not fetch dealer profile" }), { status: 500, headers: CORS });
    }

    const liveOutstanding = (ledgerResult.data || []).reduce((s: number, row: Record<string, unknown>) => {
      const isDr = row.type === "order" || (row.type === "journal" && row.dr_dealer);
      const isCr = row.type === "payment" || row.type === "credit_note" || (row.type === "journal" && row.cr_dealer);
      if (isDr) return s + Number(row.amount);
      if (isCr) return s - Number(row.amount);
      return s;
    }, 0);

    const creditLimit = Number(profileResult.data?.credit_limit ?? 0);

    // 3. Parse order total from client so we can compute fresh shortfall
    //    (client sends orderTotal as context; server recomputes shortfall using fresh liveOutstanding)
    const body = await req.json().catch(() => ({}));
    const orderTotal = Number(body.orderTotal ?? 0);

    const freshShortfall = Math.max(0, liveOutstanding + orderTotal - creditLimit);

    if (freshShortfall < 1) {
      return new Response(
        JSON.stringify({ error: "No shortfall to pay — balance is within credit limit" }),
        { status: 400, headers: CORS }
      );
    }

    const amountPaise = Math.round(freshShortfall * 100);
    if (amountPaise < 100) {
      return new Response(
        JSON.stringify({ error: "Amount too small for payment gateway (minimum ₹1)" }),
        { status: 400, headers: CORS }
      );
    }

    // 4. Create Razorpay order server-side (using secret key — never exposed to frontend)
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), { status: 500, headers: CORS });
    }
    const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${rzpAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount:   amountPaise,
        currency: "INR",
        receipt:  `bal_${dealerId.slice(0, 8)}_${Date.now()}`,
      }),
    });

    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error("create-payment-order: Razorpay order creation failed:", rzpData);
      return new Response(
        JSON.stringify({ error: "Payment gateway error", detail: rzpData }),
        { status: 502, headers: CORS }
      );
    }

    return new Response(
      JSON.stringify({
        razorpay_order_id: rzpData.id,
        amount_paise:      amountPaise,
        amount_inr:        freshShortfall,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payment-order: unhandled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
