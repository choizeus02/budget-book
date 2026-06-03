import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  MonthlySummary,
  TopTransaction,
} from "../../api/types";

export default function ReportSection() {
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

      {/* 섹션 1-6: Task 7-10에서 추가 */}
      {summary && prevSummary && daily && categories && fixedVar && topTx && null}
    </div>
  );
}
