import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import QuickInput from "../components/QuickInput";

type TxType = "expense" | "income";

export default function AddTransaction() {
  const navigate = useNavigate();
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const num = Number(amount);
    if (!num) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.transactions.create({
        amount: num,
        description,
        type,
        date: today,
      });
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-svh bg-slate-950">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-safe pt-4 pb-3 border-b border-slate-800">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 text-lg px-2 py-1 -ml-2"
        >
          ✕
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-white">
          지출/수입 추가
        </h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 gap-6 overflow-y-auto no-scrollbar">
        {/* 지출/수입 토글 */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700">
          {(["expense", "income"] as TxType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                type === t
                  ? t === "expense"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-emerald-500/20 text-emerald-400"
                  : "text-slate-500"
              }`}
            >
              {t === "expense" ? "지출" : "수입"}
            </button>
          ))}
        </div>

        {/* 금액 입력 패드 */}
        <QuickInput value={amount} onChange={setAmount} />

        {/* 메모 입력 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-slate-400 font-medium">
            메모 (가게명 등, LLM이 카테고리 자동 분류)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 스타벅스, 버스, 쿠팡..."
            className="bg-slate-800 text-white rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="px-4 pb-safe pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
        <button
          onClick={handleSave}
          disabled={!amount || loading}
          className={`w-full py-4 rounded-2xl text-base font-bold transition-all ${
            amount && !loading
              ? "bg-indigo-600 text-white active:scale-95"
              : "bg-slate-800 text-slate-600"
          }`}
        >
          {loading ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
