import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../api/client";
import type { CategoryStatDetail, MonthlySummary } from "../api/types";
import { CATEGORY_ICONS } from "../api/types";

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
  "#f97316", "#84cc16", "#94a3b8",
];

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

export default function Stats() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categories, setCategories] = useState<CategoryStatDetail[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.stats.monthly(year, month),
      api.stats.byCategoryDetail(year, month),
    ]).then(([s, c]) => {
      setSummary(s);
      setCategories(c);
      setExpanded(null);
    });
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const pieData = categories.map((c) => ({ name: c.category, value: c.total }));

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      <div className="px-5 pt-safe pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <h1 className="text-xl font-bold text-white mb-4">통계</h1>

        <div className="flex items-center gap-4 mb-4">
          <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
          <span className="text-white font-medium">{year}년 {month}월</span>
          <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
        </div>
      </div>

      {/* 요약 */}
      {summary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4 flex justify-around mb-4">
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">지출</p>
            <p className="text-red-400 font-bold">{fmt(summary.total_expense)}원</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">수입</p>
            <p className="text-emerald-400 font-bold">{fmt(summary.total_income)}원</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">순수익</p>
            <p className={`font-bold ${summary.net >= 0 ? "text-white" : "text-red-400"}`}>
              {summary.net >= 0 ? "+" : ""}{fmt(summary.net)}원
            </p>
          </div>
        </div>
      )}

      {/* 파이 차트 */}
      {pieData.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4 mb-4">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))}원`, ""]}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 카테고리별 아코디언 */}
      <div className="flex flex-col gap-2 px-4">
        {categories.map((cat, idx) => {
          const percent = summary?.total_expense
            ? (cat.total / summary.total_expense) * 100
            : 0;
          const budgetUsed = cat.budget ? (cat.total / cat.budget) * 100 : null;
          const isOpen = expanded === cat.category;

          return (
            <div key={cat.category} className="bg-slate-800 rounded-xl overflow-hidden">
              {/* 대분류 헤더 */}
              <button
                className="w-full px-4 py-3 text-left active:bg-slate-700 transition-colors"
                onClick={() => setExpanded(isOpen ? null : cat.category)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span>{CATEGORY_ICONS[cat.category] ?? "📌"}</span>
                  <span className="text-white text-sm font-medium flex-1">{cat.category}</span>
                  <span className="text-white text-sm font-semibold">{fmt(cat.total)}원</span>
                  <span className="text-slate-500 text-xs ml-1">{isOpen ? "▲" : "▼"}</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(percent, 100)}%`,
                      backgroundColor: COLORS[idx % COLORS.length],
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-500">{percent.toFixed(1)}%</span>
                  {cat.budget && (
                    <span className={`text-xs ${budgetUsed! > 100 ? "text-red-400" : "text-slate-500"}`}>
                      예산 {fmt(cat.budget)}원 ({budgetUsed!.toFixed(0)}%)
                    </span>
                  )}
                </div>
              </button>

              {/* 중분류 펼침 */}
              {isOpen && (
                <div className="border-t border-slate-700 px-4 py-2 flex flex-col gap-2">
                  {cat.subcategories.map((sub) => {
                    const subPercent = cat.total > 0 ? (sub.total / cat.total) * 100 : 0;
                    return (
                      <div key={sub.subcategory} className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs w-16 shrink-0">{sub.subcategory}</span>
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(subPercent, 100)}%`,
                              backgroundColor: COLORS[idx % COLORS.length] + "99",
                            }}
                          />
                        </div>
                        <span className="text-slate-300 text-xs shrink-0">{fmt(sub.total)}원</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-16">데이터가 없습니다</p>
        )}
      </div>
    </div>
  );
}
