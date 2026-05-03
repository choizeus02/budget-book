import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Account } from "../api/types";
import { useCategories } from "../contexts/CategoriesContext";

// ── 자산 섹션 ──────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "현금",
  checking: "체크카드",
  savings: "저축",
  credit: "신용카드",
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function AssetsSection() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingBalance, setEditingBalance] = useState<number | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Account["type"]>("checking");
  const [newBalance, setNewBalance] = useState("");

  useEffect(() => { api.accounts.list().then(setAccounts); }, []);

  async function handleAdd() {
    if (!newName) return;
    const account = await api.accounts.create({
      name: newName, type: newType,
      balance: Number(newBalance) || 0, color: "#6366f1", icon: "💳",
    });
    setAccounts((prev) => [...prev, account]);
    setShowAdd(false); setNewName(""); setNewBalance("");
  }

  async function handleUpdateBalance(id: number) {
    const updated = await api.accounts.update(id, { balance: Number(balanceInput) });
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setEditingBalance(null);
  }

  async function handleDelete(id: number) {
    await api.accounts.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  const totalAsset = accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + a.balance, 0);
  const totalCredit = accounts.filter((a) => a.type === "credit").reduce((s, a) => s + a.balance, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-4 rounded-2xl bg-indigo-900/40 border border-indigo-700/30 p-5">
        <p className="text-slate-400 text-xs mb-1">순자산 (자산 - 부채)</p>
        <p className="text-3xl font-bold text-white">{fmt(totalAsset - totalCredit)}원</p>
        <div className="flex gap-4 mt-3 text-sm">
          <div><span className="text-slate-400">자산 </span><span className="text-emerald-400 font-semibold">{fmt(totalAsset)}원</span></div>
          <div><span className="text-slate-400">부채 </span><span className="text-red-400 font-semibold">{fmt(totalCredit)}원</span></div>
        </div>
      </div>

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
                      type="number" value={balanceInput}
                      onChange={(e) => setBalanceInput(e.target.value)}
                      className="w-28 bg-slate-700 text-white text-sm rounded-lg px-2 py-1 outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleUpdateBalance(account.id)} className="text-indigo-400 text-sm">저장</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingBalance(account.id); setBalanceInput(String(account.balance)); }} className="text-right">
                    <p className={`text-sm font-semibold ${account.type === "credit" ? "text-red-400" : "text-white"}`}>{fmt(account.balance)}원</p>
                    <p className="text-xs text-slate-600">탭하여 수정</p>
                  </button>
                )}
              </div>
              <button onClick={() => handleDelete(account.id)} className="text-slate-700 text-xs ml-2 active:text-red-400">✕</button>
            </div>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="mx-4 bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="계좌/카드 이름" className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
          <select value={newType} onChange={(e) => setNewType(e.target.value as Account["type"])}
            className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none">
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="number" value={newBalance} onChange={(e) => setNewBalance(e.target.value)}
            placeholder="현재 잔액 (원)" className="bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl bg-slate-700 text-slate-400 text-sm">취소</button>
            <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold">추가</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="mx-4 py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-sm active:border-indigo-500 active:text-indigo-400">
          + 계좌/카드 추가
        </button>
      )}
    </div>
  );
}

// ── 카테고리 섹션 ──────────────────────────────────────────

function CategoriesSection() {
  const { categories, refresh } = useCategories();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", icon: "" });
  const [addingSubOf, setAddingSubOf] = useState<number | null>(null);
  const [addingSubName, setAddingSubName] = useState("");
  const [showAddParent, setShowAddParent] = useState(false);
  const [parentForm, setParentForm] = useState({ name: "", icon: "📌" });

  async function handleDeleteCategory(id: number) {
    await api.categories.delete(id);
    refresh();
  }

  async function handleUpdateCategory(id: number) {
    await api.categories.update(id, { name: editForm.name, icon: editForm.icon });
    setEditingId(null);
    refresh();
  }

  async function handleAddSub(parentId: number) {
    if (!addingSubName.trim()) return;
    const parent = categories.find((c) => c.id === parentId);
    await api.categories.create({ name: addingSubName.trim(), icon: parent?.icon ?? "📌", parent_id: parentId });
    setAddingSubOf(null);
    setAddingSubName("");
    refresh();
  }

  async function handleAddParent() {
    if (!parentForm.name.trim()) return;
    await api.categories.create({ name: parentForm.name.trim(), icon: parentForm.icon });
    setShowAddParent(false);
    setParentForm({ name: "", icon: "📌" });
    refresh();
  }

  return (
    <div className="flex flex-col gap-2 px-4">
      {categories.map((cat) => (
        <div key={cat.id} className="bg-slate-800 rounded-xl overflow-hidden">
          {/* 대분류 행 */}
          {editingId === cat.id ? (
            <div className="px-4 py-3 flex gap-2 items-center">
              <input value={editForm.icon} onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                className="w-10 bg-slate-700 text-white text-center rounded-lg py-1.5 text-sm outline-none" />
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none" />
              <button onClick={() => handleUpdateCategory(cat.id)} className="text-indigo-400 text-sm">저장</button>
              <button onClick={() => setEditingId(null)} className="text-slate-500 text-sm">취소</button>
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="text-base">{cat.icon}</span>
              <span className="text-white text-sm font-medium flex-1">{cat.name}</span>
              <button onClick={() => { setEditingId(cat.id); setEditForm({ name: cat.name, icon: cat.icon }); }}
                className="text-slate-500 text-xs active:text-indigo-400 px-2">수정</button>
              <button onClick={() => handleDeleteCategory(cat.id)}
                className="text-slate-600 text-xs active:text-red-400">삭제</button>
            </div>
          )}

          {/* 중분류 목록 */}
          <div className="border-t border-slate-700 px-4 py-2 flex flex-wrap gap-1.5">
            {cat.subcategories.map((sub) => (
              <span key={sub.id} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300 text-xs">
                {sub.name}
                <button onClick={() => handleDeleteCategory(sub.id)} className="text-slate-500 active:text-red-400 ml-0.5">×</button>
              </span>
            ))}
            {addingSubOf === cat.id ? (
              <span className="flex items-center gap-1">
                <input
                  value={addingSubName} onChange={(e) => setAddingSubName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSub(cat.id); }}
                  placeholder="이름" autoFocus
                  className="w-20 bg-slate-700 text-white rounded-lg px-2 py-0.5 text-xs outline-none"
                />
                <button onClick={() => handleAddSub(cat.id)} className="text-indigo-400 text-xs">추가</button>
                <button onClick={() => { setAddingSubOf(null); setAddingSubName(""); }} className="text-slate-500 text-xs">취소</button>
              </span>
            ) : (
              <button onClick={() => { setAddingSubOf(cat.id); setAddingSubName(""); }}
                className="px-2 py-0.5 rounded-lg border border-dashed border-slate-600 text-slate-500 text-xs active:border-indigo-500 active:text-indigo-400">
                + 추가
              </button>
            )}
          </div>
        </div>
      ))}

      {/* 대분류 추가 */}
      {showAddParent ? (
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-slate-400 text-xs">새 대분류</p>
          <div className="flex gap-2">
            <input value={parentForm.icon} onChange={(e) => setParentForm((f) => ({ ...f, icon: e.target.value }))}
              className="w-12 bg-slate-700 text-white text-center rounded-xl py-2 text-sm outline-none" placeholder="🏷️" />
            <input value={parentForm.name} onChange={(e) => setParentForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="카테고리 이름" className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddParent(false)} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-400 text-sm">취소</button>
            <button onClick={handleAddParent} disabled={!parentForm.name.trim()}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold ${parentForm.name.trim() ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-500"}`}>
              추가
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddParent(true)}
          className="py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-sm active:border-indigo-500 active:text-indigo-400">
          + 대분류 추가
        </button>
      )}
    </div>
  );
}

// ── 메인 설정 페이지 ───────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState<"assets" | "categories">("assets");

  return (
    <div className="flex flex-col pb-20 bg-slate-950 min-h-svh">
      <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <h1 className="text-xl font-bold text-white mb-4">설정</h1>

        {/* 내부 탭 */}
        <div className="flex bg-slate-800 rounded-xl p-1 mb-4">
          {(["assets", "categories"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-slate-600 text-white" : "text-slate-400"
              }`}>
              {t === "assets" ? "자산" : "카테고리"}
            </button>
          ))}
        </div>
      </div>

      {tab === "assets" ? <AssetsSection /> : <CategoriesSection />}
    </div>
  );
}
