import {
  Bar, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CategoryTrend, TrendMonth } from "../../api/types";
import { Card, COLORS, Empty, fmt, tooltipStyle } from "./shared";

const ymLabel = (t: TrendMonth) => `${String(t.month)}월`;

export function TrendsCard({ trends }: { trends: TrendMonth[] | null }) {
  return (
    <Card title="12개월 수입·지출·순저축" span="lg:col-span-5">
      {!trends ? <Empty /> : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={trends.map(t => ({ ...t, label: ymLabel(t) }))}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={((v: number, name: string) => [
                `${fmt(v)}원`,
                { income: "수입", expense: "지출", net: "순저축" }[name] ?? name
              ]) as any} />
            <Bar dataKey="income" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" radius={[2, 2, 0, 0]} />
            <Line dataKey="net" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function SavingsRateCard({ trends }: { trends: TrendMonth[] | null }) {
  const data = (trends ?? []).map(t => ({
    label: ymLabel(t),
    rate: t.savings_rate !== null ? Math.round(t.savings_rate * 100) : null,
  }));
  return (
    <Card title="저축률 추이 (%)" span="lg:col-span-3">
      {!trends ? <Empty /> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${v}%`, "저축률"]) as any} />
            <Line dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function CategoryTrendCard({ trend }: { trend: CategoryTrend | null }) {
  return (
    <Card title="TOP 5 카테고리 월별 지출" span="lg:col-span-4">
      {!trend || trend.categories.length === 0 ? <Empty /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend.series}>
              <XAxis dataKey="ym" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false}
                     tickFormatter={(v: string) => `${Number(v.split("-")[1])}월`} />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => `${fmt(v)}원`) as any} />
              {trend.categories.map((c, i) => (
                <Line key={c} dataKey={c} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {trend.categories.map((c, i) => (
              <span key={c} className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
