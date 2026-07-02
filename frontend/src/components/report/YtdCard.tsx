import type { YearlySummary } from "../../api/types";
import { Card, Empty, fmt, signed } from "./shared";

export default function YtdCard({ ytd }: { ytd: YearlySummary | null }) {
  return (
    <Card title={`연간 누적 (${ytd?.year ?? ""}년)`} span="lg:col-span-5">
      {!ytd ? <Empty /> : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-500">누적 수입</p>
            <p className="text-emerald-400 tabular-nums">{fmt(ytd.total_income)}원</p></div>
          <div><p className="text-xs text-slate-500">누적 지출</p>
            <p className="text-red-400 tabular-nums">{fmt(ytd.total_expense)}원</p></div>
          <div><p className="text-xs text-slate-500">누적 순저축</p>
            <p className="text-white tabular-nums">{signed(ytd.net)}원</p></div>
          <div><p className="text-xs text-slate-500">연 저축률</p>
            <p className="text-white tabular-nums">
              {ytd.savings_rate !== null ? `${Math.round(ytd.savings_rate * 100)}%` : "-"}
            </p></div>
        </div>
      )}
    </Card>
  );
}
