"""Shared constants for data generation."""

PLAYER_USERNAME = "ren"

# Departments used across NexaCorp
DEPARTMENTS = [
    "Engineering",
    "Operations",
    "Sales",
    "Marketing",
    "People & Culture",
    "Product",
    "Executive",
]

# Date range for events, access logs, etc.
DATA_START_DATE = "2026-02-01"
DATA_END_DATE = "2026-02-23"

# Fiscal periods for budget data
FISCAL_YEARS = [2026]
FISCAL_QUARTERS = [1, 2]

# Budget categories
BUDGET_CATEGORIES = ["Personnel", "Software", "Infrastructure", "Training"]

# Fixed seed for deterministic output
RANDOM_SEED = 42
