from services.spending import not_excluded, only_excluded


def test_not_excluded_keeps_uncategorized():
    sql = str(not_excluded(["저축·투자"]))
    assert "transactions.category IS NULL" in sql
    assert "NOT IN" in sql


def test_only_excluded_matches_flagged():
    sql = str(only_excluded(["저축·투자"]))
    assert "transactions.category IN" in sql


def test_empty_excluded_list_is_passthrough():
    assert str(not_excluded([])) == "true"
    assert str(only_excluded([])) == "false"
