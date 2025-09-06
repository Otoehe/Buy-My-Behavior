// src/lib/scenarioGating.ts (новий, additive)
export type ScenarioRow = {
  id: string;
  customer_id: string;
  executor_id: string;
  status: 'pending'|'agreed'|'confirmed'|'disputed';
  execute_at?: string | null; // ISO
  confirmed_by_customer?: boolean | null;
  confirmed_by_executor?: boolean | null;
  disputed?: boolean | null;
};

export function deriveButtons(row: ScenarioRow, myUserId: string) {
  const meIsCustomer = row.customer_id === myUserId;
  const meIsExecutor = row.executor_id === myUserId;
  const bothSides = meIsCustomer || meIsExecutor;

  const now = Date.now();
  const afterTime =
    !row.execute_at ? true : now >= new Date(row.execute_at).getTime();

  const isPending  = row.status === 'pending';
  const isAgreed   = row.status === 'agreed';
  const isConfirmed= row.status === 'confirmed';
  const isDisputed = row.status === 'disputed' || !!row.disputed;

  return {
    allowEdit: isPending,                             // обидва редагують у pending
    allowDelete: isPending && meIsCustomer,           // видаляти може тільки замовник у pending
    showAgree: isPending && meIsCustomer,             // 🤝 ініціює замовник (funds)
    showConfirm: isAgreed && afterTime && bothSides,  // ✅ обидві сторони після часу
    showDispute: isAgreed && bothSides && !isConfirmed,
    locked: isConfirmed || isDisputed,                // повністю блокуємо змінний контент
  };
}
