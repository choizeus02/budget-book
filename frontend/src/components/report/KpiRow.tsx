import type { ReactNode } from "react";
import type { ReportPace, ReportSummary } from "../../api/types";
import { fmt, signed } from "./shared";

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const diff = cur - prev;
  if (prev === 0 && cur === 0) return null;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className={`text-xs ${diff === 0 ? "text-slate-500" : good ? "text-emerald-400" : "text-red-400"}`}>
      전월비 {signed(diff)}원
    </span>
  );
}

function Tile({ label, value, sub, color = "text-white" }: {
  label: string; value: string; sub?: ReactNode; color?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-1 lg:col-span-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub}
    </div>
  );
}

export default function KpiRow({ summary, pace }: {
  summary: ReportSummary | null; pace: ReportPace | null;
}) {
  if (!summary) return null;
  const rate = summary.savings_rate;
  return (
    <>
      <Tile label="총지출" value={`${fmt(summary.expense)}원`} color="text-red-400"
            sub={<Delta cur={summary.expense} prev={summary.prev.expense} invert />} />
      <Tile label="총수입" value={`${fmt(summary.income)}원`} color="text-emerald-400"
            sub={<Delta cur={summary.income} prev={summary.prev.income} />} />
      <Tile label="순저축" value={`${signed(summary.net)}원`}
            color={summary.net >= 0 ? "text-white" : "text-red-400"}
            sub={<span className="text-xs text-slate-500">
              저축률 {rate !== null ? `${Math.round(rate * 100)}%` : "-"}
            </span>} />
      <Tile label={pace?.projected !== null && pace?.projected !== undefined ? "월말 예상 지출" : "일평균 지출"}
            value={pace ? `${fmt(pace.projected ?? pace.daily_avg)}원` : "-"}
            sub={pace ? <span className="text-xs text-slate-500">
              일평균 {fmt(pace.daily_avg)}원 (전월 {fmt(pace.prev_daily_avg)}원)
            </span> : undefined} />
    </>
  );
}
