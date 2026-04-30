import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Account } from "../api/types";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "현금",
  checking: "체크카드",
  savings: "저축",
  credit: "신용카드",
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function Assets() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingBalance, setEditingBalance] = useState<number | null>(null);
  const [balanceInput, setBalanceInput] = useState("");

  // 신규 계좌 폼
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Account["type"]>("checking");
  const [newBalance, setNewBalance] = useState("");

  useEffect(() => {
    api.accounts.list().then(setAccounts);
  }, []);

  async function handleAddAccount() {
    if (!newName) return;
    const account = await api.accounts.create({
      name: newName,
      type: newType,
      balance: Number(newBalance) || 0,
      color: "#6366f1",
      icon: "💳",
    });
    setAccounts((prev) => [...prev, account]);
    setShowAdd(false);
    setNewName("");
    setNewBalance("");
  }

  async function handleUpdateBalance(id: number) {
    const updated = await api.accounts.update(id, {
      balance: Number(balanceInput),
    });
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setEditingBalance(null);
  }

  async function handleDelete(id: number) {
    await api.accounts.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  const totalAsset = accounts
    .filter((a) => a.type !== "credit")
    .reduce((s, a) => s + a.balance, 0);
  const totalCredit = accounts
    .filter((a) => a.type === "credit")
    .reduce((s, a) => s + a.balance, 0);

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      <div className="px-5 pt-safe pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <h1 className="text-xl font-bold text-white mb-2">자산</h1>
      </div>

      {/* 총 자산 */}
      <div className="mx-4 rounded-2xl bg-indigo-900/40 border border-indigo-700/30 p-5 mb-4">
        <p className="text-slate-400 text-xs mb-1">순자산 (자산 - 부채)</p>
        <p className="text-3xl font-bold text-white">{fmt(totalAsset - totalCredit)}원</p>
        <div className="flex gap-4 mt-3 text-sm">
          <div>
            <span className="text-slate-400">자산 </span>
            <span className="text-emerald-400 font-semibold">{fmt(totalAsset)}원</span>
          </div>
          <div>
            <span className="text-slate-400">부채 </span>
            <span className="text-red-400 font-semibold">{fmt(totalCredit)}원</span>
          </div>
        </div>
      </div>

      {/* 계좌 목록 */}
      <div className="flex flex-col gap-2 px-4">
        {accounts.map((account) => (
          <div key={account.id} className="bg-slate-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{account.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{account.name}</p>
                <p className="text-slate-500 text-xs">{ACCOUNT_TYPE_LABELS[account.type]}</p>
              </div>
              <div className="text-right">
                {editingBalance === account.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={balanceInput}
                      onChange={(e) => setBalanceInput(e.target.value)}
                      className="w-28 bg-slate-700 text-white text-sm rounded-lg px-2 py-1 outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateBalance(account.id)}
                      className="text-indigo-400 text-sm"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingBalance(account.id);
                      setBalanceInput(String(account.balance));
                    }}
                    className="text-right"
                  >
                    <p className={`text-sm font-semibold ${account.type === "credit" ? "text-red-400" : "text-white"}`}>
                      {fmt(account.balance)}원
                    </p>
                    <p className="text-xs text-slate-600">탭하여 수정</p>
                  </button>
                )}
              </div>
              <button
                onClick={() => handleDelete(account.id)}
                className="text-slate-700 text-xs ml-2 active:text-red-400"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 계좌 추가 */}
      {showAdd ? (
        <div className="mx-4 mt-3 bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="계좌/카드 이름"
            className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as Account["type"])}
            className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none"
          >
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            type="number"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            placeholder="현재 잔액 (원)"
            className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 rounded-xl bg-slate-700 text-slate-400 text-sm"
            >
              취소
            </button>
            <button
              onClick={handleAddAccount}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
            >
              추가
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mx-4 mt-3 py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-sm active:border-indigo-500 active:text-indigo-400"
        >
          + 계좌/카드 추가
        </button>
      )}
    </div>
  );
}
