import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CategoryStatDetail, MonthlySummary, Transaction } from "../api/types";
import CategoryBadge from "../components/CategoryBadge";
import { useCategories } from "../contexts/CategoriesContext";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

export default function Home() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const { iconOf } = useCategories();

  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [catStats, setCatStats] = useState<CategoryStatDetail[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [installmentTotal, setInstallmentTotal] = useState(0);

  useEffect(() => {
    Promise.all([
      api.stats.monthly(y, m),
      api.stats.byCategoryDetail(y, m),
      api.transactions.list(y, m),
    ]).then(([s, cats, txs]) => {
      setSummary(s);
      setCatStats(cats);
      setRecent(txs.slice(0, 5));
      setInstallmentTotal(
        txs
          .filter((tx) => tx.installment_id != null && tx.type === "expense")
          .reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
      );
    });
  }, []);

  const spendRate =
    summary && summary.total_income > 0
      ? Math.min((summary.total_expense / summary.total_income) * 100, 100)
      : 0;

  const budgetCats = catStats
    .filter((c) => c.budget != null && c.budget > 0)
    .sort((a, b) => b.total / b.budget! - a.total / a.budget!)
    .slice(0, 4);

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <p className="text-slate-400 text-sm">{y}년 {m}월</p>
        <h1 className="text-2xl font-bold text-white mt-1 mb-4">이번 달 현황</h1>
      </div>

      {/* 메인 요약 카드 */}
      <div className="mx-4 rounded-2xl bg-slate-800 p-5 mb-3">
        {summary ? (
          <>
            <p className="text-slate-400 text-xs mb-1">이번달 지출</p>
            <p className="text-3xl text-white mb-3 display-amount">{fmt(summary.total_expense)}원</p>

            {summary.total_income > 0 && (
              <div className="mb-3">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      spendRate > 90 ? "bg-red-500" : spendRate > 70 ? "bg-amber-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${spendRate}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-slate-500">
                  <span>수입 대비 {spendRate.toFixed(0)}%</span>
                  <span>수입 +{fmt(summary.total_income)}원</span>
                </div>
              </div>
            )}

            <div className="flex justify-between border-t border-slate-700 pt-3">
              <span className="text-slate-400 text-sm">순수익</span>
              <span className={`tabular-nums font-light ${summary.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {summary.net >= 0 ? "+" : ""}{fmt(summary.net)}원
              </span>
            </div>
          </>
        ) : (
          <div className="h-28 animate-pulse bg-slate-700 rounded-xl" />
        )}
      </div>

      {/* 예산 현황 */}
      {budgetCats.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-white">예산 현황</h2>
            <Link to="/stats" className="text-indigo-400 text-xs">자세히</Link>
          </div>
          <div className="bg-slate-800 rounded-2xl px-4 py-3 flex flex-col gap-3">
            {budgetCats.map((cat) => {
              const pct = (cat.total / cat.budget!) * 100;
              const barColor =
                pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-indigo-500";
              const textColor =
                pct > 100 ? "text-red-400" : pct > 80 ? "text-amber-400" : "text-slate-400";
              return (
                <div key={cat.category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 text-xs">
                      {iconOf(cat.category)} {cat.category}
                    </span>
                    <span className={`text-xs font-medium ${textColor}`}>
                      {fmt(cat.total)} / {fmt(cat.budget!)}원
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 이번달 할부 */}
      {installmentTotal > 0 && (
        <div className="mx-4 mb-3">
          <Link to="/payments">
            <div className="bg-slate-800 rounded-2xl px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>💳</span>
                <span className="text-slate-300 text-sm">이번달 납부</span>
              </div>
              <span className="text-red-400 font-semibold text-sm">-{fmt(installmentTotal)}원 →</span>
            </div>
          </Link>
        </div>
      )}

      {/* 최근 내역 */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-white">최근 내역</h2>
          <Link to="/transactions" className="text-indigo-400 text-xs">전체보기</Link>
        </div>
        <div className="flex flex-col gap-2">
          {recent.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{tx.description || "내역 없음"}</p>
                <CategoryBadge
                  category={tx.category}
                  subcategory={tx.subcategory}
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
            <p className="text-slate-500 text-sm text-center py-8">내역이 없습니다</p>
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
