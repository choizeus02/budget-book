export type AccountType = "cash" | "checking" | "savings" | "credit";
export type TransactionType = "income" | "expense";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  icon: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number | null;
  installment_id: number | null;
  amount: number;
  description: string;
  category: string | null;
  subcategory: string | null;
  category_confirmed: boolean;
  type: TransactionType;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface Installment {
  id: number;
  name: string;
  total_amount: number;
  total_months: number;
  annual_interest_rate: number | null;
  start_year: number;
  start_month: number;
  category: string | null;
  subcategory: string | null;
  monthly_amount: number;
  created_at: string;
}

export interface Budget {
  id: number;
  category: string;
  monthly_amount: number;
  created_at: string;
}

export interface MonthlySummary {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net: number;
}

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
  budget: number | null;
}

export interface SubcategoryStat {
  subcategory: string;
  total: number;
  count: number;
}

export interface CategoryStatDetail {
  category: string;
  total: number;
  count: number;
  budget: number | null;
  subcategories: SubcategoryStat[];
}

export interface CategoryGroup {
  name: string;
  icon: string;
  subcategories: string[];
}
