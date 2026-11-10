import os
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as never_used:
    pass

db_fd, db_name = tempfile.mkstemp(suffix='.sqlite3')
os.close(db_fd)
Path(db_name).unlink(missing_ok=True)
os.environ['PALATE_DB_PATH'] = db_name

from fastapi.testclient import TestClient
from app.main import app
from app.engine import personal_score, similarity, k_way_merge


def test_local_scoring_math():
    assert [round(personal_score(i,3,'liked'),1) for i in range(1,4)] == [10.0,8.9,7.8]
    assert round(personal_score(1,1,'fine'),1) == 6.7
    assert similarity({'city':'Seoul','price':2,'cuisines':['Coffee']},
                      {'city':'Seoul','price':2,'cuisines':['Coffee']}) == 2


def test_end_to_end():
    with TestClient(app) as client:
        assert client.get('/api/health').json()['status']=='ok'
        assert client.get('/api/stats').json()['count']==9
        all_list=client.get('/api/lists').json()
        assert len(all_list)==9
        assert all_list[0]['score']==10.0
        bakeries=client.get('/api/lists',params={'category':'Bakeries'}).json()
        assert [r['name'] for r in bakeries]==['Salt24','Our Bakery']
        scores=client.get('/api/recommendations',params={'min_score':7.0}).json()
        assert scores['score_source']=='local_heuristic'
        assert all(r['expected_percentile']>=7 for r in scores['results'])
        assert all(r['score_source']=='local_heuristic' for r in scores['results'])
        bm=client.post('/api/bookmarks/10').json()
        assert bm['bookmarked']
        assert len(client.get('/api/bookmarks').json())==1
        assert client.post('/api/bookmarks/10').json()['bookmarked'] is False
        # tenth rank: positive bakery joins Salt24, not neutral Our Bakery
        state=client.post('/api/ranks',json={'place_id':10,'category':'Bakeries','sentiment':'liked'}).json()
        assert state['status']=='comparison'
        assert state['compare_with']['name']=='Salt24'
        draft_id=state['draft_id']
        # Undo a skip should restore the same comparison.
        skipped=client.post(f'/api/drafts/{draft_id}/decision',json={'choice':'undo'})
        assert skipped.status_code==409
        result=client.post(f'/api/drafts/{draft_id}/decision',json={'choice':'existing'}).json()
        assert result['status']=='completed'
        assert result['milestone_unlocked'] is True
        assert client.get('/api/stats').json()['count']==10
        bakeries=client.get('/api/lists',params={'category':'Bakeries'}).json()
        assert [r['name'] for r in bakeries]==['Salt24','Bakery Cafe Aoitori','Our Bakery']
        assert client.post('/api/ranks',json={'place_id':10,'category':'Bakeries','sentiment':'liked'}).status_code==409
        # independent category and fine sentiment need no positive comparison
        start=client.post('/api/ranks',json={'place_id':15,'category':'Ice Cream & Dessert','sentiment':'fine'}).json()
        assert start['status']=='completed'
        assert start['milestone_unlocked'] is False
        assert client.post('/api/demo/reset').status_code==200
        assert client.get('/api/stats').json()['count']==9


def test_skip_and_undo_path():
    with TestClient(app) as client:
        draft=client.post('/api/ranks',json={'place_id':10,'category':'Bakeries','sentiment':'liked'}).json()
        skipped=client.post(f'/api/drafts/{draft["draft_id"]}/decision',json={'choice':'skip'}).json()
        assert skipped['status']=='completed' and skipped['approximate'] is True
        assert client.post('/api/demo/reset').status_code==200
        # Two existing positive coffee places: first comparison, can undo if second remains
        draft=client.post('/api/ranks',json={'place_id':11,'category':'Coffee & Tea','sentiment':'liked'}).json()
        assert draft['status']=='comparison'
        next_state=client.post(f'/api/drafts/{draft["draft_id"]}/decision',json={'choice':'existing'}).json()
        if next_state['status']=='comparison':
            undo=client.post(f'/api/drafts/{draft["draft_id"]}/decision',json={'choice':'undo'}).json()
            assert undo['status']=='comparison'
            assert undo['compare_with']['id']==draft['compare_with']['id']
        client.post('/api/demo/reset')
