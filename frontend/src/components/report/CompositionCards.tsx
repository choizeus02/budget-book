import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BreakdownRow, ReportFixedVariable } from "../../api/types";
import { Card, COLORS, Empty, fmt, tooltipStyle } from "./shared";

export function DonutCard({ breakdown }: { breakdown: BreakdownRow[] | null }) {
  const data = (breakdown ?? []).map(b => ({ name: b.category, value: b.total }));
  return (
    <Card title="카테고리 구성" span="lg:col-span-4">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                 paddingAngle={2} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${fmt(v)}원`, ""]) as any} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function CategoryTableCard({ breakdown }: { breakdown: BreakdownRow[] | null }) {
  return (
    <Card title="카테고리 상세" span="lg:col-span-4">
      {!breakdown || breakdown.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left font-normal pb-2">카테고리</th>
                <th className="text-right font-normal pb-2">금액</th>
                <th className="text-right font-normal pb-2">비중</th>
                <th className="text-right font-normal pb-2">전월비</th>
                <th className="text-right font-normal pb-2">예산</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map(b => (
                <tr key={b.category} className="border-t border-slate-700/50">
                  <td className="py-1.5 text-slate-200">{b.category}</td>
                  <td className="py-1.5 text-right text-slate-200 tabular-nums">{fmt(b.total)}원</td>
                  <td className="py-1.5 text-right text-slate-400 tabular-nums">{Math.round(b.ratio * 100)}%</td>
                  <td className={`py-1.5 text-right tabular-nums ${
                    b.diff_pct === null ? "text-slate-600"
                    : b.diff_pct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {b.diff_pct === null ? "-" : `${b.diff_pct > 0 ? "+" : ""}${Math.round(b.diff_pct)}%`}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${
                    b.budget_used === null ? "text-slate-600"
                    : b.budget_used > 100 ? "text-red-400" : "text-slate-400"}`}>
                    {b.budget_used === null ? "-" : `${Math.round(b.budget_used)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BucketLine({ dotClass, label, value, note }: {
  dotClass: string; label: string; value: string; note: string | null;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full shrink-0 self-center ${dotClass}`} />
      <span className="text-slate-300 w-16 shrink-0">{label}</span>
      <span className="text-slate-200 tabular-nums">{value}</span>
      {note && <span className="text-xs text-slate-500 truncate">{note}</span>}
    </div>
  );
}

export function FixedVarCard({ fv, income }: { fv: ReportFixedVariable | null; income: number | null }) {
  if (!fv) return <Card title="지출 구성" span="lg:col-span-4"><Empty /></Card>;

  const fixedDiff = fv.fixed_total - fv.prev_fixed_total;
  const topChange = fv.fixed_changes[0];
  const fixedNote = Math.abs(fixedDiff) >= 1000
    ? `전월비 ${fixedDiff > 0 ? "+" : "−"}${fmt(Math.abs(fixedDiff))}원${topChange ? ` (${topChange.name})` : ""}`
    : "전월과 비슷";

  let variableNote: string | null = null;
  if (fv.variable_3mo_avg !== null && fv.variable_3mo_avg > 0) {
    const pct = Math.round(((fv.variable_total - fv.variable_3mo_avg) / fv.variable_3mo_avg) * 100);
    variableNote = `3개월 평균 ${fmt(fv.variable_3mo_avg)}원 대비 ${pct > 0 ? "+" : ""}${pct}%`;
  }

  const investedNote = income && income > 0 && fv.invested_total > 0
    ? `수입의 ${Math.round((fv.invested_total / income) * 100)}%`
    : null;

  return (
    <Card title="지출 구성" span="lg:col-span-4">
      <div className="flex flex-col gap-3">
        <div className="h-3 rounded-full overflow-hidden flex bg-slate-700">
          <div className="bg-indigo-500" style={{ width: `${fv.fixed_ratio * 100}%` }} />
          <div className="bg-pink-500" style={{ width: `${fv.variable_ratio * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${fv.invested_ratio * 100}%` }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <BucketLine dotClass="bg-indigo-500" label="고정비"
            value={`${fmt(fv.fixed_total)}원 (${Math.round(fv.fixed_ratio * 100)}%)`} note={fixedNote} />
          <BucketLine dotClass="bg-pink-500" label="변동비"
            value={`${fmt(fv.variable_total)}원 (${Math.round(fv.variable_ratio * 100)}%)`} note={variableNote} />
          <BucketLine dotClass="bg-emerald-500" label="저축·투자"
            value={`${fmt(fv.invested_total)}원 (${Math.round(fv.invested_ratio * 100)}%)`} note={investedNote} />
        </div>
        {fv.items.length > 0 && (
          <ul className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-slate-700/50">
            {fv.items.map(item => (
              <li key={`${item.kind}-${item.name}`} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  {item.kind === "subscription" ? "🔁" : "💳"} {item.name}
                </span>
                <span className="text-slate-400 tabular-nums">{fmt(item.amount)}원</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
