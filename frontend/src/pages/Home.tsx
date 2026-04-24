import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MonthlySummary, Transaction } from "../api/types";
import CategoryBadge from "../components/CategoryBadge";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

export default function Home() {
  const now = new Date();
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);

  useEffect(() => {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    Promise.all([
      api.stats.monthly(y, m),
      api.transactions.list(y, m),
    ]).then(([s, txs]) => {
      setSummary(s);
      setRecent(txs.slice(0, 5));
    });
  }, []);

  return (
    <div className="flex flex-col pb-24 bg-slate-950 min-h-svh">
      {/* 헤더 */}
      <div className="px-5 pt-safe pt-6 pb-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <p className="text-slate-400 text-sm">
          {now.getFullYear()}년 {now.getMonth() + 1}월
        </p>
        <h1 className="text-2xl font-bold text-white mt-1">이번 달 현황</h1>
      </div>

      {/* 요약 카드 */}
      <div className="mx-4 rounded-2xl bg-slate-800 p-5 flex flex-col gap-3">
        {summary ? (
          <>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">지출</span>
              <span className="text-red-400 font-semibold">
                -{fmt(summary.total_expense)}원
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">수입</span>
              <span className="text-emerald-400 font-semibold">
                +{fmt(summary.total_income)}원
              </span>
            </div>
            <div className="border-t border-slate-700 pt-3 flex justify-between">
              <span className="text-slate-300 text-sm font-medium">순수익</span>
              <span className={`font-bold ${summary.net >= 0 ? "text-white" : "text-red-400"}`}>
                {summary.net >= 0 ? "+" : ""}{fmt(summary.net)}원
              </span>
            </div>
          </>
        ) : (
          <div className="h-20 animate-pulse bg-slate-700 rounded-xl" />
        )}
      </div>

      {/* 최근 내역 */}
      <div className="px-5 mt-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold text-white">최근 내역</h2>
          <Link to="/transactions" className="text-indigo-400 text-sm">
            전체보기
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {recent.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">
                  {tx.description || "내역 없음"}
                </p>
                <CategoryBadge
                  category={tx.category}
                  confirmed={tx.category_confirmed}
                />
              </div>
              <span
                className={`text-sm font-semibold shrink-0 ${
                  tx.type === "income" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}원
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">
              내역이 없습니다
            </p>
          )}
        </div>
      </div>

      {/* FAB */}
      <Link
        to="/add"
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-2xl shadow-lg active:scale-90 transition-transform"
      >
        +
      </Link>
    </div>
  );
}
