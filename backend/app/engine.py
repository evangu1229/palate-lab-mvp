"""Standalone ranking mechanics inspired by *observed* client behavior.
No first-party Beli code, credentials, endpoints, or private model is used.
"""
from __future__ import annotations
from typing import Any

SENTIMENTS = ('liked', 'fine', 'disliked')
BASE = {'liked': 10.0, 'fine': 6.7, 'disliked': 3.4}
BOUNDS = {'liked': (2.0, 3.0), 'fine': (1.0, 2.0), 'disliked': (0.0, 1.0)}
CATEGORIES = ('Restaurants', 'Bars', 'Coffee & Tea', 'Bakeries', 'Ice Cream & Dessert')


def personal_score(position: int, count: int, sentiment: str) -> float:
    if sentiment not in BASE or count < 1 or not 1 <= position <= count:
        raise ValueError('invalid rank position')
    return round(BASE[sentiment] - 3.3 / count * (position - 1), 3)


def similarity(new: dict[str, Any], existing: dict[str, Any]) -> float:
    score = 0.0
    if new.get('city') and new.get('city') == existing.get('city'):
        score += 1.0
    if new.get('price') and existing.get('price'):
        score -= abs(new['price'] - existing['price'])
    else:
        score -= 1.0
    score += len(set(new.get('cuisines') or []) & set(existing.get('cuisines') or []))
    score += .25 * len(set(new.get('tags') or []) & set(existing.get('tags') or []))
    score += 1.5 * len(set(new.get('custom_tags') or []) & set(existing.get('custom_tags') or []))
    return score


def choose_pivot(new: dict, candidates: list[dict]) -> dict | None:
    """Highest-similarity candidate, median of tied candidates (sorted by rank)."""
    if not candidates:
        return None
    scored = [(similarity(new, candidate), candidate) for candidate in candidates]
    best = max(score for score, _ in scored)
    ties = [candidate for score, candidate in scored if score == best]
    return ties[(len(ties) - 1) // 2]


def value_for_insert(existing: list[dict], position: int, sentiment: str) -> float:
    low, high = BOUNDS[sentiment]
    upper = float(existing[position - 1]['value']) if position > 0 else high
    lower = float(existing[position]['value']) if position < len(existing) else low
    if upper <= lower:
        # Numeric precision exhaustion: rebalance values in persistence layer.
        raise ValueError('Insufficient spacing between rank values')
    return (upper + lower) / 2


def k_way_merge(entries: list[dict], category_order: tuple[str, ...] = CATEGORIES) -> list[dict]:
    """Within-category value ordering; select highest scored category head.
    On ties, the first category in category_order wins.
    """
    queues = {cat: sorted((e for e in entries if e['category'] == cat),
                          key=lambda e: e['value'], reverse=True) for cat in category_order}
    pointers = {cat: 0 for cat in category_order}
    output = []
    while True:
        active = [cat for cat in category_order if pointers[cat] < len(queues[cat])]
        if not active:
            return output
        choice = max(active, key=lambda cat: queues[cat][pointers[cat]].get('score')
                     if queues[cat][pointers[cat]].get('score') is not None else -1)
        output.append(queues[choice][pointers[choice]])
        pointers[choice] += 1


def score_rank_entries(entries: list[dict]) -> list[dict]:
    result = [dict(e) for e in entries]
    for category in CATEGORIES:
        for sentiment in SENTIMENTS:
            group = sorted((e for e in result if e['category'] == category and e['sentiment'] == sentiment),
                           key=lambda e: e['value'], reverse=True)
            for pos, e in enumerate(group, 1):
                e['score'] = personal_score(pos, len(group), sentiment)
                e['category_position'] = None  # filled below
    for category in CATEGORIES:
        ordered = sorted((e for e in result if e['category'] == category),
                         key=lambda e: e['value'], reverse=True)
        for pos, e in enumerate(ordered, 1):
            e['category_position'] = pos
    return result
