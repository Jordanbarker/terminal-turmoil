"""Generate NEXACORP_PROD.RAW_NEXACORP.DEPARTMENT_BUDGETS (~30 rows)."""

import random
from config import RANDOM_SEED

random.seed(RANDOM_SEED + 4)

# All budget rows are filler (red herring) — no narrative significance
DEPARTMENTS_WITH_BUDGETS = [
    (1, "Engineering"),
    (2, "Data Science"),
    (3, "Product"),
    (4, "Infrastructure"),
    (5, "Security"),
    (6, "HR"),
    (7, "QA"),
    (8, "Executive"),
    (9, "Training"),
]


def generate_department_budgets() -> list[dict]:
    """Generate department budget rows (normal business data, red herring)."""
    rows = []
    budget_id = 1

    for dept_id, dept_name in DEPARTMENTS_WITH_BUDGETS:
        # Q1 2024 budgets
        categories = _get_categories(dept_name)
        for category in categories:
            budget = _base_budget(dept_name, category)
            spent = int(budget * random.uniform(0.88, 0.98))
            rows.append({
                "BUDGET_ID": budget_id,
                "DEPARTMENT_ID": dept_id,
                "DEPARTMENT_NAME": dept_name,
                "FISCAL_YEAR": 2026,
                "FISCAL_QUARTER": 1,
                "BUDGET_AMOUNT": budget,
                "SPENT_AMOUNT": spent,
                "CATEGORY": category,
                "APPROVED_BY": "CEO" if dept_name == "Executive" else "CFO",
                "APPROVED_DATE": "2025-12-10" if dept_name == "Executive" else "2025-12-15",
            })
            budget_id += 1

        # Q2 2024 budgets (slightly higher, partially spent)
        if dept_name not in ("Executive", "Training"):
            main_category = categories[0]
            budget = int(_base_budget(dept_name, main_category) * 1.02)
            spent = int(budget * random.uniform(0.40, 0.55))
            rows.append({
                "BUDGET_ID": budget_id,
                "DEPARTMENT_ID": dept_id,
                "DEPARTMENT_NAME": dept_name,
                "FISCAL_YEAR": 2026,
                "FISCAL_QUARTER": 2,
                "BUDGET_AMOUNT": budget,
                "SPENT_AMOUNT": spent,
                "CATEGORY": main_category,
                "APPROVED_BY": "CFO",
                "APPROVED_DATE": "2025-12-20",
            })
            budget_id += 1

    return rows


def _get_categories(dept_name: str) -> list[str]:
    """Return budget categories for a department."""
    if dept_name == "Engineering":
        return ["Personnel", "Software"]
    if dept_name == "Data Science":
        return ["Personnel", "Infrastructure"]
    if dept_name == "Infrastructure":
        return ["Personnel", "Infrastructure"]
    if dept_name == "Training":
        return ["Training"]
    return ["Personnel"]


def _base_budget(dept_name: str, category: str) -> int:
    """Return base budget amount."""
    budgets = {
        ("Engineering", "Personnel"): 850000,
        ("Engineering", "Software"): 120000,
        ("Data Science", "Personnel"): 420000,
        ("Data Science", "Infrastructure"): 85000,
        ("Product", "Personnel"): 310000,
        ("Infrastructure", "Personnel"): 275000,
        ("Infrastructure", "Infrastructure"): 200000,
        ("Security", "Personnel"): 340000,
        ("HR", "Personnel"): 260000,
        ("QA", "Personnel"): 195000,
        ("Executive", "Personnel"): 500000,
        ("Training", "Training"): 75000,
    }
    return budgets.get((dept_name, category), 200000)


def get_budget_columns() -> list[dict]:
    return [
        {"name": "BUDGET_ID", "type": "NUMBER", "nullable": False, "primaryKey": True},
        {"name": "DEPARTMENT_ID", "type": "NUMBER", "nullable": False},
        {"name": "DEPARTMENT_NAME", "type": "VARCHAR", "nullable": False},
        {"name": "FISCAL_YEAR", "type": "NUMBER", "nullable": False},
        {"name": "FISCAL_QUARTER", "type": "NUMBER", "nullable": False},
        {"name": "BUDGET_AMOUNT", "type": "NUMBER", "nullable": False},
        {"name": "SPENT_AMOUNT", "type": "NUMBER", "nullable": True},
        {"name": "CATEGORY", "type": "VARCHAR", "nullable": False},
        {"name": "APPROVED_BY", "type": "VARCHAR", "nullable": True},
        {"name": "APPROVED_DATE", "type": "DATE", "nullable": True},
    ]
