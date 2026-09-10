import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// send-access-grant-email — the email half of "in app alert plus
// notification on email" (§5.4 of Eltop_Dealer_Access_Control_Design_
// 10Sep2026.md). Fired client-side, once per grantee, right after
// grant_dealer_access() succeeds (that RPC already wrote the in-app
// staff_notifications row and re-validated the grant server-side — this
// function only sends the email, it does no authorization of its own).
// Mirrors the existing send-order-confirmation function's Resend pattern.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Eltop by Embassy <orders@eltopbyembassy.com>";

interface Payload {
  to_email: string;
  to_name?: string;
  dealer_name: string;
  granted_by_name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload: Payload = await req.json();
    const { to_email, to_name, dealer_name, granted_by_name } = payload;

    if (!to_email) {
      return new Response(JSON.stringify({ error: "no to_email" }), { status: 400 });
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#7B2D8B;padding:28px 32px;text-align:center;">
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:0.5px;">Eltop by Embassy</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">Ledger Access Granted</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#222;">Hi${to_name ? ` <strong>${to_name}</strong>` : ""},</p>
      <div style="background:#f9f5fb;border-left:4px solid #7B2D8B;border-radius:6px;padding:14px 18px;margin-bottom:20px;font-size:14px;color:#333;line-height:1.6;">
        <strong>${granted_by_name}</strong> has given you ledger access to <strong>${dealer_name}</strong>.
        You can now see its outstanding balance, orders and full CRM detail in the Eltop Staff app — not just check in there.
      </div>
      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://www.eltopbyembassy.com/staff/sales" style="display:inline-block;background:#7B2D8B;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;">
          Open My Dealers →
        </a>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#888;">This access stays active until it's revoked — no action needed from you.</p>
    </div>
    <div style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
      <div style="font-size:11px;color:#aaa;">© ${new Date().getFullYear()} Eltop by Embassy. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to_email],
        subject: `You've been given access to ${dealer_name}'s ledger`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) {
      console.error("Resend error:", resBody);
      return new Response(JSON.stringify({ error: resBody }), { status: 502 });
    }

    return new Response(
      JSON.stringify({ success: true, resend_id: resBody.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
