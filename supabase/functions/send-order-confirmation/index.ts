import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Eltop by Embassy <orders@eltopbyembassy.com>";

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface Payload {
  order_id: string;
  payment_id: string;
  customer_name: string;
  customer_email: string;
  total: number;
  items: OrderItem[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const payload: Payload = await req.json();
    const { order_id, payment_id, customer_name, customer_email, total, items } = payload;

    if (!customer_email) {
      return new Response(JSON.stringify({ error: "no customer_email" }), { status: 400 });
    }

    const itemRows = items
      .map(
        (it) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${it.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${it.qty}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${Number(it.price).toLocaleString("en-IN")}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${(Number(it.price) * it.qty).toLocaleString("en-IN")}</td>
      </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#7B2D8B;padding:28px 32px;text-align:center;">
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:0.5px;">Eltop by Embassy</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">Order Confirmation</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#222;">Hi <strong>${customer_name}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#444;">Thank you for your order! We've received your payment and your order is confirmed.</p>
      <div style="background:#f9f5fb;border-left:4px solid #7B2D8B;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Payment Reference</div>
        <div style="font-family:monospace;font-size:15px;font-weight:700;color:#7B2D8B;">${payment_id}</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">Keep this ID for any queries or refund requests</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f9f5fb;">
            <th style="padding:8px 12px;text-align:left;color:#555;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:center;color:#555;font-weight:600;">Qty</th>
            <th style="padding:8px 12px;text-align:right;color:#555;font-weight:600;">Rate</th>
            <th style="padding:8px 12px;text-align:right;color:#555;font-weight:600;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;font-size:16px;font-weight:700;color:#222;padding:8px 12px;border-top:2px solid #7B2D8B;">
        Total: ₹${Number(total).toLocaleString("en-IN")}
      </div>
      <p style="margin:24px 0 0;font-size:13px;color:#888;">For any questions about your order, reply to this email or contact us. Please quote your Payment Reference.</p>
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
        to: [customer_email],
        subject: `Order Confirmed — Payment ID ${payment_id}`,
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
