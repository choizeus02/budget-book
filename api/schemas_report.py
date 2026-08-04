from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from schemas import TopTransaction, YearlySummary


class SummaryBlock(BaseModel):
    income: float
    expense: float
    invested: float
    net: float
    savings_rate: Optional[float]


class ReportSummary(SummaryBlock):
    prev: SummaryBlock


class ReportPace(BaseModel):
    spent_so_far: float
    projected: Optional[float]   # 과거 달이면 None
    daily_avg: float
    prev_daily_avg: float


class Insight(BaseModel):
    type: str
    severity: str  # good | info | warn
    message: str


class ReportDaily(BaseModel):
    day: int
    total: float
    cumulative: float
    prev_cumulative: Optional[float]  # 전월에 없는 날짜(29~31일)는 None


class TrendMonth(BaseModel):
    year: int
    month: int
    income: float
    expense: float
    invested: float
    net: float
    savings_rate: Optional[float]


class CategoryTrend(BaseModel):
    categories: list[str]           # TOP 5 카테고리 이름
    series: list[dict]              # [{"ym": "2026-07", "<카테고리>": 금액, ...}]


class BreakdownSub(BaseModel):
    subcategory: str
    total: float
    count: int


class BreakdownRow(BaseModel):
    category: str
    total: float
    ratio: float                    # 이번 달 지출 대비 0~1
    prev_total: float
    diff_pct: Optional[float]       # 전월비 %, 전월 0이면 None
    budget: Optional[float]
    budget_used: Optional[float]    # %, 예산 없으면 None
    subcategories: list[BreakdownSub]


class FixedItem(BaseModel):
    name: str
    amount: float
    kind: str  # subscription | installment


class FixedItemChange(BaseModel):
    name: str
    diff: float  # 양수 = 전월보다 증가


class ReportFixedVariable(BaseModel):
    fixed_total: float
    variable_total: float
    invested_total: float
    fixed_ratio: float
    variable_ratio: float
    invested_ratio: float
    prev_fixed_total: float
    variable_3mo_avg: Optional[float]   # 직전 3개월 변동비 평균. 데이터 없으면 None
    fixed_changes: list[FixedItemChange]
    items: list[FixedItem]


class ReportDow(BaseModel):
    dow: int   # 0=일 ... 6=토
    total: float
    count: int
    avg: float


class ReportWeek(BaseModel):
    week: int  # 1~5
    total: float


class FrequentMerchant(BaseModel):
    description: str
    count: int
    total: float


class BudgetGauge(BaseModel):
    category: str
    budget: float
    spent: float
    used_pct: float
    ideal_pct: float   # 오늘 기준 이상적 소진률(월 진행률) %


class MonthlyReviewResponse(BaseModel):
    year: int
    month: int
    content: str
    model: str
    created_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class ReportResponse(BaseModel):
    year: int
    month: int
    summary: Optional[ReportSummary]
    pace: Optional[ReportPace]
    insights: Optional[list[Insight]]
    daily: Optional[list[ReportDaily]]
    trends: Optional[list[TrendMonth]]
    category_trend: Optional[CategoryTrend]
    breakdown: Optional[list[BreakdownRow]]
    fixed_variable: Optional[ReportFixedVariable]
    dow: Optional[list[ReportDow]]
    weekly: Optional[list[ReportWeek]]
    top: Optional[list[TopTransaction]]
    frequent: Optional[list[FrequentMerchant]]
    budgets: Optional[list[BudgetGauge]]
    ytd: Optional[YearlySummary]
