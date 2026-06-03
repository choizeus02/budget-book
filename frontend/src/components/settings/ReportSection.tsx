import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import { useCategories } from "../../contexts/CategoriesContext";
import type {
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  MonthlySummary,
  TopTransaction,
} from "../../api/types";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

export function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default function ReportSection() {
  const { iconOf } = useCategories();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<MonthlySummary | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [categories, setCategories] = useState<CategoryStatDetail[]>([]);
  const [fixedVar, setFixedVar] = useState<FixedVsVariable | null>(null);
  const [topTx, setTopTx] = useState<TopTransaction[]>([]);

  useEffect(() => {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;

    Promise.all([
      api.stats.monthly(year, month),
      api.stats.monthly(prevYear, prevMonth),
      api.stats.daily(year, month),
      api.stats.byCategoryDetail(year, month),
      api.stats.fixedVsVariable(year, month),
      api.stats.topTransactions(year, month, 5),
    ]).then(([s, ps, d, c, fv, t]) => {
      setSummary(s);
      setPrevSummary(ps);
      setDaily(d);
      setCategories(c);
      setFixedVar(fv);
      setTopTx(t);
    });
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  // 저축률 계산
  const savingsRate = summary && summary.total_income > 0
    ? ((summary.total_income - summary.total_expense) / summary.total_income) * 100
    : null;

  // 전월 대비 변화율
  const expenseDiff = summary && prevSummary && prevSummary.total_expense > 0
    ? ((summary.total_expense - prevSummary.total_expense) / prevSummary.total_expense) * 100
    : null;
  const incomeDiff = summary && prevSummary && prevSummary.total_income > 0
    ? ((summary.total_income - prevSummary.total_income) / prevSummary.total_income) * 100
    : null;
  const prevSavingsRate = prevSummary && prevSummary.total_income > 0
    ? ((prevSummary.total_income - prevSummary.total_expense) / prevSummary.total_income) * 100
    : null;
  const savingsDiff = savingsRate !== null && prevSavingsRate !== null
    ? savingsRate - prevSavingsRate
    : null;

  // 일별 바 차트 데이터 — 없는 날은 0
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = new Map(daily.map((d) => [d.day, d.total]));
  const dailyChartData = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    total: dailyMap.get(i + 1) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-4 px-5">
        <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
        <span className="text-white font-medium">{year}년 {month}월</span>
        <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
      </div>

      {!summary && (
        <p className="text-slate-500 text-sm text-center py-8">로딩 중...</p>
      )}

      {/* 섹션 1: 이달 요약 */}
      {summary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">이달 요약</p>
          <div className="flex justify-around">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">수입</p>
              <p className="text-emerald-400 tabular-nums font-light text-sm">{fmt(summary.total_income)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">지출</p>
              <p className="text-red-400 tabular-nums font-light text-sm">{fmt(summary.total_expense)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">저축률</p>
              <p className="text-indigo-400 tabular-nums font-light text-sm">
                {savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "--"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 2: 전월 대비 */}
      {summary && prevSummary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">전월 대비</p>
          <div className="flex gap-2">
            {[
              { label: "지출", diff: expenseDiff, invert: true },
              { label: "수입", diff: incomeDiff, invert: false },
              { label: "저축률", diff: savingsDiff, invert: false, unit: "p" },
            ].map(({ label, diff, invert, unit = "" }) => {
              const isGood = diff === null ? null : invert ? diff < 0 : diff > 0;
              const color = diff === null ? "text-slate-500"
                : isGood ? "text-emerald-400" : "text-red-400";
              return (
                <div key={label} className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className={`text-sm font-semibold tabular-nums ${color}`}>
                    {diff === null ? "--" : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}%${unit}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 섹션 3: 일별 지출 추이 */}
      <div className="mx-4 rounded-2xl bg-slate-800 p-4">
        <p className="text-slate-500 text-xs mb-3">일별 지출 추이</p>
        {daily.length === 0 ? (
          <p className="text-slate-600 text-xs text-center py-4">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={dailyChartData} barCategoryGap="20%">
              <XAxis
                dataKey="day"
                tick={{ fill: "#475569", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                ticks={[1, Math.ceil(daysInMonth / 2), daysInMonth]}
              />
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))}원`, "지출"]}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                cursor={{ fill: "#334155" }}
              />
              <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 섹션 4: 예산 달성률 */}
      {categories.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">예산 달성률</p>
          <div className="flex flex-col gap-3">
            {categories.map((cat) => {
              const pct = cat.budget ? (cat.total / cat.budget) * 100 : null;
              const over = pct !== null && pct > 100;
              return (
                <div key={cat.category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 text-xs">
                      {iconOf(cat.category)} {cat.category}
                    </span>
                    {pct !== null ? (
                      <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-slate-400"}`}>
                        {fmt(cat.total)}원 / {fmt(cat.budget!)}원 ({pct.toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">{fmt(cat.total)}원 · 예산 없음</span>
                    )}
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${over ? "bg-red-400" : "bg-indigo-500"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 섹션 5: 고정비 vs 변동비 */}
      {fixedVar && (fixedVar.fixed_total + fixedVar.variable_total) > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">고정비 vs 변동비</p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">고정비</p>
              <p className="text-amber-400 text-sm font-semibold tabular-nums">{fmt(fixedVar.fixed_total)}원</p>
              <p className="text-slate-600 text-xs">{(fixedVar.fixed_ratio * 100).toFixed(1)}%</p>
            </div>
            <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">변동비</p>
              <p className="text-indigo-400 text-sm font-semibold tabular-nums">{fmt(fixedVar.variable_total)}원</p>
              <p className="text-slate-600 text-xs">{(fixedVar.variable_ratio * 100).toFixed(1)}%</p>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400"
              style={{ width: `${fixedVar.fixed_ratio * 100}%` }}
            />
            <div className="flex-1 bg-indigo-500" />
          </div>
        </div>
      )}

      {/* 섹션 6: TOP 5 지출 */}
      {topTx.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">TOP {topTx.length} 지출</p>
          <div className="flex flex-col">
            {topTx.map((tx, i) => (
              <div key={tx.id}>
                {i > 0 && <div className="h-px bg-slate-700 my-2" />}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">{tx.description || "(메모 없음)"}</p>
                    <p className="text-slate-500 text-xs">
                      {tx.category ? `${iconOf(tx.category)} ${tx.category}` : "미분류"}
                      {tx.subcategory ? ` · ${tx.subcategory}` : ""}
                    </p>
                  </div>
                  <p className="text-red-400 text-sm font-semibold tabular-nums ml-3">
                    {fmt(tx.amount)}원
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
