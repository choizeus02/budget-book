import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, Float,
    ForeignKey, Integer, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class AccountType(str, enum.Enum):
    cash = "cash"
    checking = "checking"
    savings = "savings"
    credit = "credit"


class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    icon: Mapped[str] = mapped_column(String(10), nullable=False, default="📌")
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False)
    balance: Mapped[float] = mapped_column(Float, default=0.0)
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    icon: Mapped[str] = mapped_column(String(50), default="💳")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)  # 양수=수입, 음수=지출
    description: Mapped[str] = mapped_column(String(500), default="")
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    installment_id: Mapped[int | None] = mapped_column(ForeignKey("installments.id", ondelete="CASCADE"), nullable=True)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    account: Mapped["Account | None"] = relationship(back_populates="transactions")
    installment: Mapped["Installment | None"] = relationship(back_populates="transactions")


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    monthly_amount: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    total_months: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_interest_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    start_month: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="installment", cascade="all, delete-orphan"
    )


class CategoryCache(Base):
    __tablename__ = "category_cache"

    description_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(50), nullable=True)
    count: Mapped[int] = mapped_column(Integer, default=1)
    last_used: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
