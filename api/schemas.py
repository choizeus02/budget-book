from datetime import date, datetime
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
    date: date

    @field_validator("amount")
    @classmethod
    def amount_sign(cls, v, info):
        # expense는 항상 음수로 저장
        return v


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    category_confirmed: Optional[bool] = None
    amount: Optional[float] = None
    date: Optional[date] = None
    account_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    account_id: Optional[int]
    amount: float
    description: str
    category: Optional[str]
    category_confirmed: bool
    type: TransactionType
    date: date
    created_at: datetime

    model_config = {"from_attributes": True}


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
