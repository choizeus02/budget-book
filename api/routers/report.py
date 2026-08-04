import asyncio
import calendar
import logging
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionLocal, get_db
from models import Budget, Installment, MonthlyReview, Subscription, Transaction, TransactionType
from routers.stats import yearly_stats
from schemas import TopTransaction
from schemas_report import (
    BreakdownRow, BreakdownSub, BudgetGauge, CategoryTrend, FixedItem,
    FixedItemChange, FrequentMerchant, Insight, MonthlyReviewResponse,
    ReportDaily, ReportDow, ReportFixedVariable, ReportPace, ReportResponse,
    ReportSummary, ReportWeek, SummaryBlock, TrendMonth,
)
from services.insights import InsightInput, build_insights, compute_pace, month_progress
from services.llm import generate_monthly_review
from services.spending import excluded_category_names, not_excluded, only_excluded

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/report", tags=["report"])


# --- 날짜 헬퍼 ---

def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start, end


def _prev_ym(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _shift_ym(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


# --- 공통 쿼리 ---

async def _month_sums(db: AsyncSession, year: int, month: int) -> tuple[float, float, float]:
    """(income, expense, invested) — expense/invested는 양수."""
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    result = await db.execute(
        select(bucket, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(bucket)
    )
    sums = {b: float(t or 0) for b, t in result.all()}
    return sums.get("income", 0.0), abs(sums.get("expense", 0.0)), abs(sums.get("invested", 0.0))


def _savings_rate(income: float, expense: float) -> float | None:
    return (income - expense) / income if income > 0 else None


async def _day_totals(db: AsyncSession, year: int, month: int) -> dict[int, float]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(extract("day", Transaction.date).label("day"), func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(extract("day", Transaction.date))
    )
    return {int(d): abs(float(t or 0)) for d, t in result.all()}


async def _fixed_total(db: AsyncSession, year: int, month: int, excluded: list[str]) -> float:
    start, end = _month_bounds(year, month)
    total = (await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.date >= start, Transaction.date < end,
            Transaction.type == TransactionType.expense,
            not_excluded(excluded),
            or_(Transaction.subscription_id.is_not(None), Transaction.installment_id.is_not(None)),
        )
    )).scalar()
    return abs(float(total or 0))


# --- 섹션 함수 (각자 자기 세션으로 실행됨) ---

async def _summary(db: AsyncSession, year: int, month: int) -> ReportSummary:
    income, expense, invested = await _month_sums(db, year, month)
    py, pm = _prev_ym(year, month)
    p_income, p_expense, p_invested = await _month_sums(db, py, pm)
    return ReportSummary(
        income=income, expense=expense, invested=invested,
        net=income - expense - invested,
        savings_rate=_savings_rate(income, expense),
        prev=SummaryBlock(income=p_income, expense=p_expense, invested=p_invested,
                          net=p_income - p_expense - p_invested,
                          savings_rate=_savings_rate(p_income, p_expense)),
    )


async def _daily(db: AsyncSession, year: int, month: int) -> list[ReportDaily]:
    cur = await _day_totals(db, year, month)
    py, pm = _prev_ym(year, month)
    prev = await _day_totals(db, py, pm)
    last_day = calendar.monthrange(year, month)[1]
    prev_last = calendar.monthrange(py, pm)[1]
    out, cum, pcum = [], 0.0, 0.0
    for day in range(1, last_day + 1):
        cum += cur.get(day, 0.0)
        pc = None
        if day <= prev_last:
            pcum += prev.get(day, 0.0)
            pc = pcum
        out.append(ReportDaily(day=day, total=cur.get(day, 0.0), cumulative=cum, prev_cumulative=pc))
    return out


async def _trends(db: AsyncSession, year: int, month: int) -> list[TrendMonth]:
    sy, sm = _shift_ym(year, month, -11)
    start = _month_bounds(sy, sm)[0]
    end = _month_bounds(year, month)[1]
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            bucket,
            func.sum(Transaction.amount),
        )
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date), bucket)
    )
    data: dict[tuple[int, int], dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0, "invested": 0.0})
    for y, m, b, total in result.all():
        key = (int(y), int(m))
        if b == "income":
            data[key]["income"] += float(total or 0)
        else:
            data[key][b] += abs(float(total or 0))
    out = []
    for i in range(-11, 1):
        y, m = _shift_ym(year, month, i)
        d = data.get((y, m), {"income": 0.0, "expense": 0.0, "invested": 0.0})
        out.append(TrendMonth(year=y, month=m, income=d["income"], expense=d["expense"],
                              invested=d["invested"],
                              net=d["income"] - d["expense"] - d["invested"],
                              savings_rate=_savings_rate(d["income"], d["expense"])))
    return out


async def _category_trend(db: AsyncSession, year: int, month: int) -> CategoryTrend:
    sy, sm = _shift_ym(year, month, -11)
    start = _month_bounds(sy, sm)[0]
    end = _month_bounds(year, month)[1]
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            Transaction.category,
            func.sum(Transaction.amount),
        )
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date), Transaction.category)
    )
    totals: dict[str, float] = defaultdict(float)
    monthly: dict[tuple[int, int], dict[str, float]] = defaultdict(dict)
    for y, m, cat, total in result.all():
        name = cat or "기타"
        amt = abs(float(total or 0))
        totals[name] += amt
        monthly[(int(y), int(m))][name] = monthly[(int(y), int(m))].get(name, 0.0) + amt
    top5 = [c for c, _ in sorted(totals.items(), key=lambda x: -x[1])[:5]]
    series = []
    for i in range(-11, 1):
        y, m = _shift_ym(year, month, i)
        row: dict = {"ym": f"{y}-{m:02d}"}
        for c in top5:
            row[c] = monthly.get((y, m), {}).get(c, 0.0)
        series.append(row)
    return CategoryTrend(categories=top5, series=series)


async def _breakdown(db: AsyncSession, year: int, month: int) -> list[BreakdownRow]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(Transaction.category, Transaction.subcategory,
               func.sum(Transaction.amount), func.count(Transaction.id))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(Transaction.category, Transaction.subcategory)
    )
    cat_map: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "subs": []})
    for cat, sub, total, count in result.all():
        key = cat or "기타"
        amt = abs(float(total or 0))
        cat_map[key]["total"] += amt
        cat_map[key]["subs"].append(BreakdownSub(subcategory=sub or "기타", total=amt, count=count))

    py, pm = _prev_ym(year, month)
    pstart, pend = _month_bounds(py, pm)
    prev_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount))
        .where(Transaction.date >= pstart, Transaction.date < pend,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(Transaction.category)
    )
    prev_map = {(cat or "기타"): abs(float(t or 0)) for cat, t in prev_result.all()}

    budget_result = await db.execute(select(Budget))
    budget_map = {b.category: float(b.monthly_amount) for b in budget_result.scalars().all()}

    grand = sum(v["total"] for v in cat_map.values())
    rows = []
    for key, v in sorted(cat_map.items(), key=lambda x: -x[1]["total"]):
        prev_total = prev_map.get(key, 0.0)
        budget = budget_map.get(key)
        rows.append(BreakdownRow(
            category=key, total=v["total"],
            ratio=v["total"] / grand if grand > 0 else 0.0,
            prev_total=prev_total,
            diff_pct=(v["total"] - prev_total) / prev_total * 100 if prev_total > 0 else None,
            budget=budget,
            budget_used=v["total"] / budget * 100 if budget else None,
            subcategories=sorted(v["subs"], key=lambda s: -s.total),
        ))
    return rows


async def _fixed_variable(db: AsyncSession, year: int, month: int) -> ReportFixedVariable:
    excluded = await excluded_category_names(db)
    _, expense, invested = await _month_sums(db, year, month)
    fixed = await _fixed_total(db, year, month, excluded)
    variable = max(expense - fixed, 0.0)
    grand = fixed + variable + invested

    py, pm = _prev_ym(year, month)
    prev_fixed = await _fixed_total(db, py, pm, excluded)

    # 직전 3개월 변동비 평균 (지출이 없는 달은 표본에서 제외)
    prev_vars = []
    for delta in (-3, -2, -1):
        yy, mm = _shift_ym(year, month, delta)
        _, e, _ = await _month_sums(db, yy, mm)
        if e > 0:
            f = await _fixed_total(db, yy, mm, excluded)
            prev_vars.append(max(e - f, 0.0))
    variable_3mo_avg = sum(prev_vars) / len(prev_vars) if prev_vars else None

    async def _items_for(y_: int, m_: int) -> dict[str, float]:
        s_, e_ = _month_bounds(y_, m_)
        out: dict[str, float] = {}
        sub_rows = await db.execute(
            select(Subscription.name, func.sum(Transaction.amount))
            .join(Subscription, Transaction.subscription_id == Subscription.id)
            .where(Transaction.date >= s_, Transaction.date < e_,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded))
            .group_by(Subscription.name)
        )
        for n, t in sub_rows.all():
            out[f"subscription:{n}"] = abs(float(t or 0))
        inst_rows = await db.execute(
            select(Installment.name, func.sum(Transaction.amount))
            .join(Installment, Transaction.installment_id == Installment.id)
            .where(Transaction.date >= s_, Transaction.date < e_,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded))
            .group_by(Installment.name)
        )
        for n, t in inst_rows.all():
            out[f"installment:{n}"] = abs(float(t or 0))
        return out

    cur_items = await _items_for(year, month)
    prev_items = await _items_for(py, pm)

    items = [FixedItem(name=k.split(":", 1)[1], amount=v, kind=k.split(":", 1)[0])
             for k, v in cur_items.items()]
    items.sort(key=lambda i: -i.amount)

    changes = [FixedItemChange(name=k.split(":", 1)[1], diff=cur_items.get(k, 0.0) - prev_items.get(k, 0.0))
               for k in set(cur_items) | set(prev_items)
               if abs(cur_items.get(k, 0.0) - prev_items.get(k, 0.0)) >= 1_000]
    changes.sort(key=lambda c: -abs(c.diff))

    return ReportFixedVariable(
        fixed_total=fixed, variable_total=variable, invested_total=invested,
        fixed_ratio=fixed / grand if grand > 0 else 0.0,
        variable_ratio=variable / grand if grand > 0 else 0.0,
        invested_ratio=invested / grand if grand > 0 else 0.0,
        prev_fixed_total=prev_fixed,
        variable_3mo_avg=variable_3mo_avg,
        fixed_changes=changes[:3],
        items=items,
    )


async def _dow(db: AsyncSession, year: int, month: int) -> list[ReportDow]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(extract("dow", Transaction.date).label("dow"),
               func.sum(Transaction.amount), func.count(Transaction.id))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(extract("dow", Transaction.date))
        .order_by(extract("dow", Transaction.date))
    )
    return [
        ReportDow(dow=int(d), total=abs(float(t or 0)), count=c,
                  avg=abs(float(t or 0)) / c if c else 0.0)
        for d, t, c in result.all()
    ]


async def _weekly(db: AsyncSession, year: int, month: int) -> list[ReportWeek]:
    totals = await _day_totals(db, year, month)
    weeks: dict[int, float] = defaultdict(float)
    for day, amt in totals.items():
        weeks[(day - 1) // 7 + 1] += amt
    last_week = (calendar.monthrange(year, month)[1] - 1) // 7 + 1
    return [ReportWeek(week=w, total=weeks.get(w, 0.0)) for w in range(1, last_week + 1)]


async def _top(db: AsyncSession, year: int, month: int) -> list[TopTransaction]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(Transaction)
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .order_by(Transaction.amount)   # 음수 → ASC가 큰 지출
        .limit(10)
    )
    return [
        TopTransaction(id=t.id, description=t.description, amount=abs(t.amount),
                       category=t.category, subcategory=t.subcategory, date=t.date)
        for t in result.scalars().all()
    ]


async def _frequent(db: AsyncSession, year: int, month: int) -> list[FrequentMerchant]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(Transaction.description, func.count(Transaction.id), func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded),
               Transaction.description != "")
        .group_by(Transaction.description)
        .having(func.count(Transaction.id) >= 2)
        .order_by(func.count(Transaction.id).desc())
        .limit(5)
    )
    return [FrequentMerchant(description=d, count=c, total=abs(float(t or 0)))
            for d, c, t in result.all()]


async def _budgets(db: AsyncSession, year: int, month: int) -> list[BudgetGauge]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    spent_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(Transaction.category)
    )
    spent_map = {(cat or "기타"): abs(float(t or 0)) for cat, t in spent_result.all()}
    budget_result = await db.execute(select(Budget).order_by(Budget.category))
    ideal = month_progress(year, month, date.today()) * 100
    out = []
    for b in budget_result.scalars().all():
        spent = spent_map.get(b.category, 0.0)
        budget = float(b.monthly_amount)
        out.append(BudgetGauge(category=b.category, budget=budget, spent=spent,
                               used_pct=spent / budget * 100 if budget > 0 else 0.0,
                               ideal_pct=ideal))
    return out


async def _ytd(db: AsyncSession, year: int, month: int):
    return await yearly_stats(year=year, db=db)


# --- 인사이트 (다른 섹션 결과 재활용 + 소규모 추가 쿼리) ---

async def _insights(year: int, month: int, summary, daily, trends, breakdown,
                    budgets, fixed_variable, top) -> list[Insight]:
    if summary is None:
        return []
    start, end = _month_bounds(year, month)
    py, pm = _prev_ym(year, month)
    pstart, pend = _month_bounds(py, pm)

    async with AsyncSessionLocal() as s:
        excluded = await excluded_category_names(s)
        known = (
            select(Transaction.description)
            .where(Transaction.date < start, Transaction.description != "")
            .distinct()
        )
        rows = (await s.execute(
            select(Transaction.description, func.sum(Transaction.amount))
            .where(Transaction.date >= start, Transaction.date < end,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded),
                   Transaction.description != "",
                   Transaction.description.not_in(known))
            .group_by(Transaction.description)
            .order_by(func.sum(Transaction.amount))
            .limit(3)
        )).all()
        new_merchants = [{"description": d, "total": abs(float(t or 0))} for d, t in rows]

        base = [Transaction.date >= start, Transaction.date < end,
                Transaction.type == TransactionType.expense, not_excluded(excluded)]
        expense_count = (await s.execute(select(func.count(Transaction.id)).where(*base))).scalar() or 0
        uncat_count = (await s.execute(
            select(func.count(Transaction.id)).where(*base, Transaction.category.is_(None))
        )).scalar() or 0

        prev_fixed = await _fixed_total(s, py, pm, excluded)

        prev_spend_days = (await s.execute(
            select(func.count(func.distinct(extract("day", Transaction.date))))
            .where(Transaction.date >= pstart, Transaction.date < pend,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded))
        )).scalar() or 0

    today = date.today()
    is_current = (today.year, today.month) == (year, month)
    elapsed = today.day if is_current else calendar.monthrange(year, month)[1]
    no_spend = sum(1 for d in (daily or []) if d.day <= elapsed and d.total == 0)
    prev_last = calendar.monthrange(py, pm)[1]
    prev_no_spend = prev_last - prev_spend_days

    inp = InsightInput(
        year=year, month=month, today=today,
        income=summary.income, expense=summary.expense, net=summary.net,
        prev_income=summary.prev.income, prev_expense=summary.prev.expense, prev_net=summary.prev.net,
        breakdown=[{"category": b.category, "total": b.total, "prev_total": b.prev_total}
                   for b in (breakdown or [])],
        budgets=[{"category": b.category, "budget": b.budget, "spent": b.spent,
                  "used_pct": b.used_pct, "ideal_pct": b.ideal_pct} for b in (budgets or [])],
        biggest_tx={"description": top[0].description, "amount": top[0].amount} if top else None,
        new_merchants=new_merchants,
        no_spend_days=no_spend, prev_no_spend_days=prev_no_spend,
        fixed_total=fixed_variable.fixed_total if fixed_variable else 0.0,
        prev_fixed_total=prev_fixed,
        uncategorized_ratio=uncat_count / expense_count if expense_count > 0 else 0.0,
        expense_count=expense_count,
        savings_rates_12m=[t.savings_rate for t in (trends or [])],
        invested=summary.invested,
        variable_total=fixed_variable.variable_total if fixed_variable else 0.0,
        variable_3mo_avg=fixed_variable.variable_3mo_avg if fixed_variable else None,
        fixed_changes=[{"name": c.name, "diff": c.diff}
                       for c in (fixed_variable.fixed_changes if fixed_variable else [])],
    )
    return [Insight(**i) for i in build_insights(inp)]


# --- 통합 빌드 + 엔드포인트 ---

async def _run_section(name: str, fn, year: int, month: int):
    """섹션마다 독립 세션으로 실행. 실패하면 None (전체 리포트는 생존)."""
    try:
        async with AsyncSessionLocal() as session:
            return await fn(session, year, month)
    except Exception:
        logger.warning(f"report section '{name}' failed", exc_info=True)
        return None


async def _build_report(year: int, month: int) -> ReportResponse:
    sections = {
        "summary": _summary, "daily": _daily, "trends": _trends,
        "category_trend": _category_trend, "breakdown": _breakdown,
        "fixed_variable": _fixed_variable, "dow": _dow, "weekly": _weekly,
        "top": _top, "frequent": _frequent, "budgets": _budgets, "ytd": _ytd,
    }
    results = await asyncio.gather(
        *(_run_section(name, fn, year, month) for name, fn in sections.items())
    )
    r = dict(zip(sections.keys(), results))

    pace = None
    if r["summary"] is not None:
        p = compute_pace(r["summary"].expense, year, month, date.today())
        py_avg = compute_pace(r["summary"].prev.expense, *_prev_ym(year, month), date.today())["daily_avg"]
        pace = ReportPace(**p, prev_daily_avg=py_avg)

    try:
        insights = await _insights(year, month, r["summary"], r["daily"], r["trends"],
                                   r["breakdown"], r["budgets"], r["fixed_variable"], r["top"])
    except Exception:
        logger.warning("report insights failed", exc_info=True)
        insights = None

    return ReportResponse(year=year, month=month, pace=pace, insights=insights, **r)


@router.get("", response_model=ReportResponse)
async def get_report(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12)):
    return await _build_report(year, month)


def _format_review_payload(r: ReportResponse) -> str:
    lines = [f"{r.year}년 {r.month}월 가계부"]
    s = r.summary
    lines.append(f"수입 {s.income:,.0f}원 / 지출 {s.expense:,.0f}원 / 저축·투자 {s.invested:,.0f}원 / 남은 돈 {s.net:,.0f}원"
                 + (f" (저축률 {s.savings_rate*100:.0f}%)" if s.savings_rate is not None else ""))
    lines.append(f"전월: 수입 {s.prev.income:,.0f}원 / 지출 {s.prev.expense:,.0f}원 / 저축·투자 {s.prev.invested:,.0f}원 / 남은 돈 {s.prev.net:,.0f}원")
    if r.breakdown:
        lines.append("카테고리별 지출: " + ", ".join(
            f"{b.category} {b.total:,.0f}원(전월 {b.prev_total:,.0f}원)" for b in r.breakdown[:8]))
    if r.budgets:
        lines.append("예산: " + ", ".join(
            f"{b.category} {b.spent:,.0f}/{b.budget:,.0f}원({b.used_pct:.0f}%)" for b in r.budgets))
    if r.fixed_variable:
        fv = r.fixed_variable
        lines.append(f"고정비 {fv.fixed_total:,.0f}원 / 변동비 {fv.variable_total:,.0f}원 / 저축·투자 {fv.invested_total:,.0f}원")
    if r.insights:
        lines.append("주요 관찰: " + " / ".join(i.message for i in r.insights[:6]))
    return "\n".join(lines)


@router.get("/review", response_model=MonthlyReviewResponse | None)
async def get_review(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlyReview).where(MonthlyReview.year == year, MonthlyReview.month == month)
    )
    return result.scalar_one_or_none()


@router.post("/review", response_model=MonthlyReviewResponse)
async def create_review(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), db: AsyncSession = Depends(get_db)):
    report = await _build_report(year, month)
    if report.summary is None or (report.summary.income == 0 and report.summary.expense == 0):
        raise HTTPException(status_code=400, detail="해당 월에 데이터가 없습니다")

    try:
        content = await generate_monthly_review(_format_review_payload(report))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"총평 생성 실패: {e}")

    result = await db.execute(
        select(MonthlyReview).where(MonthlyReview.year == year, MonthlyReview.month == month)
    )
    row = result.scalar_one_or_none()
    if row:
        row.content = content
        row.model = settings.review_model
        row.created_at = datetime.now()
    else:
        row = MonthlyReview(year=year, month=month, content=content, model=settings.review_model)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
