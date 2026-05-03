from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from models import AccountType, TransactionType


# --- Account ---

class AccountCreate(BaseModel):
    name: str
    type: AccountType
    balance: float = 0.0
    color: str = "#6366f1"
    icon: str = "💳"


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    balance: float
    color: str
    icon: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Transaction ---

class TransactionCreate(BaseModel):
    account_id: Optional[int] = None
    amount: float
    description: str = ""
    type: TransactionType
    date: Optional[datetime] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    category_confirmed: Optional[bool] = None
    amount: Optional[float] = None
    date: Optional[datetime] = None
    account_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    account_id: Optional[int]
    installment_id: Optional[int]
    amount: float
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
    total_amount: float
    total_months: int
    annual_interest_rate: Optional[float] = None
    start_year: int
    start_month: int
    category: Optional[str] = None
    subcategory: Optional[str] = None


class InstallmentUpdate(BaseModel):
    name: Optional[str] = None
    total_amount: Optional[float] = None
    total_months: Optional[int] = None
    annual_interest_rate: Optional[float] = None
    start_year: Optional[int] = None
    start_month: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None


class InstallmentResponse(BaseModel):
    id: int
    name: str
    total_amount: float
    total_months: int
    annual_interest_rate: Optional[float]
    start_year: int
    start_month: int
    category: Optional[str]
    subcategory: Optional[str]
    monthly_amount: float
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Category ---

class CategoryGroup(BaseModel):
    name: str
    icon: str
    subcategories: list[str]


# --- Budget ---

class BudgetCreate(BaseModel):
    category: str
    monthly_amount: float


class BudgetResponse(BaseModel):
    id: int
    category: str
    monthly_amount: float
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Stats ---

class MonthlySummary(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
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
