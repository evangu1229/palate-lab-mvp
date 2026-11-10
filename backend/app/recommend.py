"""Deliberately ORIGINAL explanation-friendly demo recommendation heuristic.
NOT recovered from Beli (its server-side scoring is not available).
"""
from collections import defaultdict


def recommend(places: list[dict], ranks: list[dict], category: str | None = None,
              minimum_score: float = 0, hide_visited: bool = True) -> list[dict]:
    by_id = {p['id']: p for p in places}
    visited = {r['place_id'] for r in ranks}
    cuisine_preference = defaultdict(float)
    prices = []
    for r in ranks:
        p = by_id.get(r['place_id'])
        if not p:
            continue
        weight = {'liked': 1.25, 'fine': .1, 'disliked': -1.5}[r['sentiment']]
        for cuisine in p['cuisines']:
            cuisine_preference[cuisine] += weight
        if r['sentiment'] == 'liked':
            prices.append(p['price'])
    preferred_price = sum(prices)/len(prices) if prices else 2
    output = []
    for p in places:
        if category and category != 'All' and p['category'] != category:
            continue
        if hide_visited and p['id'] in visited:
            continue
        matched = sorted(((c, cuisine_preference[c]) for c in p['cuisines'] if cuisine_preference[c] > 0),
                         key=lambda row: row[1], reverse=True)
        opposing = sum(min(0, cuisine_preference[c]) for c in p['cuisines'])
        # Private Beli formula unknown; this is a separate, explainable local baseline.
        raw = 6.0 + (p['average_score'] - 7.0)*.45 + sum(min(1.8, w*.22) for _,w in matched[:2])
        raw += max(-1.2, opposing*.2)
        raw -= abs(p['price'] - preferred_price) * .18
        score = min(9.8, max(1.0, round(raw, 1)))
        if score < minimum_score:
            continue
        reasons = [f'선호한 {matched[0][0]} 계열' if matched else '새로운 취향 탐색',
                   f'커뮤니티 점수 {p["average_score"]:.1f}',
                   f'가격대 {"₩" * p["price"]}']
        output.append({**p, 'expected_percentile':score,
                       'score_source':'local_heuristic', 'reasons':reasons,
                       'is_ranked':p['id'] in visited})
    return sorted(output,key=lambda x:(-x['expected_percentile'],-x['average_score'],x['name']))
