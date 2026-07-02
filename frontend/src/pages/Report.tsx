import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Report } from "../api/types";
import InsightsCard from "../components/report/InsightsCard";
import KpiRow from "../components/report/KpiRow";
import ReviewCard from "../components/report/ReviewCard";

export default function ReportPage() {
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
    <div className="pb-20 bg-slate-950 min-h-svh">
      <div className="max-w-6xl mx-auto px-4"
           style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">리포트</h1>
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
            <span className="text-white font-medium">{year}년 {month}월</span>
            <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
          </div>
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
            {/* ④~⑩ 카드는 Task 8~9에서 추가 */}
          </div>
        )}
      </div>
    </div>
  );
}
