import type {
  Account,
  Budget,
  CategoryGroup,
  CategoryStat,
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  Installment,
  MonthlySummary,
  SubcategoryItem,
  Subscription,
  TopTransaction,
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

  installments: {
    list: () => request<Installment[]>("/installments"),
    create: (body: Omit<Installment, "id" | "monthly_amount" | "created_at">) =>
      request<Installment>("/installments", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Omit<Installment, "id" | "monthly_amount" | "created_at">>) =>
      request<Installment>(`/installments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/installments/${id}`, { method: "DELETE" }),
  },

  subscriptions: {
    list: () => request<Subscription[]>("/subscriptions"),
    create: (body: {
      name: string; amount: number; cycle: string; billing_day: number;
      start_year: number; start_month: number;
      category?: string | null; subcategory?: string | null;
    }) => request<Subscription>("/subscriptions", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Omit<Subscription, "id" | "start_date" | "created_at">>) =>
      request<Subscription>(`/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/subscriptions/${id}`, { method: "DELETE" }),
  },

  categories: {
    list: () => request<CategoryGroup[]>("/categories"),
    create: (body: { name: string; icon: string; parent_id?: number | null }) =>
      request<CategoryGroup | SubcategoryItem>("/categories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: { name?: string; icon?: string }) =>
      request<SubcategoryItem>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/categories/${id}`, { method: "DELETE" }),
  },

  stats: {
    monthly: (year: number, month: number) =>
      request<MonthlySummary>(`/stats/monthly?year=${year}&month=${month}`),
    byCategory: (year: number, month: number) =>
      request<CategoryStat[]>(`/stats/by-category?year=${year}&month=${month}`),
    byCategoryDetail: (year: number, month: number) =>
      request<CategoryStatDetail[]>(`/stats/by-category-detail?year=${year}&month=${month}`),
    daily: (year: number, month: number) =>
      request<DailyStat[]>(`/stats/daily?year=${year}&month=${month}`),
    topTransactions: (year: number, month: number, limit = 5) =>
      request<TopTransaction[]>(`/stats/top-transactions?year=${year}&month=${month}&limit=${limit}`),
    fixedVsVariable: (year: number, month: number) =>
      request<FixedVsVariable>(`/stats/fixed-vs-variable?year=${year}&month=${month}`),
  },
};
