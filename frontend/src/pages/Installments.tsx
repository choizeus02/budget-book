import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Installment } from "../api/types";
import { useCategories } from "../contexts/CategoriesContext";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

function calcMonthly(total: number, months: number, rate: number | null): number {
  const raw = !rate
    ? total / months
    : (() => { const r = rate / 12 / 100; return total * r * (1 + r) ** months / ((1 + r) ** months - 1); })();
  return Math.floor(raw / 100) * 100;  // 100원 단위 내림
}

function getProgress(inst: Installment) {
  const now = new Date();
  const startMs = new Date(inst.start_year, inst.start_month - 1, 1).getTime();
  const endMs = new Date(inst.start_year, inst.start_month - 1 + inst.total_months, 1).getTime();
  const nowMs = now.getTime();

  if (nowMs < startMs) return { current: 0, status: "pending" as const };
  if (nowMs >= endMs) return { current: inst.total_months, status: "complete" as const };
  const months =
    (now.getFullYear() - inst.start_year) * 12 + (now.getMonth() + 1 - inst.start_month) + 1;
  return { current: Math.min(months, inst.total_months), status: "active" as const };
}

const EMPTY_FORM = {
  name: "",
  total_amount: "",
  total_months: "",
  annual_interest_rate: "",
  start_year: new Date().getFullYear(),
  start_month: new Date().getMonth() + 1,
  category: null as string | null,
  subcategory: null as string | null,
};

export default function Installments() {
  const { categoryMap, iconOf } = useCategories();
  const [list, setList] = useState<Installment[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  useEffect(() => {
    api.installments.list().then(setList);
  }, []);

  const monthlyPreview = form.total_amount && form.total_months
    ? calcMonthly(
        Number(form.total_amount),
        Number(form.total_months),
        form.annual_interest_rate ? Number(form.annual_interest_rate) : null,
      )
    : null;

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
    setShowCatPicker(false);
  }

  function openEdit(inst: Installment) {
    setForm({
      name: inst.name,
      total_amount: String(inst.total_amount),
      total_months: String(inst.total_months),
      annual_interest_rate: inst.annual_interest_rate ? String(inst.annual_interest_rate) : "",
      start_year: inst.start_year,
      start_month: inst.start_month,
      category: inst.category,
      subcategory: inst.subcategory,
    });
    setEditingId(inst.id);
    setShowForm(true);
    setShowCatPicker(false);
  }

  async function handleSave() {
    if (!form.name || !form.total_amount || !form.total_months) return;
    setLoading(true);
    try {
      const body = {
        name: form.name,
        total_amount: Number(form.total_amount),
        total_months: Number(form.total_months),
        annual_interest_rate: form.annual_interest_rate ? Number(form.annual_interest_rate) : null,
        start_year: form.start_year,
        start_month: form.start_month,
        category: form.category,
        subcategory: form.subcategory,
      };
      if (editingId) {
        const updated = await api.installments.update(editingId, body);
        setList((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
      } else {
        const created = await api.installments.create(body);
        setList((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    await api.installments.delete(id);
    setList((prev) => prev.filter((i) => i.id !== id));
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      <div className="px-5 pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">할부 관리</h1>
          <button
            onClick={openAdd}
            className="text-indigo-400 text-sm font-medium"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 추가/수정 폼 */}
      {showForm && (
        <div className="mx-4 mb-4 bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-white text-sm font-semibold">{editingId ? "할부 수정" : "새 할부"}</p>

          <input
            type="text"
            placeholder="이름 (예: 삼성 TV)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
          />

          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-400 text-xs">총 금액</label>
              <input
                type="number"
                placeholder="1200000"
                value={form.total_amount}
                onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))}
                className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-400 text-xs">개월수</label>
              <input
                type="number"
                placeholder="24"
                value={form.total_months}
                onChange={(e) => setForm((f) => ({ ...f, total_months: e.target.value }))}
                className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs">연이자율 (%) — 비워두면 무이자</label>
            <input
              type="number"
              placeholder="5.5"
              value={form.annual_interest_rate}
              onChange={(e) => setForm((f) => ({ ...f, annual_interest_rate: e.target.value }))}
              className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-400 text-xs">시작 년도</label>
              <select
                value={form.start_year}
                onChange={(e) => setForm((f) => ({ ...f, start_year: Number(e.target.value) }))}
                className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
              >
                {years.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-400 text-xs">시작 월</label>
              <select
                value={form.start_month}
                onChange={(e) => setForm((f) => ({ ...f, start_month: Number(e.target.value) }))}
                className="bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
              >
                {months.map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          </div>

          {/* 카테고리 선택 */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs">카테고리</label>
            <button
              onClick={() => setShowCatPicker((v) => !v)}
              className="bg-slate-700 text-left text-sm rounded-xl px-3 py-2 text-white"
            >
              {form.category
                ? `${iconOf(form.category)} ${form.category}${form.subcategory ? ` · ${form.subcategory}` : ""}`
                : "선택 안함"}
            </button>
            {showCatPicker && (
              <div className="flex flex-col gap-1.5 mt-1">
                {Object.entries(categoryMap).map(([cat, subs]) => (
                  <div key={cat} className="flex flex-wrap gap-1 items-center">
                    <span className="text-slate-500 text-xs w-4 text-center">{iconOf(cat)}</span>
                    {subs.map((sub) => (
                      <button
                        key={sub}
                        onClick={() => {
                          setForm((f) => ({ ...f, category: cat, subcategory: sub }));
                          setShowCatPicker(false);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-slate-600 text-slate-300 text-xs active:bg-indigo-600"
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 월납부액 미리보기 */}
          {monthlyPreview && (
            <div className="bg-slate-700/50 rounded-xl px-3 py-2 flex justify-between">
              <span className="text-slate-400 text-sm">월 납부액</span>
              <span className="text-white text-sm font-semibold">{fmt(monthlyPreview)}원</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl bg-slate-700 text-slate-300 text-sm"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name || !form.total_amount || !form.total_months || loading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                form.name && form.total_amount && form.total_months && !loading
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-700 text-slate-500"
              }`}
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* 할부 목록 */}
      <div className="flex flex-col gap-2 px-4">
        {list.map((inst) => {
          const { current, status } = getProgress(inst);
          const pct = (current / inst.total_months) * 100;

          return (
            <div key={inst.id} className="bg-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{inst.name}</p>
                    {status === "complete" && (
                      <span className="text-xs text-emerald-400 shrink-0">완료</span>
                    )}
                    {status === "pending" && (
                      <span className="text-xs text-slate-500 shrink-0">예정</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {inst.category && (
                      <span className="text-xs text-slate-500">
                        {iconOf(inst.category)} {inst.category}
                        {inst.subcategory ? ` · ${inst.subcategory}` : ""}
                      </span>
                    )}
                    <span className="text-xs text-slate-600">
                      {inst.annual_interest_rate ? `연 ${inst.annual_interest_rate}%` : "무이자"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-white text-sm font-semibold">월 {fmt(inst.monthly_amount)}원</span>
                  <span className="text-slate-400 text-xs">{current}/{inst.total_months}개월</span>
                </div>
              </div>

              {/* 진행 바 */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    status === "complete" ? "bg-emerald-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">
                  총 {fmt(inst.total_amount)}원 · {inst.start_year}.{String(inst.start_month).padStart(2, "0")} 시작
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => openEdit(inst)}
                    className="text-slate-500 text-xs active:text-indigo-400"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(inst.id)}
                    className="text-slate-600 text-xs active:text-red-400"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {list.length === 0 && !showForm && (
          <p className="text-slate-500 text-sm text-center py-16">등록된 할부가 없습니다</p>
        )}
      </div>
    </div>
  );
}
