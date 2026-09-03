import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { computeAgingFromLedger } from "../../lib/ledgerUtils";
import { buildDashboardAiSystemPrompt, askAi } from "../../lib/dealerCrmUtils";

// Dashboard-wide "Ask AI about your dealers" card — sits right under the
// header on /staff/sales, live the moment a rep logs in (approved from
// mockup/dealer-crm-mockup.html). Scoped across ALL of the rep's dealers,
// unlike the per-dealer AI card on DealerInsightsTab. Aging/overdue context
// is computed client-side per dealer (via the same FIFO heuristic used
// everywhere else, computeAgingFromLedger) from a single bulk RPC —
// get_my_dealers_ledger_rows() — fetched lazily the first time the rep
// actually asks something, not on every dashboard load.

const SUGGESTED_PROMPTS = ["Meri sales summary batao", "Overdue dealers", "Today's visits pending"];

export default function DashboardAiCard({ repName, dealers, visitsToday }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState(null);

  const ensureContext = async () => {
    if (context) return context;
    const { data } = await supabase.rpc("get_my_dealers_ledger_rows", { p_dealer_ids: null });
    const rowsByDealer = {};
    (data || []).forEach((r) => {
      if (!rowsByDealer[r.dealer_id]) rowsByDealer[r.dealer_id] = [];
      rowsByDealer[r.dealer_id].push(r);
    });
    const agingByDealer = dealers.map((d) => ({
      id: d.id, name: d.name, dealer_code: d.dealer_code,
      aging: computeAgingFromLedger(rowsByDealer[d.id] || []),
    }));
    const built = buildDashboardAiSystemPrompt({ repName, dealers, agingByDealer, visitsToday });
    setContext(built);
    return built;
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    const systemPrompt = await ensureContext();
    const reply = await askAi(systemPrompt, newMessages);
    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setSending(false);
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #f7ecf9 0%, #fdf8fe 100%)", border: "1.5px solid #7B2D8B", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#7B2D8B", marginBottom: 10 }}>
        ✨ Ask AI about your dealers
      </div>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#7B2D8B" : "#fff",
                color: m.role === "user" ? "#fff" : "#333",
                border: m.role === "user" ? "none" : "1.3px solid #e6d3ea",
                borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                padding: "8px 12px", fontSize: 11.5, lineHeight: 1.55, maxWidth: "90%", marginBottom: 6, whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && <div style={{ alignSelf: "flex-start", fontSize: 11, color: "#999", padding: "4px 0" }}>Thinking…</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SUGGESTED_PROMPTS.map((p) => (
          <div key={p} onClick={() => send(p)} style={{ fontSize: 10.5, fontWeight: 700, color: "#7B2D8B", background: "#fff", border: "1.3px solid #d9b8e0", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}>
            {p}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 999, padding: "5px 5px 5px 14px" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask anything about your dealers — any language..."
          disabled={sending}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 11.5, background: "transparent", minWidth: 0 }}
        />
        <div onClick={() => send()} style={{ width: 28, height: 28, borderRadius: "50%", background: "#7B2D8B", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>➤</div>
      </div>
      <div style={{ fontSize: 9.5, color: "#999", textAlign: "center", marginTop: 8 }}>
        Hindi, English, Hinglish — jis bhi language mein poochho, usi mein jawaab milega.
      </div>
    </div>
  );
}
