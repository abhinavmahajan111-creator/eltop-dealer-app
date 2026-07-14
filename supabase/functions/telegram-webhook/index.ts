import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by the Supabase Edge Functions
// runtime — do not set them manually via `supabase secrets set`.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
// Optional — used only as a soft hint in the extraction prompt, never a hard rule.
const GRUP18_CHAT_ID = Deno.env.get("TELEGRAM_GRUP18_CHAT_ID") ?? "";
const GRUP20_CHAT_ID = Deno.env.get("TELEGRAM_GRUP20_CHAT_ID") ?? "";

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXTRACTION_SYSTEM_PROMPT = `You are a bookkeeping assistant for a small electricals trading business in India.
The user sends either:
1. A short payment message, e.g. "Paid 649 To Sheetal ashok fan blade From Bank 9/7/26" —
   describes money paid or received, a vendor/party name, a payment mode, and a date.
2. A photo or text of a handwritten vendor dispatch/purchase slip listing goods, e.g.
   "60 Pc wall fan 16\" white, 30 Pc wall fan 16\" Black 13/07/26" — describes goods dispatched,
   not money.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "type": "payment" | "purchase" | "unknown",
  "vendor": string or null,
  "date": string DD/MM/YYYY or null (assume 20YY for 2-digit years),
  "direction": "paid" | "received" | null,
  "amount": number or null,
  "mode": string or null,
  "items": [ { "description": string, "quantity": number or null, "unit": string or null, "rate": number or null } ],
  "confidence": "high" | "medium" | "low",
  "notes": string or null
}`;

interface Extraction {
  type: "payment" | "purchase" | "unknown";
  vendor: string | null;
  date: string | null;
  direction: "paid" | "received" | null;
  amount: number | null;
  mode: string | null;
  items: { description: string; quantity: number | null; unit: string | null; rate: number | null }[];
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const incomingSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!TELEGRAM_WEBHOOK_SECRET || incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const message = update?.message;
  if (!message) {
    // Ignore edited_message, channel_post, chat_member updates, etc.
    return new Response("ok", { status: 200 });
  }

  if (message.from?.is_bot) {
    return new Response("ok", { status: 200 });
  }

  const hasText = typeof message.text === "string" && message.text.trim().length > 0;
  const hasCaption = typeof message.caption === "string" && message.caption.trim().length > 0;
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  if (!hasText && !hasCaption && !hasPhoto) {
    // Service messages (joins/leaves/pins) have none of these — ignore.
    return new Response("ok", { status: 200 });
  }

  const chatId: number = message.chat.id;
  const chatTitle: string = message.chat.title ?? "";
  const messageId: number = message.message_id;
  const fromName: string = message.from?.first_name ?? "Unknown";
  const text: string = message.text ?? message.caption ?? "";

  try {
    let imageBase64: string | null = null;
    if (hasPhoto) {
      const sizes = message.photo as { file_id: string }[];
      const largest = sizes[sizes.length - 1];
      imageBase64 = await downloadTelegramPhotoAsBase64(largest.file_id);
    }

    const groupHint =
      GRUP18_CHAT_ID && chatId.toString() === GRUP18_CHAT_ID
        ? "This message is from the Cash Payment Receipt group (GRUP18) — more likely a payment, but could still be a purchase slip."
        : GRUP20_CHAT_ID && chatId.toString() === GRUP20_CHAT_ID
          ? "This message is from the Purchase group (GRUP20) — more likely a purchase slip, but could still be a payment."
          : "";

    const extraction = await extractWithClaude(text, imageBase64, groupHint);

    let vendorId: string | null = null;
    if (extraction.vendor) {
      vendorId = await matchOrCreateVendor(extraction.vendor);
    }

    const { data: entry, error: entryError } = await supabase
      .from("hisaab_entries")
      .insert({
        telegram_chat_id: chatId,
        telegram_chat_title: chatTitle,
        telegram_message_id: messageId,
        telegram_from_name: fromName,
        vendor_id: vendorId,
        vendor_raw: extraction.vendor,
        entry_type: extraction.type ?? "unknown",
        direction: extraction.direction,
        amount: extraction.amount,
        mode: extraction.mode,
        entry_date: parseDateToISO(extraction.date),
        entry_date_raw: extraction.date,
        confidence: extraction.confidence ?? "low",
        notes: extraction.notes,
        raw_input_text: text || null,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    if (Array.isArray(extraction.items) && extraction.items.length > 0) {
      const rows = extraction.items.map((it) => ({
        entry_id: entry.id,
        description: it.description ?? null,
        quantity: it.quantity ?? null,
        unit: it.unit ?? null,
        rate: it.rate ?? null,
      }));
      const { error: itemsError } = await supabase.from("hisaab_items").insert(rows);
      if (itemsError) throw itemsError;
    }

    if (imageBase64) {
      const path = `entries/${entry.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("hisaab-slips")
        .upload(path, base64ToBytes(imageBase64), { contentType: "image/jpeg", upsert: true });
      if (!uploadError) {
        await supabase.from("hisaab_entries").update({ photo_storage_path: path }).eq("id", entry.id);
      } else {
        console.error("hisaab-slips upload error", uploadError);
      }
    }

    await sendTelegramReply(chatId, messageId, buildReplyText(extraction));
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("telegram-webhook error", err);
    try {
      await sendTelegramReply(
        chatId,
        messageId,
        "⚠️ Check karo — entry samajh nahi aayi ya save nahi ho paayi. Reply here or fix later in the dashboard.",
      );
    } catch (replyErr) {
      console.error("telegram-webhook failed to send failure reply", replyErr);
    }
    // Always 200 so Telegram doesn't retry-storm the same failing update.
    return new Response("ok", { status: 200 });
  }
});

async function downloadTelegramPhotoAsBase64(fileId: string): Promise<string> {
  const fileInfoRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) throw new Error(`telegram getFile failed: ${JSON.stringify(fileInfo)}`);
  const filePath = fileInfo.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileRes.ok) throw new Error(`telegram file download failed: ${fileRes.status}`);
  const buf = await fileRes.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

async function extractWithClaude(text: string, imageBase64: string | null, groupHint: string): Promise<Extraction> {
  const content: Record<string, unknown>[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    });
  }
  content.push({ type: "text", text: [groupHint, text].filter(Boolean).join("\n\n") || "(no text provided)" });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const raw: string = data.content?.[0]?.text ?? "{}";
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

async function matchOrCreateVendor(rawName: string): Promise<string | null> {
  const normalized = rawName.trim();
  if (!normalized) return null;

  const { data: matchId, error: matchError } = await supabase.rpc("match_hisaab_vendor", {
    input_name: normalized,
  });
  if (matchError) console.error("match_hisaab_vendor rpc error", matchError);
  if (matchId) return matchId as string;

  const { data: created, error: createError } = await supabase
    .from("hisaab_vendors")
    .insert({ name: normalized })
    .select("id")
    .single();
  if (createError) {
    // Unique-constraint race: another concurrent message created the same vendor name first.
    const { data: existing } = await supabase
      .from("hisaab_vendors")
      .select("id")
      .ilike("name", normalized)
      .maybeSingle();
    if (existing) return existing.id;
    console.error("hisaab_vendors insert error", createError);
    return null;
  }
  return created.id;
}

function parseDateToISO(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function buildReplyText(extraction: Extraction): string {
  if (extraction.confidence === "low" || extraction.type === "unknown") {
    return `⚠️ Check karo — ${extraction.notes || "confidence low, extraction not sure"}. Reply here or fix later in the dashboard.`;
  }
  if (extraction.type === "payment") {
    const dir = extraction.direction === "received" ? "received" : "paid";
    const amt = extraction.amount != null ? `₹${extraction.amount}` : "amount unknown";
    return `✅ Saved — ${extraction.vendor || "Unknown vendor"}, ${amt} ${dir}, ${extraction.date || "date unknown"}`;
  }
  const itemCount = extraction.items?.length ?? 0;
  return `✅ Saved — ${extraction.vendor || "Unknown vendor"}, ${itemCount} item(s), ${extraction.date || "date unknown"}`;
}

async function sendTelegramReply(chatId: number, replyToMessageId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    }),
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
