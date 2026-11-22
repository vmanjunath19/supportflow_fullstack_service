from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import re
from typing import Literal

ImpactLevel = Literal["High", "Medium", "Low"]
UrgencyLevel = Literal["High", "Medium", "Low"]
PriorityLevel = Literal["Low", "Medium", "High", "Urgent"]

PRIORITY_RANK: dict[PriorityLevel, int] = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Urgent": 4,
}

# ITIL Impact x Urgency -> Priority Matrix
IMPACT_URGENCY_MATRIX: dict[tuple[ImpactLevel, UrgencyLevel], PriorityLevel] = {
    ("High", "High"): "Urgent",
    ("High", "Medium"): "High",
    ("High", "Low"): "Medium",
    ("Medium", "High"): "High",
    ("Medium", "Medium"): "Medium",
    ("Medium", "Low"): "Low",
    ("Low", "High"): "Medium",
    ("Low", "Medium"): "Low",
    ("Low", "Low"): "Low",
}

# SLA Target Durations (Response & Resolution)
SLA_TARGETS: dict[PriorityLevel, dict[str, timedelta]] = {
    "Urgent": {"response": timedelta(minutes=15), "resolution": timedelta(hours=1)},
    "High": {"response": timedelta(minutes=30), "resolution": timedelta(hours=4)},
    "Medium": {"response": timedelta(hours=2), "resolution": timedelta(hours=24)},
    "Low": {"response": timedelta(hours=8), "resolution": timedelta(hours=72)},
}

# Category -> Default Support Team Name
CATEGORY_TEAM_MAP: dict[str, str] = {
    "Hardware": "IT Field Support",
    "Software": "Application Support",
    "Network": "Network Operations",
    "Access & IAM": "Identity & Security",
    "Database & Cloud": "Cloud & DevOps",
    "Other": "General Triage Desk",
}


@dataclass(frozen=True)
class KeywordRule:
    rule_id: str
    patterns: tuple[str, ...]
    impact: ImpactLevel
    urgency: UrgencyLevel
    team_override: str | None = None
    category_override: str | None = None


KEYWORD_RULES: tuple[KeywordRule, ...] = (
    KeywordRule(
        rule_id="KW-01-OUTAGE",
        patterns=(
            r"\boutage\b",
            r"\bprod(?:uction)?\s+down\b",
            r"\bsite\s+down\b",
            r"\bsystem\s+down\b",
            r"\bcomplete\s+failure\b",
            r"\b(?:p1|sev1)\b",
        ),
        impact="High",
        urgency="High",
    ),
    KeywordRule(
        rule_id="KW-02-PAYMENT",
        patterns=(
            r"\bpayment\s+down\b",
            r"\bcheckout\s+failing\b",
            r"\bbilling\s+down\b",
            r"\bpayment\s+gateway\b",
            r"\bstripe\s+error\b",
        ),
        impact="High",
        urgency="High",
        team_override="Cloud & DevOps",
    ),
    KeywordRule(
        rule_id="KW-03-SECURITY",
        patterns=(
            r"\bdata\s+breach\b",
            r"\bransomware\b",
            r"\bunauthorized\s+access\b",
            r"\bcompromised\b",
            r"\bddos\b",
            r"\bsecurity\s+incident\b",
        ),
        impact="High",
        urgency="High",
        team_override="Identity & Security",
        category_override="Access & IAM",
    ),
    KeywordRule(
        rule_id="KW-04-NETWORK",
        patterns=(
            r"\bvpn\s+down\b",
            r"\bpacket\s+loss\b",
            r"\bdns\s+failure\b",
            r"\bwan\s+outage\b",
            r"\bbgp\s+flap\b",
        ),
        impact="High",
        urgency="Medium",
        team_override="Network Operations",
        category_override="Network",
    ),
    KeywordRule(
        rule_id="KW-05-DEGRADATION",
        patterns=(
            r"\b50[0234]\b",
            r"\btimeout\b",
            r"\blatency\s+spike\b",
            r"\bdegraded\b",
        ),
        impact="Medium",
        urgency="High",
    ),
    KeywordRule(
        rule_id="KW-06-IAM-ACCESS",
        patterns=(
            r"\blocked\s+out\b",
            r"\bpassword\s+reset\b",
            r"\bmfa\s+reset\b",
            r"\bsso\s+login\b",
        ),
        impact="Low",
        urgency="High",
        team_override="Identity & Security",
        category_override="Access & IAM",
    ),
)

# Sentiment, Urgency & Blast-Radius Heuristics
URGENCY_CUE_PATTERNS: tuple[str, ...] = (
    r"\basap\b",
    r"\bimmediately\b",
    r"\burgent(?:ly)?\b",
    r"\bcritical\b",
    r"\bblocker\b",
    r"\bblock(?:ed|ing)\b",
    r"\bcompletely\s+unusable\b",
    r"\bdeadline\b",
    r"\bemergency\b",
)

BLAST_RADIUS_PATTERNS: tuple[str, ...] = (
    r"\ball\s+users\b",
    r"\bentire\s+(?:company|office|team|org)\b",
    r"\bcompany[- ]wide\b",
    r"\bcustomers\s+(?:affected|impacted|unable)\b",
    r"\brevenue\b",
    r"\bexecutive\b",
    r"\bceo\b",
)


@dataclass
class HeuristicSignals:
    urgency_score: int = 0
    impact_score: int = 0
    inferred_urgency: UrgencyLevel = "Low"
    inferred_impact: ImpactLevel = "Low"
    triggered_heuristics: list[str] = field(default_factory=list)


@dataclass
class ClassificationResult:
    effective_category: str
    effective_priority: PriorityLevel
    assigned_team_name: str
    sla_response_due_at: datetime
    sla_due_at: datetime
    escalated: bool
    heuristic_urgency_score: int = 0
    matched_rules: list[str] = field(default_factory=list)


def _higher_priority(p1: PriorityLevel, p2: PriorityLevel) -> PriorityLevel:
    return p1 if PRIORITY_RANK[p1] >= PRIORITY_RANK[p2] else p2


def evaluate_sentiment_and_urgency_heuristics(
    title: str,
    description: str,
) -> HeuristicSignals:
    """
    Computes deterministic NLP urgency and blast-radius impact scores from:
      - Urgency/distress lexicon (ASAP, blocker, unusable, emergency)
      - Blast-radius cues (all users, company-wide, customers affected, CEO)
      - Punctuation stress markers (multiple exclamation marks '!!')
      - Title uppercase shouting ratio (>= 45% uppercase letters on titles >= 8 chars)
    """
    signals = HeuristicSignals()
    corpus = f"{title}\n{description}".lower()

    urgency_hits = sum(1 for pat in URGENCY_CUE_PATTERNS if re.search(pat, corpus))
    if urgency_hits:
        signals.urgency_score += urgency_hits * 2
        signals.triggered_heuristics.append(f"heuristic:urgency_lexicon(x{urgency_hits})")

    blast_hits = sum(1 for pat in BLAST_RADIUS_PATTERNS if re.search(pat, corpus))
    if blast_hits:
        signals.impact_score += blast_hits * 2
        signals.triggered_heuristics.append(f"heuristic:blast_radius(x{blast_hits})")

    if re.search(r"!{2,}", f"{title} {description}"):
        signals.urgency_score += 1
        signals.triggered_heuristics.append("heuristic:exclamation_stress")

    letters = [ch for ch in title if ch.isalpha()]
    if len(letters) >= 8:
        upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
        if upper_ratio >= 0.45:
            signals.urgency_score += 2
            signals.triggered_heuristics.append("heuristic:uppercase_title_stress")

    if signals.urgency_score >= 3:
        signals.inferred_urgency = "High"
    elif signals.urgency_score >= 1:
        signals.inferred_urgency = "Medium"

    if signals.impact_score >= 3:
        signals.inferred_impact = "High"
    elif signals.impact_score >= 1:
        signals.inferred_impact = "Medium"

    return signals


def classify_incident(
    *,
    title: str,
    description: str,
    category: str,
    requested_priority: PriorityLevel = "Medium",
    impact: ImpactLevel | None = None,
    urgency: UrgencyLevel | None = None,
    now: datetime | None = None,
) -> ClassificationResult:
    """
    Deterministically classifies an incident using:
      1. Explicit Impact x Urgency matrix (when supplied)
      2. NLP sentiment, urgency & blast-radius heuristics
      3. Domain keyword signal rules (outage, payment, security, network, IAM, degradation)
      4. Non-downgrade priority floor (preserves higher requested_priority)
      5. High-impact Software -> Cloud & DevOps escalation override
      6. SLA response & resolution deadline calculation
    """
    ref_time = now or datetime.now(timezone.utc)
    corpus = f"{title}\n{description}".lower()

    effective_priority: PriorityLevel = requested_priority
    effective_category = category if category in CATEGORY_TEAM_MAP else "Other"
    team_override: str | None = None
    matched_rules: list[str] = []

    # 1. Explicit Impact x Urgency matrix
    if impact and urgency:
        matrix_priority = IMPACT_URGENCY_MATRIX[(impact, urgency)]
        effective_priority = _higher_priority(effective_priority, matrix_priority)
        matched_rules.append(f"matrix:{impact}x{urgency}->{matrix_priority}")

    # 2. NLP sentiment, urgency & blast-radius heuristics
    heuristics = evaluate_sentiment_and_urgency_heuristics(title, description)
    if heuristics.triggered_heuristics:
        heuristic_priority = IMPACT_URGENCY_MATRIX[
            (heuristics.inferred_impact, heuristics.inferred_urgency)
        ]
        effective_priority = _higher_priority(effective_priority, heuristic_priority)
        matched_rules.extend(heuristics.triggered_heuristics)

    # 3. Domain keyword rules
    for rule in KEYWORD_RULES:
        if any(re.search(pat, corpus) for pat in rule.patterns):
            kw_priority = IMPACT_URGENCY_MATRIX[(rule.impact, rule.urgency)]
            effective_priority = _higher_priority(effective_priority, kw_priority)
            matched_rules.append(rule.rule_id)
            if rule.category_override and (
                effective_category == "Other" or rule.rule_id == "KW-03-SECURITY"
            ):
                effective_category = rule.category_override
            if rule.team_override and (
                effective_category in {"Other", rule.category_override}
                or rule.rule_id == "KW-03-SECURITY"
            ):
                team_override = rule.team_override

    # 4. Target support team assignment
    if team_override:
        assigned_team = team_override
    elif effective_category == "Software" and effective_priority in {"High", "Urgent"}:
        assigned_team = "Cloud & DevOps"
        matched_rules.append("escalation:high_impact_software->Cloud & DevOps")
    else:
        assigned_team = CATEGORY_TEAM_MAP.get(effective_category, "General Triage Desk")
        matched_rules.append(f"category_default:{effective_category}")

    # 5. SLA deadlines
    sla_window = SLA_TARGETS[effective_priority]
    escalated = PRIORITY_RANK[effective_priority] > PRIORITY_RANK[requested_priority]

    return ClassificationResult(
        effective_category=effective_category,
        effective_priority=effective_priority,
        assigned_team_name=assigned_team,
        sla_response_due_at=ref_time + sla_window["response"],
        sla_due_at=ref_time + sla_window["resolution"],
        escalated=escalated,
        heuristic_urgency_score=heuristics.urgency_score,
        matched_rules=matched_rules,
    )