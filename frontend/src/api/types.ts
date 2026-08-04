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

export interface Subscription {
  id: number;
  name: string;
  amount: number;
  cycle: "monthly" | "yearly";
  billing_day: number;
  category: string | null;
  subcategory: string | null;
  is_active: boolean;
  start_date: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number | null;
  installment_id: number | null;
  subscription_id: number | null;
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
  total_invested: number;
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

export interface SubcategoryItem {
  id: number;
  name: string;
}

export interface CategoryGroup {
  id: number;
  name: string;
  icon: string;
  excluded_from_expense: boolean;
  subcategories: SubcategoryItem[];
}

export interface DailyStat {
  day: number;
  total: number;
}

export interface TopTransaction {
  id: number;
  description: string;
  amount: number;
  category: string | null;
  subcategory: string | null;
  date: string;
}

export interface FixedVsVariable {
  fixed_total: number;
  variable_total: number;
  fixed_ratio: number;
  variable_ratio: number;
}

export interface MonthlyEntry {
  month: number;
  income: number;
  expense: number;
  invested: number;
}

export interface YearlySummary {
  year: number;
  total_income: number;
  total_expense: number;
  total_invested: number;
  net: number;
  savings_rate: number | null;
  months: MonthlyEntry[];
}

export interface DowStat {
  dow: number;   // PostgreSQL DOW: 0=日, 1=月, ..., 6=土
  total: number;
  count: number;
}

export interface UncategorizedStat {
  total_count: number;
  uncategorized_count: number;
  ratio: number;
}

// --- Report v2 ---

export interface SummaryBlock {
  income: number; expense: number; invested: number; net: number; savings_rate: number | null;
}
export interface ReportSummary extends SummaryBlock { prev: SummaryBlock; }
export interface ReportPace {
  spent_so_far: number; projected: number | null; daily_avg: number; prev_daily_avg: number;
}
export interface Insight { type: string; severity: "good" | "info" | "warn"; message: string; }
export interface ReportDaily {
  day: number; total: number; cumulative: number; prev_cumulative: number | null;
}
export interface TrendMonth {
  year: number; month: number; income: number; expense: number; invested: number; net: number; savings_rate: number | null;
}
export interface CategoryTrend {
  categories: string[];
  series: Array<Record<string, number | string>>; // { ym: "2026-07", <카테고리>: 금액 }
}
export interface BreakdownSub { subcategory: string; total: number; count: number; }
export interface BreakdownRow {
  category: string; total: number; ratio: number; prev_total: number;
  diff_pct: number | null; budget: number | null; budget_used: number | null;
  subcategories: BreakdownSub[];
}
export interface FixedItem { name: string; amount: number; kind: "subscription" | "installment"; }
export interface FixedItemChange { name: string; diff: number; }
export interface ReportFixedVariable {
  fixed_total: number; variable_total: number; invested_total: number;
  fixed_ratio: number; variable_ratio: number; invested_ratio: number;
  prev_fixed_total: number; variable_3mo_avg: number | null;
  fixed_changes: FixedItemChange[];
  items: FixedItem[];
}
export interface ReportDow { dow: number; total: number; count: number; avg: number; }
export interface ReportWeek { week: number; total: number; }
export interface FrequentMerchant { description: string; count: number; total: number; }
export interface BudgetGauge {
  category: string; budget: number; spent: number; used_pct: number; ideal_pct: number;
}
export interface MonthlyReview {
  year: number; month: number; content: string; model: string; created_at: string;
}
export interface Report {
  year: number; month: number;
  summary: ReportSummary | null;
  pace: ReportPace | null;
  insights: Insight[] | null;
  daily: ReportDaily[] | null;
  trends: TrendMonth[] | null;
  category_trend: CategoryTrend | null;
  breakdown: BreakdownRow[] | null;
  fixed_variable: ReportFixedVariable | null;
  dow: ReportDow[] | null;
  weekly: ReportWeek[] | null;
  top: TopTransaction[] | null;
  frequent: FrequentMerchant[] | null;
  budgets: BudgetGauge[] | null;
  ytd: YearlySummary | null;
}
