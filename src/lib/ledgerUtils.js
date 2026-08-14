// Shared Dr/Cr classification helpers for dealer_ledger rows.
// Canonical source — import from here rather than duplicating inline.
// Note: AppContext.jsx and Store.jsx still have inline copies (tech debt — safe to consolidate later).

export const isDebitEntry  = (row) => row.type === 'order' || (row.type === 'journal' && row.dr_dealer);
export const isCreditEntry = (row) => row.type === 'payment' || row.type === 'credit_note' || (row.type === 'journal' && row.cr_dealer);

/**
 * FIFO aging calculation for a single dealer's ledger rows.
 *
 * Credits are applied to the oldest outstanding debit first (FIFO), because individual
 * payments are not linked to specific invoices in the data model — this is a heuristic.
 *
 * Returns null if outstanding balance is zero (dealer has no amount due).
 */
export function computeAgingFromLedger(rows) {
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a.voucher_date || a.created_at).getTime();
    const db = new Date(b.voucher_date || b.created_at).getTime();
    return da - db;
  });

  const debitQueue = []; // [{ date: Date, remaining: number }]
  let creditPool = 0;    // excess credit (prepayments / overpayments) carried forward

  for (const row of sorted) {
    const amount = Number(row.amount) || 0;
    if (isDebitEntry(row)) {
      const date = new Date(row.voucher_date || row.created_at);
      // Absorb any pre-existing credit first
      const absorbed = Math.min(creditPool, amount);
      creditPool -= absorbed;
      const remaining = amount - absorbed;
      if (remaining > 0.01) debitQueue.push({ date, remaining });
    } else if (isCreditEntry(row)) {
      let left = amount;
      // Apply credit to oldest outstanding debits first
      while (left > 0.01 && debitQueue.length > 0) {
        const oldest = debitQueue[0];
        const take = Math.min(oldest.remaining, left);
        oldest.remaining -= take;
        left -= take;
        if (oldest.remaining <= 0.01) debitQueue.shift();
      }
      creditPool += left; // carry forward any excess credit
    }
  }

  if (debitQueue.length === 0) return null; // fully paid or credit balance

  const totalOutstanding = debitQueue.reduce((s, d) => s + d.remaining, 0);
  const oldestDate = debitQueue[0].date;
  const daysOld = Math.floor((Date.now() - oldestDate.getTime()) / 86400000);
  const weeksOld = Math.floor(daysOld / 7);
  const bucket = weeksOld < 2 ? '0–2w' : weeksOld < 4 ? '2–4w' : weeksOld < 8 ? '4–8w' : '8w+';

  return { totalOutstanding: Math.round(totalOutstanding * 100) / 100, oldestDate, weeksOld, daysOld, bucket };
}

export const AGING_BUCKETS = ['0–2w', '2–4w', '4–8w', '8w+'];
export const BUCKET_COLOR  = { '0–2w': '#27ae60', '2–4w': '#f39c12', '4–8w': '#e67e22', '8w+': '#c0392b' };
