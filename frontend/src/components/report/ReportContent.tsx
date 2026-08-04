import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Report } from "../../api/types";
import BudgetCard from "./BudgetCard";
import { CategoryTableCard, DonutCard, FixedVarCard } from "./CompositionCards";
import { DailyFlowCard, HeatmapCard } from "./FlowCards";
import InsightsCard from "./InsightsCard";
import KpiRow from "./KpiRow";
import { DowCard, WeeklyCard } from "./PatternCards";
import { FrequentCard, TopCard } from "./RecordCards";
import ReviewCard from "./ReviewCard";
import { CategoryTrendCard, SavingsRateCard, TrendsCard } from "./TrendCards";
import YtdCard from "./YtdCard";

export default function ReportContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  function load(y: number, m: number) {
    setError(false); setReport(null);
    api.report.get(y, m).then(setReport).catch(() => setError(true));
  }
  useEffect(() => { load(year, month); }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-4">
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
        <span className="text-white font-medium">{year}년 {month}월</span>
        <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
      </div>

      {error && (
        <div className="text-center py-20">
          <p className="text-slate-400 mb-3">리포트를 불러오지 못했습니다</p>
          <button onClick={() => load(year, month)}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">다시 시도</button>
        </div>
      )}
      {!error && !report && <p className="text-slate-500 text-center py-20">불러오는 중...</p>}

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <KpiRow summary={report.summary} pace={report.pace} />
          <InsightsCard insights={report.insights} />
          <ReviewCard year={year} month={month} />
          <DailyFlowCard daily={report.daily} />
          <HeatmapCard daily={report.daily} year={year} month={month} />
          <TrendsCard trends={report.trends} />
          <SavingsRateCard trends={report.trends} />
          <CategoryTrendCard trend={report.category_trend} />
          <DonutCard breakdown={report.breakdown} />
          <CategoryTableCard breakdown={report.breakdown} />
          <FixedVarCard fv={report.fixed_variable} income={report.summary?.income ?? null} />
          <DowCard dow={report.dow} />
          <WeeklyCard weekly={report.weekly} />
          <TopCard top={report.top} />
          <FrequentCard frequent={report.frequent} />
          <BudgetCard budgets={report.budgets} />
          <YtdCard ytd={report.ytd} />
        </div>
      )}
    </div>
  );
}
