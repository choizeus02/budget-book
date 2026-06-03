import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import type {
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  MonthlySummary,
  TopTransaction,
} from "../../api/types";
import { useCategories } from "../../contexts/CategoriesContext";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// Re-export helpers so they are considered "used" until Task 7 sections are added
export { fmt, fmtPct, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer };

export default function ReportSection() {
  const { iconOf } = useCategories();
  void iconOf; // used in Task 7
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<MonthlySummary | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [categories, setCategories] = useState<CategoryStatDetail[]>([]);
  void categories; // used in Task 7
  const [fixedVar, setFixedVar] = useState<FixedVsVariable | null>(null);
  void fixedVar; // used in Task 7
  const [topTx, setTopTx] = useState<TopTransaction[]>([]);
  void topTx; // used in Task 7

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
  void expenseDiff; // used in Task 7
  const incomeDiff = summary && prevSummary && prevSummary.total_income > 0
    ? ((summary.total_income - prevSummary.total_income) / prevSummary.total_income) * 100
    : null;
  void incomeDiff; // used in Task 7
  const prevSavingsRate = prevSummary && prevSummary.total_income > 0
    ? ((prevSummary.total_income - prevSummary.total_expense) / prevSummary.total_income) * 100
    : null;
  const savingsDiff = savingsRate !== null && prevSavingsRate !== null
    ? savingsRate - prevSavingsRate
    : null;
  void savingsDiff; // used in Task 7

  // 일별 바 차트 데이터 — 없는 날은 0
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = new Map(daily.map((d) => [d.day, d.total]));
  const dailyChartData = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    total: dailyMap.get(i + 1) ?? 0,
  }));
  void dailyChartData; // used in Task 7

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-4 px-5">
        <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
        <span className="text-white font-medium">{year}년 {month}월</span>
        <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
      </div>

      {/* 섹션들은 다음 태스크에서 추가 */}
      {!summary && (
        <p className="text-slate-500 text-sm text-center py-8">로딩 중...</p>
      )}
    </div>
  );
}
