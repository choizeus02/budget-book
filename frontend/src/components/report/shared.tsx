import type { ReactNode } from "react";

export const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
  "#f97316", "#84cc16", "#94a3b8",
];

export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function fmt(n: number) {
  return Math.abs(Math.round(n)).toLocaleString("ko-KR");
}

export function signed(n: number) {
  return `${n >= 0 ? "+" : "-"}${fmt(n)}`;
}

export function Card({ title, span = "lg:col-span-6", children }: {
  title?: string; span?: string; children: ReactNode;
}) {
  return (
    <div className={`bg-slate-800 rounded-2xl p-4 ${span}`}>
      {title && <h3 className="text-slate-300 text-sm font-semibold mb-3">{title}</h3>}
      {children}
    </div>
  );
}

export function Empty() {
  return <p className="text-slate-500 text-sm text-center py-8">데이터 없음</p>;
}

export const tooltipStyle = {
  background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12,
} as const;
