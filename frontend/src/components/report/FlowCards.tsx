import {
  Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReportDaily } from "../../api/types";
import { Card, DOW_LABELS, Empty, fmt, tooltipStyle } from "./shared";

export function DailyFlowCard({ daily }: { daily: ReportDaily[] | null }) {
  return (
    <Card title="일별 지출 · 누적 (점선=전월 누적)" span="lg:col-span-7">
      {!daily || daily.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={daily}>
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={((v: number, name: string) => [
                `${fmt(v)}원`,
                name === "total" ? "일별" : name === "cumulative" ? "누적" : "전월 누적"
              ]) as any} />
            <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Line dataKey="cumulative" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line dataKey="prev_cumulative" stroke="#64748b" strokeWidth={1.5}
                  strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function HeatmapCard({ daily, year, month }: {
  daily: ReportDaily[] | null; year: number; month: number;
}) {
  if (!daily || daily.length === 0) {
    return <Card title="지출 히트맵" span="lg:col-span-5"><Empty /></Card>;
  }
  const max = Math.max(...daily.map(d => d.total), 1);
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=일
  const cells: Array<ReportDaily | null> = [
    ...Array.from({ length: firstDow }, () => null), ...daily,
  ];
  return (
    <Card title="지출 히트맵" span="lg:col-span-5">
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW_LABELS.map(l => (
          <span key={l} className="text-[10px] text-slate-500">{l}</span>
        ))}
        {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <div key={d.day} title={`${d.day}일 ${fmt(d.total)}원`}
            className="aspect-square rounded flex items-center justify-center text-[10px]"
            style={{
              backgroundColor: d.total === 0 ? "rgba(51,65,85,.5)"
                : `rgba(99,102,241,${0.25 + 0.75 * (d.total / max)})`,
              color: d.total / max > 0.5 ? "#fff" : "#94a3b8",
            }}>
            {d.day}
          </div>
        ))}
      </div>
    </Card>
  );
}
