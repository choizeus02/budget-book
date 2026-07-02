import type { FrequentMerchant, TopTransaction } from "../../api/types";
import { Card, Empty, fmt } from "./shared";

export function TopCard({ top }: { top: TopTransaction[] | null }) {
  return (
    <Card title="TOP 10 지출" span="lg:col-span-7">
      {!top || top.length === 0 ? <Empty /> : (
        <ol className="flex flex-col gap-1.5">
          {top.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 w-5 text-right">{i + 1}</span>
              <span className="text-slate-200 flex-1 truncate">{t.description || "(설명 없음)"}</span>
              <span className="text-slate-500 text-xs">{t.category ?? "미분류"}</span>
              <span className="text-slate-500 text-xs">{new Date(t.date).getDate()}일</span>
              <span className="text-red-400 tabular-nums">{fmt(t.amount)}원</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function FrequentCard({ frequent }: { frequent: FrequentMerchant[] | null }) {
  return (
    <Card title="자주 간 곳 TOP 5" span="lg:col-span-5">
      {!frequent || frequent.length === 0 ? <Empty /> : (
        <ul className="flex flex-col gap-2">
          {frequent.map(m => (
            <li key={m.description} className="flex items-center justify-between text-sm">
              <span className="text-slate-200 truncate">{m.description}</span>
              <span className="text-slate-400 text-xs shrink-0 ml-2">
                {m.count}회 · {fmt(m.total)}원
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
