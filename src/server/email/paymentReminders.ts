// Lembretes de pagamento (2h e 24h) para pedidos ainda não pagos.
// Server-only. Idempotência garantida por email_events (order_id + type).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendOrderEmail } from "./orderEmails";
import type { EmailMessageType } from "./templates";

/** Pedidos nesses status de pagamento ainda estão aguardando o cliente pagar. */
const UNPAID_PAYMENT_STATUSES = ["pending", "preference_created", "in_process"];

interface Window {
  type: EmailMessageType;
  /** Idade mínima do pedido, em horas. */
  minHours: number;
  /** Idade máxima do pedido, em horas. */
  maxHours: number;
}

const WINDOWS: Window[] = [
  { type: "payment_reminder_2h", minHours: 2, maxHours: 24 },
  { type: "payment_reminder_24h", minHours: 24, maxHours: 72 },
];

export interface PaymentRemindersResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  byType: Record<string, number>;
}

export async function runPaymentReminders(): Promise<PaymentRemindersResult> {
  const out: PaymentRemindersResult = { scanned: 0, sent: 0, skipped: 0, failed: 0, byType: {} };
  const now = Date.now();

  for (const w of WINDOWS) {
    const createdBefore = new Date(now - w.minHours * 3600_000).toISOString();
    const createdAfter = new Date(now - w.maxHours * 3600_000).toISOString();

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .in("payment_status", UNPAID_PAYMENT_STATUSES)
      .gte("created_at", createdAfter)
      .lte("created_at", createdBefore)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[cron] payment reminders query error", error);
      continue;
    }

    out.byType[w.type] = 0;
    for (const o of orders ?? []) {
      out.scanned += 1;
      const r = await sendOrderEmail({ orderId: o.id, type: w.type });
      if (r.skipped) out.skipped += 1;
      else if (r.ok) {
        out.sent += 1;
        out.byType[w.type] = (out.byType[w.type] ?? 0) + 1;
      } else out.failed += 1;
    }
  }

  return out;
}
