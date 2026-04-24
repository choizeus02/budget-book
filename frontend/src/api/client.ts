import type {
  Account,
  Budget,
  CategoryStat,
  MonthlySummary,
  Transaction,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Transactions
export const api = {
  transactions: {
    list: (year?: number, month?: number) => {
      const params = new URLSearchParams();
      if (year) params.set("year", String(year));
      if (month) params.set("month", String(month));
      return request<Transaction[]>(`/transactions?${params}`);
    },
    create: (body: {
      amount: number;
      description?: string;
      type: "income" | "expense";
      date: string;
      account_id?: number;
    }) =>
      request<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<Transaction>) =>
      request<Transaction>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      request<void>(`/transactions/${id}`, { method: "DELETE" }),
  },

  accounts: {
    list: () => request<Account[]>("/accounts"),
    create: (body: Omit<Account, "id" | "created_at">) =>
      request<Account>("/accounts", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Account>) =>
      request<Account>(`/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      request<void>(`/accounts/${id}`, { method: "DELETE" }),
  },

  budgets: {
    list: () => request<Budget[]>("/budgets"),
    upsert: (body: { category: string; monthly_amount: number }) =>
      request<Budget>("/budgets", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/budgets/${id}`, { method: "DELETE" }),
  },

  stats: {
    monthly: (year: number, month: number) =>
      request<MonthlySummary>(`/stats/monthly?year=${year}&month=${month}`),
    byCategory: (year: number, month: number) =>
      request<CategoryStat[]>(`/stats/by-category?year=${year}&month=${month}`),
  },
};
