from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from models import AccountType, TransactionType


# --- Account ---

class AccountCreate(BaseModel):
    name: str
    type: AccountType
    balance: int = 0
    color: str = "#6366f1"
    icon: str = "💳"


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    balance: int
    color: str
    icon: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Transaction ---

class TransactionCreate(BaseModel):
    account_id: Optional[int] = None
    amount: int
    description: str = ""
    type: TransactionType
    date: Optional[datetime] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    category_confirmed: Optional[bool] = None
    amount: Optional[int] = None
    date: Optional[datetime] = None
    account_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    account_id: Optional[int]
    installment_id: Optional[int]
    subscription_id: Optional[int]
    amount: int
    description: str
    category: Optional[str]
    subcategory: Optional[str]
    category_confirmed: bool
    type: TransactionType
    date: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Installment ---

class InstallmentCreate(BaseModel):
    name: str
    total_amount: int
    total_months: int
    annual_interest_rate: Optional[float] = None
    start_year: int
    start_month: int
    category: Optional[str] = None
    subcategory: Optional[str] = None


class InstallmentUpdate(BaseModel):
    name: Optional[str] = None
    total_amount: Optional[int] = None
    total_months: Optional[int] = None
    annual_interest_rate: Optional[float] = None
    start_year: Optional[int] = None
    start_month: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None


class InstallmentResponse(BaseModel):
    id: int
    name: str
    total_amount: int
    total_months: int
    annual_interest_rate: Optional[float]
    start_year: int
    start_month: int
    category: Optional[str]
    subcategory: Optional[str]
    monthly_amount: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Category ---

class SubcategoryItem(BaseModel):
    id: int
    name: str


class CategoryGroup(BaseModel):
    id: int
    name: str
    icon: str
    subcategories: list[SubcategoryItem]


class CategoryCreate(BaseModel):
    name: str
    icon: str = "📌"
    parent_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None


# --- Subscription ---

class SubscriptionCreate(BaseModel):
    name: str
    amount: int
    cycle: str = "monthly"
    billing_day: int = 1
    start_year: int
    start_month: int
    category: Optional[str] = None
    subcategory: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    cycle: Optional[str] = None
    billing_day: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    is_active: Optional[bool] = None


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    amount: int
    cycle: str
    billing_day: int
    category: Optional[str]
    subcategory: Optional[str]
    is_active: bool
    start_date: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Budget ---

class BudgetCreate(BaseModel):
    category: str
    monthly_amount: int


class BudgetResponse(BaseModel):
    id: int
    category: str
    monthly_amount: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Stats ---

class MonthlySummary(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
    total_invested: float
    net: float


class CategoryStat(BaseModel):
    category: str
    total: float
    count: int
    budget: Optional[float] = None


class SubcategoryStat(BaseModel):
    subcategory: str
    total: float
    count: int


class CategoryStatDetail(BaseModel):
    category: str
    total: float
    count: int
    budget: Optional[float] = None
    subcategories: list[SubcategoryStat]


# --- Monthly Report ---

class DailyStat(BaseModel):
    day: int
    total: float


class TopTransaction(BaseModel):
    id: int
    description: str
    amount: int
    category: Optional[str]
    subcategory: Optional[str]
    date: datetime


class FixedVsVariable(BaseModel):
    fixed_total: float
    variable_total: float
    fixed_ratio: float
    variable_ratio: float


class MonthlyEntry(BaseModel):
    month: int
    income: float
    expense: float
    invested: float


class YearlySummary(BaseModel):
    year: int
    total_income: float
    total_expense: float
    total_invested: float
    net: float
    savings_rate: Optional[float]
    months: list[MonthlyEntry]


class DowStat(BaseModel):
    dow: int      # PostgreSQL DOW: 0=일, 1=월, ..., 6=토
    total: float
    count: int


class UncategorizedStat(BaseModel):
    total_count: int
    uncategorized_count: int
    ratio: float
