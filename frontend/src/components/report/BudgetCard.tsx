import type { BudgetGauge } from "../../api/types";
import { Card, Empty, fmt } from "./shared";

export default function BudgetCard({ budgets }: { budgets: BudgetGauge[] | null }) {
  return (
    <Card title="예산 소진 (세로선 = 오늘 기준 이상적 페이스)" span="lg:col-span-7">
      {!budgets || budgets.length === 0 ? <Empty /> : (
        <div className="flex flex-col gap-3">
          {budgets.map(b => (
            <div key={b.category}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{b.category}</span>
                <span className={b.used_pct > 100 ? "text-red-400" : "text-slate-400"}>
                  {fmt(b.spent)} / {fmt(b.budget)}원 ({Math.round(b.used_pct)}%)
                </span>
              </div>
              <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  b.used_pct > 100 ? "bg-red-500" : b.used_pct > b.ideal_pct + 15 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(b.used_pct, 100)}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/60"
                  style={{ left: `${Math.min(b.ideal_pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
