from datetime import date

from services.insights import InsightInput, build_insights, compute_pace, month_progress


def base_input(**over):
    d = dict(
        year=2026, month=7, today=date(2026, 7, 15),
        income=3_000_000, expense=1_500_000, net=1_500_000,
        prev_income=3_000_000, prev_expense=1_500_000, prev_net=1_500_000,
        breakdown=[], budgets=[], biggest_tx=None, new_merchants=[],
        no_spend_days=3, prev_no_spend_days=3,
        fixed_total=100_000, prev_fixed_total=100_000,
        uncategorized_ratio=0.0, expense_count=20,
        savings_rates_12m=[],
    )
    d.update(over)
    return InsightInput(**d)


def types_of(insights):
    return [i["type"] for i in insights]


# --- pace ---

def test_pace_current_month_projects_to_month_end():
    # 7/15까지 50만원 → 하루 평균 33,333 × 31일 ≈ 1,033,333
    p = compute_pace(500_000, 2026, 7, today=date(2026, 7, 15))
    assert p["spent_so_far"] == 500_000
    assert round(p["projected"]) == round(500_000 / 15 * 31)
    assert round(p["daily_avg"]) == round(500_000 / 15)


def test_pace_past_month_has_no_projection():
    p = compute_pace(930_000, 2026, 6, today=date(2026, 7, 15))
    assert p["projected"] is None
    assert p["daily_avg"] == 930_000 / 30


def test_month_progress():
    assert month_progress(2026, 7, date(2026, 7, 15)) == 15 / 31
    assert month_progress(2026, 6, date(2026, 7, 15)) == 1.0   # 과거 달
    assert month_progress(2026, 8, date(2026, 7, 15)) == 0.0   # 미래 달


# --- 인사이트 규칙 ---

def test_category_surge_triggers_warn():
    d = base_input(breakdown=[{"category": "먹거리", "total": 400_000, "prev_total": 250_000}])
    ins = build_insights(d)
    surge = [i for i in ins if i["type"] == "category_surge"]
    assert len(surge) == 1 and surge[0]["severity"] == "warn"
    assert "먹거리" in surge[0]["message"]


def test_category_small_change_no_insight():
    # 변화율 30% 미만 → 없음
    d = base_input(breakdown=[{"category": "먹거리", "total": 120_000, "prev_total": 100_000}])
    assert "category_surge" not in types_of(build_insights(d))
    # 금액 5만원 미만 → 없음 (비율은 100%지만)
    d = base_input(breakdown=[{"category": "커피", "total": 40_000, "prev_total": 20_000}])
    assert "category_surge" not in types_of(build_insights(d))


def test_category_drop_is_good():
    d = base_input(breakdown=[{"category": "쇼핑", "total": 100_000, "prev_total": 300_000}])
    drop = [i for i in build_insights(d) if i["type"] == "category_drop"]
    assert len(drop) == 1 and drop[0]["severity"] == "good"


def test_budget_over_and_fast_pace():
    d = base_input(budgets=[
        {"category": "먹거리", "budget": 300_000, "spent": 330_000, "used_pct": 110.0, "ideal_pct": 48.4},
        {"category": "교통", "budget": 100_000, "spent": 80_000, "used_pct": 80.0, "ideal_pct": 48.4},
        {"category": "취미", "budget": 100_000, "spent": 40_000, "used_pct": 40.0, "ideal_pct": 48.4},
    ])
    ins = build_insights(d)
    assert any(i["type"] == "budget_over" and "먹거리" in i["message"] for i in ins)
    assert any(i["type"] == "budget_fast" and "교통" in i["message"] for i in ins)
    assert not any("취미" in i["message"] for i in ins)


def test_biggest_tx_info():
    d = base_input(biggest_tx={"description": "노트북", "amount": 1_000_000})
    ins = [i for i in build_insights(d) if i["type"] == "biggest_tx"]
    assert len(ins) == 1 and "노트북" in ins[0]["message"]


def test_new_merchant():
    d = base_input(new_merchants=[{"description": "새헬스장", "total": 90_000}])
    assert any(i["type"] == "new_merchant" and "새헬스장" in i["message"] for i in build_insights(d))
    # 3만원 미만은 제외
    d = base_input(new_merchants=[{"description": "소액가게", "total": 10_000}])
    assert "new_merchant" not in types_of(build_insights(d))


def test_no_spend_days_improved():
    d = base_input(no_spend_days=8, prev_no_spend_days=3)
    ins = [i for i in build_insights(d) if i["type"] == "no_spend_days"]
    assert len(ins) == 1 and ins[0]["severity"] == "good"


def test_fixed_cost_change():
    d = base_input(fixed_total=150_000, prev_fixed_total=100_000)
    ins = [i for i in build_insights(d) if i["type"] == "fixed_change"]
    assert len(ins) == 1 and ins[0]["severity"] == "warn"
    d = base_input(fixed_total=80_000, prev_fixed_total=100_000)
    ins = [i for i in build_insights(d) if i["type"] == "fixed_change"]
    assert len(ins) == 1 and ins[0]["severity"] == "good"
    d = base_input(fixed_total=105_000, prev_fixed_total=100_000)  # 1만원 미만 변화
    assert "fixed_change" not in types_of(build_insights(d))


def test_uncategorized_warn():
    d = base_input(uncategorized_ratio=0.3, expense_count=10)
    assert "uncategorized" in types_of(build_insights(d))
    d = base_input(uncategorized_ratio=0.3, expense_count=3)  # 건수 부족
    assert "uncategorized" not in types_of(build_insights(d))


def test_savings_turnaround_and_record():
    d = base_input(net=200_000, prev_net=-50_000)
    assert any(i["type"] == "savings_turnaround" for i in build_insights(d))
    d = base_input(savings_rates_12m=[0.1, 0.2, 0.15, 0.5], income=3_000_000, expense=1_500_000)
    assert any(i["type"] == "savings_record" for i in build_insights(d))
