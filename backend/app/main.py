from __future__ import annotations
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from . import db as store
from .engine import CATEGORIES, SENTIMENTS, choose_pivot, k_way_merge, score_rank_entries, value_for_insert
from .recommend import recommend

@asynccontextmanager
async def lifespan(app: FastAPI):
    store.initialize()
    yield

app = FastAPI(title='Palate Lab API', version='0.1.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('PALATE_ORIGINS','http://localhost:3000,http://127.0.0.1:3000').split(','),
                   allow_credentials=True, allow_methods=['GET','POST','DELETE'], allow_headers=['Content-Type'])


def load_places(conn):
    return [{**dict(r), 'cuisines':json.loads(r['cuisines'])} for r in conn.execute('SELECT * FROM places')]

def load_ranks(conn):
    return [dict(r) for r in conn.execute('SELECT * FROM ranks')]

def get_place(conn, place_id:int):
    p = conn.execute('SELECT * FROM places WHERE id=?',(place_id,)).fetchone()
    if not p:
        raise HTTPException(404,'Place not found')
    return {**dict(p),'cuisines':json.loads(p['cuisines'])}

def existing_group(conn, category, sentiment):
    rows = conn.execute('SELECT p.*, r.value FROM ranks r JOIN places p ON p.id=r.place_id '
                        'WHERE r.category=? AND r.sentiment=? ORDER BY r.value DESC',
                        (category,sentiment)).fetchall()
    return [{**dict(r),'cuisines':json.loads(r['cuisines'])} for r in rows]

def decorate(conn):
    places=load_places(conn)
    ranked=score_rank_entries(load_ranks(conn))
    ranks_by_id={r['place_id']:r for r in ranked}
    marked={r['place_id'] for r in conn.execute('SELECT place_id FROM bookmarks')}
    output=[]
    for p in places:
        r=ranks_by_id.get(p['id'])
        output.append({**p,'bookmarked':p['id'] in marked,'rank':r})
    return output,ranked

@app.get('/', include_in_schema=False)
def quick_demo():
    return FileResponse(Path(__file__).resolve().parents[1] / 'static' / 'index.html')

@app.get('/api/health')
def health(): return {'status':'ok','mode':'offline-local'}

@app.get('/api/categories')
def categories(): return list(CATEGORIES)

@app.get('/api/places')
def places(search:str='', category:str='All'):
    with store.connect() as conn:
        data,_=decorate(conn)
        return [p for p in data if (category=='All' or p['category']==category)
                and search.casefold() in (p['name']+' '+p['area']+' '+' '.join(p['cuisines'])).casefold()]

@app.get('/api/places/{place_id}')
def place_detail(place_id:int):
    with store.connect() as conn:
        data,_=decorate(conn)
        return next((p for p in data if p['id']==place_id),None) or _not_found()

def _not_found(): raise HTTPException(404,'Place not found')

@app.get('/api/lists')
def lists(category:str='All'):
    if category!='All' and category not in CATEGORIES: raise HTTPException(400,'Unknown category')
    with store.connect() as conn:
        places_by_id={p['id']:p for p in load_places(conn)}
        ranks=score_rank_entries(load_ranks(conn))
        ordered=k_way_merge(ranks) if category=='All' else sorted(
            (r for r in ranks if r['category']==category),key=lambda r:r['value'],reverse=True)
        return [{**places_by_id[r['place_id']],**r,'position':i}
                for i,r in enumerate(ordered,1)]

@app.get('/api/recommendations')
def recommendations(category:str='All', min_score:float=Query(0,ge=0,le=10), hide_visited:bool=True):
    if category!='All' and category not in CATEGORIES: raise HTTPException(400,'Unknown category')
    with store.connect() as conn:
        result=recommend(load_places(conn),load_ranks(conn),category,min_score,hide_visited)
        return {'results': result,'score_source':'local_heuristic','personalized':True,'is_last_page':True,
                'disclaimer':'Beli private recommendation model is not reproduced.'}

@app.get('/api/stats')
def stats():
    with store.connect() as conn:
        rows=load_ranks(conn)
        count=len(rows)
        by_cat={cat:sum(r['category']==cat for r in rows) for cat in CATEGORIES}
        return {'count':count,'city_count':count,'by_category':by_cat,'milestones':
                [{'threshold':10,'title':'10 spots ranked','unlocked':count>=10}],
                'next_milestone':max(0,10-count) if count<10 else None}

@app.post('/api/bookmarks/{place_id}')
def toggle_bookmark(place_id:int):
    with store.connect() as conn:
        get_place(conn,place_id)
        exists=conn.execute('SELECT 1 FROM bookmarks WHERE place_id=?',(place_id,)).fetchone()
        if exists: conn.execute('DELETE FROM bookmarks WHERE place_id=?',(place_id,))
        else: conn.execute('INSERT INTO bookmarks(place_id) VALUES(?)',(place_id,))
        return {'place_id':place_id,'bookmarked':not bool(exists)}

@app.get('/api/bookmarks')
def bookmarks():
    with store.connect() as conn:
        data,_=decorate(conn)
        return [p for p in data if p['bookmarked']]

class RankStart(BaseModel):
    place_id:int
    category:str
    sentiment: Literal['liked','fine','disliked']


def finish(conn, place_id:int, category:str, sentiment:str, insertion_index:int, group:list):
    prev_count=conn.execute('SELECT COUNT(*) AS n FROM ranks').fetchone()['n']
    try: value=value_for_insert(group,insertion_index,sentiment)
    except ValueError:
        # Re-spacing keeps ordering stable in pathological precision exhaustion cases.
        bottom,top={'liked':(2.,3.),'fine':(1.,2.),'disliked':(0.,1.)}[sentiment]
        for i,row in enumerate(group):
            conn.execute('UPDATE ranks SET value=? WHERE place_id=?',
                         (top - (top-bottom)*(i+1)/(len(group)+1),row['id']))
        group=existing_group(conn,category,sentiment)
        value=value_for_insert(group,insertion_index,sentiment)
    conn.execute('INSERT INTO ranks(place_id,category,sentiment,value) VALUES(?,?,?,?)',
                 (place_id,category,sentiment,value))
    total=prev_count+1
    return {'status':'completed','place_id':place_id,'category':category,'sentiment':sentiment,
            'value':value,'total_ranked':total,'milestone_unlocked':total==10}


def draft_status(conn,draft):
    group=existing_group(conn,draft['category'],draft['sentiment'])
    new=get_place(conn,draft['place_id'])
    lo,hi=draft['lo'],draft['hi']
    skips=json.loads(draft['skipped'])
    candidates=group[lo:hi]
    candidates=[c for c in candidates if c['id'] not in skips]
    target=choose_pivot(new,candidates)
    return {'status':'comparison' if target else 'no_candidates',
            'draft_id':draft['id'],'place':new,'compare_with':target,
            'remaining_candidates':len(candidates), 'can_undo':bool(json.loads(draft['history'])),
            'category':draft['category'],'sentiment':draft['sentiment']}

@app.post('/api/ranks')
def start_rank(payload:RankStart):
    if payload.category not in CATEGORIES: raise HTTPException(400,'Unknown category')
    with store.connect() as conn:
        place=get_place(conn,payload.place_id)
        if conn.execute('SELECT 1 FROM ranks WHERE place_id=?',(payload.place_id,)).fetchone():
            raise HTTPException(409,'Already ranked; use a new place for this prototype')
        if conn.execute('SELECT 1 FROM rank_drafts WHERE place_id=?',(payload.place_id,)).fetchone():
            raise HTTPException(409,'A comparison is already in progress')
        group=existing_group(conn,payload.category,payload.sentiment)
        if not group:
            return finish(conn,payload.place_id,payload.category,payload.sentiment,0,group)
        draft_id=str(uuid.uuid4())
        conn.execute('INSERT INTO rank_drafts(id,place_id,category,sentiment,lo,hi) VALUES(?,?,?,?,?,?)',
                     (draft_id,payload.place_id,payload.category,payload.sentiment,0,len(group)))
        draft=conn.execute('SELECT * FROM rank_drafts WHERE id=?',(draft_id,)).fetchone()
        return draft_status(conn,draft)

@app.get('/api/drafts/{draft_id}')
def get_draft(draft_id:str):
    with store.connect() as conn:
        draft=conn.execute('SELECT * FROM rank_drafts WHERE id=?',(draft_id,)).fetchone()
        if not draft: raise HTTPException(404,'Draft not found')
        return draft_status(conn,draft)

class Decision(BaseModel):
    choice: Literal['new','existing','skip','undo']

@app.post('/api/drafts/{draft_id}/decision')
def decide(draft_id:str, payload:Decision):
    with store.connect() as conn:
        draft=conn.execute('SELECT * FROM rank_drafts WHERE id=?',(draft_id,)).fetchone()
        if not draft: raise HTTPException(404,'Draft not found or completed')
        group=existing_group(conn,draft['category'],draft['sentiment'])
        history=json.loads(draft['history'])
        skips=json.loads(draft['skipped'])
        if payload.choice=='undo':
            if not history: raise HTTPException(409,'Nothing to undo')
            state=history.pop()
            conn.execute('UPDATE rank_drafts SET lo=?,hi=?,skipped=?,history=? WHERE id=?',
                         (state['lo'],state['hi'],json.dumps(state['skipped']),json.dumps(history),draft_id))
            updated=conn.execute('SELECT * FROM rank_drafts WHERE id=?',(draft_id,)).fetchone()
            return draft_status(conn,updated)
        active=[r for r in group[draft['lo']:draft['hi']] if r['id'] not in skips]
        target=choose_pivot(get_place(conn,draft['place_id']),active)
        if not target: raise HTTPException(409,'No comparison candidate left')
        history.append({'lo':draft['lo'],'hi':draft['hi'],'skipped':skips[:]})
        lo,hi=draft['lo'],draft['hi']
        if payload.choice=='skip':
            skips.append(target['id'])
        else:
            idx=next(i for i,r in enumerate(group) if r['id']==target['id'])
            if payload.choice=='new': hi=idx
            else: lo=idx+1
            skips=[]
        conn.execute('UPDATE rank_drafts SET lo=?,hi=?,skipped=?,history=? WHERE id=?',
                     (lo,hi,json.dumps(skips),json.dumps(history),draft_id))
        updated=conn.execute('SELECT * FROM rank_drafts WHERE id=?',(draft_id,)).fetchone()
        state=draft_status(conn,updated)
        if state['status']=='comparison': return state
        # If all candidates skipped, insert at middle of unresolved region: explicit approximation.
        index=(lo+hi)//2 if lo!=hi else lo
        result=finish(conn,draft['place_id'],draft['category'],draft['sentiment'],index,group)
        conn.execute('DELETE FROM rank_drafts WHERE id=?',(draft_id,))
        result['approximate']=lo!=hi
        return result

@app.post('/api/demo/reset')
def reset_demo():
    store.reset()
    return {'ok':True,'message':'Restored nine illustrative ranked places.'}
