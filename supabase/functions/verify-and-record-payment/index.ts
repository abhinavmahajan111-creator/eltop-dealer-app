import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID")           ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")       ?? "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";
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

    // 2. Parse body
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature" }),
        { status: 400, headers: CORS }
      );
    }

    // 3. Verify Razorpay signature server-side (HMAC-SHA256)
    //    Razorpay signs: order_id + "|" + payment_id  using the key secret
    const message = `${razorpay_order_id}|${razorpay_payment_id}`;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(RAZORPAY_KEY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
    const expectedSig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSig !== razorpay_signature) {
      console.error("verify-and-record-payment: signature mismatch for order", razorpay_order_id);
      return new Response(
        JSON.stringify({ error: "Invalid payment signature — payment not recorded" }),
        { status: 400, headers: CORS }
      );
    }

    // 4. Fetch authoritative payment amount from Razorpay API
    //    (never trust the client-passed amount — use what Razorpay captured)
    const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: `Basic ${rzpAuth}` },
    });
    const payData = await payRes.json();
    if (!payRes.ok || payData.status !== "captured" && payData.status !== "authorized") {
      console.error("verify-and-record-payment: Razorpay payment fetch failed or not captured:", payData);
      return new Response(
        JSON.stringify({ error: "Could not confirm payment capture from Razorpay", detail: payData }),
        { status: 502, headers: CORS }
      );
    }
    const amountInr = payData.amount / 100; // paise → INR

    // 5. Generate voucher number: EEIPL/RC/NNNN (counts type='payment' rows for this dealer)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { count } = await adminClient
      .from("dealer_ledger")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId)
      .eq("type", "payment");

    const seq = String((count || 0) + 1).padStart(4, "0");
    const voucherNo = `EEIPL/RC/${seq}`;

    // 6. Insert dealer_ledger receipt row via service role (no dealer INSERT policy for type='payment')
    const { error: ledgerError } = await adminClient.from("dealer_ledger").insert({
      dealer_id:    dealerId,
      type:         "payment",
      voucher_type: "receipt",
      voucher_no:   voucherNo,
      voucher_date: new Date().toISOString().slice(0, 10),
      narration:    "Online payment via Razorpay",
      amount:       amountInr,
      method:       "Online",
      reference_no: razorpay_payment_id,
    });

    if (ledgerError) {
      console.error(
        "verify-and-record-payment: dealer_ledger insert failed after verified payment",
        razorpay_payment_id,
        ledgerError
      );
      return new Response(
        JSON.stringify({
          error:      "Ledger insert failed — payment was captured but balance not updated",
          payment_id: razorpay_payment_id,
          detail:     ledgerError.message,
        }),
        { status: 500, headers: CORS }
      );
    }

    return new Response(
      JSON.stringify({ success: true, voucher_no: voucherNo, amount_inr: amountInr }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-and-record-payment: unhandled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
