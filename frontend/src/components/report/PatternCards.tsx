import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportDow, ReportWeek } from "../../api/types";
import { Card, DOW_LABELS, Empty, fmt, tooltipStyle } from "./shared";

export function DowCard({ dow }: { dow: ReportDow[] | null }) {
  const data = (dow ?? []).map(d => ({ ...d, label: DOW_LABELS[d.dow] }));
  return (
    <Card title="요일별 지출" span="lg:col-span-6">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={((v: number, name: string) =>
                name === "total" ? [`${fmt(v)}원`, "합계"] : [`${fmt(v)}원`, "건당 평균"]) as any} />
            <Bar dataKey="total" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function WeeklyCard({ weekly }: { weekly: ReportWeek[] | null }) {
  const data = (weekly ?? []).map(w => ({ ...w, label: `${w.week}주차` }));
  return (
    <Card title="주차별 지출" span="lg:col-span-6">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${fmt(v)}원`, "지출"]) as any} />
            <Bar dataKey="total" fill="#14b8a6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
