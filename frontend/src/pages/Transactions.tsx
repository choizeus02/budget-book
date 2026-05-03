import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Transaction } from "../api/types";
import CategoryBadge from "../components/CategoryBadge";
import { useCategories } from "../contexts/CategoriesContext";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

function fmtDatetime(dateStr: string) {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function toDatetimeLocal(dateStr: string) {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default function Transactions() {
  const { categoryMap, iconOf } = useCategories();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<number | null>(null);

  useEffect(() => {
    api.transactions.list(year, month).then(setTransactions);
  }, [year, month]);

  async function handleCategoryChange(id: number, category: string, subcategory: string) {
    const updated = await api.transactions.update(id, {
      category,
      subcategory,
      category_confirmed: true,
    });
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? updated : t))
    );
    setEditingCategory(null);
  }

  async function handleDateChange(id: number, date: string) {
    const updated = await api.transactions.update(id, { date });
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingDate(null);
  }

  async function handleDelete(id: number) {
    await api.transactions.delete(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      {/* 헤더 */}
      <div className="px-5 pt-safe pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <h1 className="text-xl font-bold text-white mb-4">거래 내역</h1>

        {/* 월 선택 */}
        <div className="flex items-center gap-4 mb-4">
          <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
          <span className="text-white font-medium">{year}년 {month}월</span>
          <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
        </div>
      </div>

      {/* 내역 목록 */}
      <div className="flex flex-col gap-2 px-4">
        {transactions.map((tx) => (
          <div key={tx.id} className="bg-slate-800 rounded-xl px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">
                  {tx.description || "내역 없음"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <CategoryBadge
                    category={tx.category}
                    subcategory={tx.subcategory}
                    confirmed={tx.category_confirmed}
                    onClick={() => setEditingCategory(tx.id === editingCategory ? null : tx.id)}
                  />
                  <button
                    onClick={() => setEditingDate(tx.id === editingDate ? null : tx.id)}
                    className="text-slate-500 text-xs"
                  >
                    {fmtDatetime(tx.date)}
                  </button>
                </div>

                {/* 카테고리 선택 패널 */}
                {editingCategory === tx.id && (
                  <div className="mt-2 flex flex-col gap-2">
                    {Object.entries(categoryMap).map(([cat, subs]) => (
                      <div key={cat} className="flex flex-wrap gap-1 items-center">
                        <span className="text-slate-500 text-xs w-4 text-center">
                          {iconOf(cat)}
                        </span>
                        {subs.map((sub) => (
                          <button
                            key={sub}
                            onClick={() => handleCategoryChange(tx.id, cat, sub)}
                            className="px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300 text-xs active:bg-indigo-600"
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* 날짜 수정 패널 */}
                {editingDate === tx.id && (
                  <div className="mt-2 flex gap-2 items-center">
                    <input
                      type="datetime-local"
                      defaultValue={toDatetimeLocal(tx.date)}
                      onChange={(e) => handleDateChange(tx.id, e.target.value)}
                      className="bg-slate-700 text-white rounded-lg px-2 py-1 text-xs outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`text-sm font-semibold ${
                    tx.type === "income" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}원
                </span>
                <button
                  onClick={() => handleDelete(tx.id)}
                  className="text-slate-600 text-xs active:text-red-400"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}

        {transactions.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-16">내역이 없습니다</p>
        )}
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
