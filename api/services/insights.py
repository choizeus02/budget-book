"""리포트 인사이트/페이스 계산 — DB 접근 없는 순수 함수 (단위 테스트 대상)."""
import calendar
from dataclasses import dataclass
from datetime import date

SURGE_PCT = 0.30          # 전월비 ±30% 이상
SURGE_MIN = 50_000        # 그리고 변화액 5만원 이상
BUDGET_FAST_MARGIN = 15   # 이상적 소진률보다 15%p 이상 빠르면 경고
BUDGET_FAST_FLOOR = 70    # 단, 소진률 70% 이상일 때만
NEW_MERCHANT_MIN = 30_000
FIXED_CHANGE_MIN = 10_000
UNCAT_RATIO = 0.20
UNCAT_MIN_COUNT = 5
VARIABLE_PACE_PCT = 0.10       # 3개월 평균 페이스 대비 ±10% 이상
VARIABLE_MIN_PROGRESS = 0.3    # 월 진행률 30% 이후에만 (월초 노이즈 방지)


def _fmt(n: float) -> str:
    return f"{round(n):,}"


def month_progress(year: int, month: int, today: date) -> float:
    """해당 월의 진행률 0~1. 과거 달=1, 미래 달=0."""
    if (year, month) < (today.year, today.month):
        return 1.0
    if (year, month) > (today.year, today.month):
        return 0.0
    return today.day / calendar.monthrange(year, month)[1]


def compute_pace(expense: float, year: int, month: int, today: date) -> dict:
    """월말 예상 지출. 이번 달이면 경과일 기준 프로젝션, 과거 달이면 일평균만."""
    last_day = calendar.monthrange(year, month)[1]
    is_current = (today.year, today.month) == (year, month)
    elapsed = today.day if is_current else last_day
    daily_avg = expense / elapsed if elapsed > 0 else 0.0
    projected = daily_avg * last_day if is_current else None
    return {"spent_so_far": expense, "projected": projected, "daily_avg": daily_avg}


@dataclass
class InsightInput:
    year: int
    month: int
    today: date
    income: float
    expense: float
    net: float
    prev_income: float
    prev_expense: float
    prev_net: float
    breakdown: list          # [{category, total, prev_total}]
    budgets: list            # [{category, budget, spent, used_pct, ideal_pct}]
    biggest_tx: dict | None  # {description, amount}
    new_merchants: list      # [{description, total}]
    no_spend_days: int
    prev_no_spend_days: int
    fixed_total: float
    prev_fixed_total: float
    uncategorized_ratio: float
    expense_count: int
    savings_rates_12m: list  # 이번 달이 마지막 원소. None 포함 가능
    invested: float          # 이번 달 저축·투자 이체액 (양수)
    variable_total: float
    variable_3mo_avg: float | None
    fixed_changes: list      # [{name, diff}] — |diff| 큰 순


def build_insights(d: InsightInput) -> list[dict]:
    out: list[dict] = []

    def add(type_: str, severity: str, message: str):
        out.append({"type": type_, "severity": severity, "message": message})

    # 1. 카테고리 급증/급감
    for row in d.breakdown:
        prev = row.get("prev_total") or 0
        if prev <= 0:
            continue
        diff = row["total"] - prev
        if abs(diff) >= SURGE_MIN and abs(diff) / prev >= SURGE_PCT:
            pct = round(diff / prev * 100)
            if diff > 0:
                add("category_surge", "warn",
                    f"{row['category']} 지출이 전월 대비 {pct}% 증가했어요 ({_fmt(prev)}원 → {_fmt(row['total'])}원)")
            else:
                add("category_drop", "good",
                    f"{row['category']} 지출이 전월 대비 {abs(pct)}% 감소했어요 ({_fmt(prev)}원 → {_fmt(row['total'])}원)")

    # 2. 예산 초과 / 소진 페이스
    for b in d.budgets:
        if b["used_pct"] >= 100:
            add("budget_over", "warn",
                f"{b['category']} 예산을 초과했어요 ({_fmt(b['spent'])}원 / {_fmt(b['budget'])}원)")
        elif b["used_pct"] >= BUDGET_FAST_FLOOR and b["used_pct"] - b["ideal_pct"] >= BUDGET_FAST_MARGIN:
            add("budget_fast", "warn",
                f"{b['category']} 예산 소진이 빨라요 — 이미 {round(b['used_pct'])}% 사용 (월 진행률 {round(b['ideal_pct'])}%)")

    # 3. 최대 단건 지출
    if d.biggest_tx and d.biggest_tx.get("amount", 0) > 0:
        add("biggest_tx", "info",
            f"이번 달 최대 지출: {d.biggest_tx['description']} {_fmt(d.biggest_tx['amount'])}원")

    # 4. 신규 지출처
    for m in d.new_merchants:
        if m["total"] >= NEW_MERCHANT_MIN:
            add("new_merchant", "info",
                f"새로 등장한 지출처: {m['description']} ({_fmt(m['total'])}원)")

    # 5. 무지출일
    if d.no_spend_days > d.prev_no_spend_days:
        add("no_spend_days", "good",
            f"무지출일이 늘었어요 — 이번 달 {d.no_spend_days}일 (전월 {d.prev_no_spend_days}일)")

    # 6. 고정비 변화 (주원인 항목 포함)
    fixed_diff = d.fixed_total - d.prev_fixed_total
    if abs(fixed_diff) >= FIXED_CHANGE_MIN:
        cause = ""
        if d.fixed_changes:
            top = d.fixed_changes[0]
            sign = "+" if top["diff"] > 0 else "−"
            cause = f" — 주원인: {top['name']} {sign}{_fmt(abs(top['diff']))}원"
        if fixed_diff > 0:
            add("fixed_change", "warn",
                f"고정비(구독·할부)가 전월보다 {_fmt(fixed_diff)}원 늘었어요{cause}")
        else:
            add("fixed_change", "good",
                f"고정비(구독·할부)가 전월보다 {_fmt(abs(fixed_diff))}원 줄었어요{cause}")

    # 6-2. 변동비 페이스 (최근 3개월 평균을 월 진행률로 보정해서 비교)
    progress = month_progress(d.year, d.month, d.today)
    if d.variable_3mo_avg and d.variable_3mo_avg > 0 and progress >= VARIABLE_MIN_PROGRESS:
        expected = d.variable_3mo_avg * progress
        diff_ratio = (d.variable_total - expected) / expected
        if abs(diff_ratio) >= VARIABLE_PACE_PCT:
            pct = round(abs(diff_ratio) * 100)
            if diff_ratio > 0:
                add("variable_pace", "warn",
                    f"변동비가 최근 3개월 페이스보다 {pct}% 많아요 (기대 {_fmt(expected)}원 → 현재 {_fmt(d.variable_total)}원)")
            else:
                add("variable_pace", "good",
                    f"변동비가 최근 3개월 페이스보다 {pct}% 적어요 (기대 {_fmt(expected)}원 → 현재 {_fmt(d.variable_total)}원)")

    # 6-3. 저축·투자
    if d.income > 0 and d.invested > 0:
        add("invested", "good",
            f"수입의 {round(d.invested / d.income * 100)}%를 저축·투자로 옮겼어요 ({_fmt(d.invested)}원)")

    # 7. 미분류 경고
    if d.uncategorized_ratio >= UNCAT_RATIO and d.expense_count >= UNCAT_MIN_COUNT:
        add("uncategorized", "warn",
            f"지출의 {round(d.uncategorized_ratio * 100)}%가 미분류 상태예요 — 카테고리를 정리해보세요")

    # 8. 저축률 이벤트
    if d.net > 0 and d.prev_net <= 0 and (d.prev_income > 0 or d.prev_expense > 0):
        add("savings_turnaround", "good",
            f"흑자 전환! 이번 달 순저축 +{_fmt(d.net)}원 (전월 {_fmt(d.prev_net)}원)")
    rates = [r for r in d.savings_rates_12m if r is not None]
    if d.income > 0 and len(rates) >= 2:
        cur = rates[-1]
        if cur > 0 and cur >= max(rates):
            add("savings_record", "good",
                f"최근 12개월 중 최고 저축률이에요 ({round(cur * 100)}%)")

    return out
