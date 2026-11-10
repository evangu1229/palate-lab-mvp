"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, CircleHelp,
  Compass, Heart, Info, MapPin, Medal, MoreHorizontal, RotateCcw, Search,
  SlidersHorizontal, Sparkles, Star, ThumbsDown, ThumbsUp, Trophy, X
} from "lucide-react";
import {
  api, post, Place, Rec, RankedPlace, Stats, DraftState, RankResponse,
  Sentiment, CATEGORIES, CATEGORY_LABELS, SENTIMENT_LABELS
} from "@/lib/api";

type Tab = "discover" | "rankings" | "recs" | "saved";
type RankMode = "choose" | "compare" | "finished" | null;
const tabNames:Record<Tab,string> = {discover:"탐색",rankings:"내 랭킹",recs:"추천",saved:"저장함"};
const navigation:{id:Tab; label:string; icon:typeof Compass}[] = [
  {id:"discover",label:"장소 탐색",icon:Compass},
  {id:"rankings",label:"내 랭킹",icon:Medal},
  {id:"recs",label:"맞춤 추천",icon:Sparkles},
  {id:"saved",label:"가보고 싶어요",icon:Bookmark}
];
const startState:Stats = {count:0,city_count:0,by_category:{},milestones:[],next_milestone:10};

function CategoryPills({selected,onChange,mini=false}:{selected:string;onChange:(v:string)=>void;mini?:boolean}){
 return <div className={`pills ${mini?"pills-mini":""}`} role="group" aria-label="카테고리 필터">
  {CATEGORIES.map(c=><button key={c} className={`pill ${selected===c?"selected":""}`} onClick={()=>onChange(c)}>{CATEGORY_LABELS[c]}</button>)}
 </div>;
}

function PlaceArt({place,large=false}:{place:Place;large?:boolean}){
 return <div className={`place-art color-${place.color} ${large?"place-art-large":""}`} aria-hidden="true">
  <span className="art-glow"/><span className="art-symbol">{place.icon}</span><span className="art-dots">✳</span>
 </div>;
}

function PlaceRow({place,placeRank,onOpen,onRank,onBookmark,showScore=false,recScore,recReasons}:{
 place:Place; placeRank?:number; onOpen:()=>void; onRank:()=>void; onBookmark:()=>void;
 showScore?:boolean; recScore?:number;recReasons?:string[];
}){
 return <article className="place-row">
  {placeRank!=null && <div className="rank-index">{String(placeRank).padStart(2,'0')}</div>}
  <button className="art-button" onClick={onOpen} aria-label={`${place.name} 상세보기`}><PlaceArt place={place}/></button>
  <button className="row-main" onClick={onOpen}>
   <strong>{place.name}</strong>
   <span className="place-meta"><MapPin size={12}/> {place.area} · {CATEGORY_LABELS[place.category]} · {"₩".repeat(place.price)}</span>
   {recReasons && <span className="rec-reason">{recReasons[0]}</span>}
  </button>
  <div className="row-end">
   {showScore && <span className="personal-score">{place.rank?.score?.toFixed(1)??"–"}<small>MY SCORE</small></span>}
   {recScore != null && <span className="personal-score rec-num">{recScore.toFixed(1)}<small>TRY SCORE</small></span>}
   {!showScore && recScore==null && <span className="community-score"><Star size={13} fill="currentColor"/> {place.average_score.toFixed(1)}</span>}
   <button className={`icon-btn bookmark ${place.bookmarked?"active":""}`} title="저장하기" onClick={onBookmark} aria-label="북마크 전환"><Bookmark size={18} fill={place.bookmarked?"currentColor":"none"}/></button>
   <button className="add-btn" onClick={onRank} disabled={!!place.rank} aria-label={place.rank?"평가 완료":"평가하기"}>
    {place.rank?<Check size={18}/>:<span>+</span>}
   </button>
  </div>
 </article>;
}

function ModalFrame({children,onClose,wide=false}:{children:React.ReactNode;onClose:()=>void;wide?:boolean}){
 useEffect(()=>{
  const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  document.addEventListener('keydown',h);
  return ()=>document.removeEventListener('keydown',h);
 },[onClose]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} role="presentation">
  <section className={`modal ${wide?"modal-wide":""}`} role="dialog" aria-modal="true">
   <button className="modal-close icon-btn" aria-label="닫기" onClick={onClose}><X size={21}/></button>
   {children}
  </section>
 </div>;
}

export default function Page(){
 const [tab,setTab]=useState<Tab>('discover');
 const [places,setPlaces]=useState<Place[]>([]);
 const [ranked,setRanked]=useState<RankedPlace[]>([]);
 const [recs,setRecs]=useState<Rec[]>([]);
 const [stats,setStats]=useState<Stats>(startState);
 const [bookmarks,setBookmarks]=useState<Place[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('All');
 const [rankingCategory,setRankingCategory]=useState('All');
 const [recCategory,setRecCategory]=useState('All');
 const [minRecScore,setMinRecScore]=useState(0);
 const [selected,setSelected]=useState<Place|null>(null);
 const [rankPlace,setRankPlace]=useState<Place|null>(null);
 const [rankMode,setRankMode]=useState<RankMode>(null);
 const [rankCategory,setRankCategory]=useState('Restaurants');
 const [sentiment,setSentiment]=useState<Sentiment>('liked');
 const [draft,setDraft]=useState<DraftState|null>(null);
 const [busy,setBusy]=useState(false);
 const [milestone,setMilestone]=useState(false);

 const loadAll=useCallback(async()=>{
  try {
   const [p,r,s,b]=await Promise.all([
    api<Place[]>('/api/places'),api<RankedPlace[]>('/api/lists'),
    api<Stats>('/api/stats'),api<Place[]>('/api/bookmarks')
   ]);
   setPlaces(p);setRanked(r);setStats(s);setBookmarks(b);setError('');
  } catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void loadAll();},[loadAll]);
 useEffect(()=>{
  let cancelled=false;
  void api<{results:Rec[]}>(`/api/recommendations?category=${encodeURIComponent(recCategory)}&min_score=${minRecScore}`).then(
   result=>{if(!cancelled)setRecs(result.results);},
   ()=>{if(!cancelled)setRecs([]);}
  );
  return ()=>{cancelled=true;};
 },[recCategory,minRecScore,stats.count]);

 const toast=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(''),3200);};
 const visiblePlaces=useMemo(()=>places.filter(p=>(category==='All'||p.category===category)&&
  `${p.name} ${p.area} ${p.cuisines.join(' ')}`.toLowerCase().includes(search.toLowerCase())),[places,category,search]);
 const visibleRanks=useMemo(()=>{
  if(rankingCategory==='All')return ranked;
  return ranked.filter(r=>r.category===rankingCategory).sort((a,b)=>b.value-a.value);
 },[ranked,rankingCategory]);
 const rankedCount=stats.count;

 const openRank=(p:Place)=>{
  if(p.rank){toast('이미 평가한 장소예요.');return;}
  setSelected(null);setRankPlace(p);setRankCategory(p.category);
  setSentiment('liked');setDraft(null);setRankMode('choose');
 };
 const doBookmark=async(p:Place)=>{
  try {const res=await post<{bookmarked:boolean}>(`/api/bookmarks/${p.id}`);
   await loadAll();
   setSelected(current=>current?.id===p.id?{...current,bookmarked:res.bookmarked}:current);
   toast(res.bookmarked?'가보고 싶은 장소에 저장했어요.':'저장 목록에서 해제했어요.');
  }catch(e){toast(e instanceof Error?e.message:'저장에 실패했어요.');}
 };
 const completed=async(result:Extract<RankResponse,{status:'completed'}>)=>{
  await loadAll();setDraft(null);
  if(result.milestone_unlocked){setRankMode(null);setRankPlace(null);setMilestone(true);}
  else {setRankMode('finished');}
  toast(result.approximate?'건너뛴 비교가 있어 대략적인 위치로 저장했어요.':'내 랭킹에 반영했어요.');
 };
 const startRanking=async()=>{
  if(!rankPlace||busy)return;
  setBusy(true);
  try {const result=await post<RankResponse>('/api/ranks',{place_id:rankPlace.id,category:rankCategory,sentiment});
   if(result.status==='completed')await completed(result);
   else if(result.status==='comparison'){setDraft(result);setRankMode('compare');}
   else toast('비교할 장소가 없어요.');
  }catch(e){toast(e instanceof Error?e.message:'평가에 실패했어요.');}
  finally{setBusy(false);}
 };
 const decide=async(choice:'new'|'existing'|'skip'|'undo')=>{
  if(!draft||busy)return;
  setBusy(true);
  try {const result=await post<RankResponse>(`/api/drafts/${draft.draft_id}/decision`,{choice});
   if(result.status==='completed')await completed(result);
   else if(result.status==='comparison')setDraft(result);
  }catch(e){toast(e instanceof Error?e.message:'비교 처리 실패');}
  finally{setBusy(false);}
 };
 const resetDemo=async()=>{
  if(!window.confirm('시연 데이터를 초기화할까요? 기존 평가와 저장 목록이 삭제됩니다.'))return;
  try{await post('/api/demo/reset');setSelected(null);setRankPlace(null);setRankMode(null);setMilestone(false);
   await loadAll();toast('9개의 기본 랭킹 상태로 초기화했어요.');
  }catch{toast('초기화에 실패했어요.');}
 };

 return <div className="app-shell">
  <aside className="sidebar">
   <button className="brand" onClick={()=>setTab('discover')} aria-label="Palate Lab 홈">
    <span className="brand-mark">p<span>✳</span></span><span>palate<span className="brand-light">lab.</span><small>TASTE EXPLORER</small></span>
   </button>
   <div className="sidebar-subheading">WORKSPACE</div>
   <nav className="main-nav" aria-label="주 메뉴">
    {navigation.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setTab(id)}
     className={`nav-item ${tab===id?'active':''}`}><Icon size={19}/><span>{label}</span>{id==='saved'&&bookmarks.length>0?<b>{bookmarks.length}</b>:null}</button>)}
   </nav>
   <div className="side-spacer"/>
   <div className="side-tip"><span className="side-tip-icon"><Sparkles size={17}/></span><strong>취향 데이터 실험실</strong><p>실제 클라이언트에서 관찰한 랭킹 구조와 독립 추천 모델을 비교해 보세요.</p></div>
   <button className="demo-reset" onClick={resetDemo}><RotateCcw size={15}/> 데모 데이터 초기화</button>
   <div className="sidebar-account"><div className="avatar">P</div><div><strong>Demo Explorer</strong><small>LOCAL · 테스트 계정</small></div><MoreHorizontal size={19}/></div>
  </aside>

  <main className="main-area">
   <header className="topbar">
    <span className="breadcrumb">PALATE LAB <span>/</span> {tabNames[tab]}</span>
    <div className="topbar-right"><span className="local-dot"/> LOCAL DEMO <span className="topbar-avatar">P</span></div>
   </header>
   <div className="content">
    {error&&<div className="error-banner"><Info size={17}/> API 연결 실패: {error}. 백엔드가 실행 중인지 확인해 주세요.</div>}
    {loading?<div className="loading"><span className="loading-orbit"/>실험 데이터를 불러오는 중...</div>:<>
    {tab==='discover'&&<>
     <section className="hero"><div className="hero-overline"><span className="little-sun">✳</span> TASTE IS PERSONAL</div>
      <h1>먹고, 기억하고,<br/><em>나만의 취향을 찾아요.</em></h1>
      <p>장소를 발견하고, 경험을 기록하세요. 작은 선택이 쌓여<br className="desktop-only"/> 당신만의 순위가 만들어집니다.</p>
      <button className="hero-cta" onClick={()=>document.getElementById('explore-list')?.scrollIntoView({behavior:'smooth'})}>장소 둘러보기 <ArrowRight size={17}/></button>
      <div className="hero-ornament"><span>✳</span><span>✦</span><span>·</span></div>
     </section>
     <div className="section-top"><div><div className="eyebrow">EXPLORE THE CITY</div><h2>어디가 끌리나요?</h2><p className="section-description">새로운 공간을 발견하고 나만의 리스트에 담아보세요.</p></div><span className="count-pill">{visiblePlaces.length} places</span></div>
     <div className="toolbar" id="explore-list"><div className="search-wrap"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="장소 이름, 지역, 음식 종류로 검색" aria-label="장소 검색"/></div><button className="toolbar-filter" onClick={()=>setCategory('All')} title="필터 초기화"><SlidersHorizontal size={17}/></button></div>
     <CategoryPills selected={category} onChange={setCategory}/>
     <div className="list-panel">{visiblePlaces.length?visiblePlaces.map(p=><PlaceRow key={p.id} place={p} onOpen={()=>setSelected(p)} onRank={()=>openRank(p)} onBookmark={()=>void doBookmark(p)}/>):<div className="empty-state">검색 결과가 없어요. 다른 검색어를 입력해 보세요.</div>}</div>
    </>}
    {tab==='rankings'&&<>
     <div className="page-heading"><div className="eyebrow">YOUR TASTE, YOUR RULES</div><h1>내 랭킹 <span className="heading-star">✳</span></h1><p>누구의 별점도 아닌, 직접 선택한 취향의 순서.</p></div>
     <div className="stats-grid">
      <div className="stat-card primary"><span>평가한 장소</span><div><strong>{rankedCount}</strong><small>SPOTS RANKED</small></div><div className="progress-track"><div style={{width:`${Math.min(100,rankedCount*10)}%`}}/></div><small className="stat-note">{rankedCount>=10?'첫 번째 마일스톤 달성!':`10개 달성까지 ${10-rankedCount}개 남았어요`}</small></div>
      <div className="stat-card"><span>기록된 카테고리</span><div><strong>{Object.values(stats.by_category).filter(n=>n>0).length}</strong><small>CATEGORIES</small></div><div className="category-dots">{['🍜','☕','🍸','🥐','🍨'].map((x,i)=><span key={i}>{x}</span>)}</div></div>
      <div className="stat-card"><span>나의 첫 번째 성취</span><div className="trophy-line"><Trophy size={34}/><strong>{rankedCount>=10?'Unlocked':'10 spots'}</strong></div><small className="stat-note">평가 10개 달성 시 자동 공개</small></div>
     </div>
     <div className="section-top ranking-section"><div><div className="eyebrow">THE PERSONAL LEADERBOARD</div><h2>나만의 베스트 리스트</h2><p className="section-description">카테고리별 점수를 병합해 전체 순위를 구성합니다.</p></div><span className="count-pill">{visibleRanks.length} ranked</span></div>
     <CategoryPills selected={rankingCategory} onChange={setRankingCategory}/>
     <div className="list-panel">{visibleRanks.length?visibleRanks.map((p,i)=><PlaceRow key={p.id} place={{...p,rank:{place_id:p.place_id,category:p.category,sentiment:p.sentiment,value:p.value,score:p.score,category_position:p.category_position},bookmarked:places.find(q=>q.id===p.id)?.bookmarked}} placeRank={i+1} showScore onOpen={()=>setSelected(places.find(q=>q.id===p.id)??p)} onRank={()=>openRank(p)} onBookmark={()=>void doBookmark(p)}/>):<div className="empty-state">이 카테고리에 평가한 장소가 없어요.</div>}</div>
     <p className="fine-print"><Info size={13}/> 내 점수: 감정 그룹별 로컬 산식 · 전체 순위: 카테고리별 k-way 병합 (Beli 클라이언트 분석 기반)</p>
    </>}
    {tab==='recs'&&<>
     <div className="page-heading"><div className="eyebrow">DISCOVER YOUR NEXT FAVORITE</div><h1>취향에 가까운 곳 <span className="heading-star">✦</span></h1><p>지금까지 좋아한 공간에서 출발한, 설명 가능한 추천.</p></div>
     <div className="explain-banner"><Sparkles size={21}/><div><strong>이 추천 점수는 자체 제작한 실험용 모델이에요.</strong><p>Beli 서버의 비공개 추천 모델을 복제한 것이 아닙니다. 선호 음식·가격대·커뮤니티 점수로 계산해요.</p></div></div>
     <div className="section-top rec-section"><div><div className="eyebrow">RECOMMENDED FOR YOU</div><h2>오늘의 추천 리스트</h2></div><label className="score-select">최소 점수 <select aria-label="최소 추천 점수" value={minRecScore} onChange={e=>setMinRecScore(Number(e.target.value))}><option value={0}>전체</option><option value={7}>7.0+</option><option value={8}>8.0+</option><option value={9}>9.0+</option></select><ChevronDown size={15}/></label></div>
     <CategoryPills selected={recCategory} onChange={setRecCategory}/>
     <div className="list-panel">{recs.length?recs.map(p=><PlaceRow key={p.id} place={{...p,bookmarked:places.find(x=>x.id===p.id)?.bookmarked}} recScore={p.expected_percentile} recReasons={p.reasons} onOpen={()=>setSelected(places.find(x=>x.id===p.id)??p)} onRank={()=>openRank(p)} onBookmark={()=>void doBookmark(p)}/>):<div className="empty-state">현재 필터의 추천 결과가 없어요.</div>}</div>
     <p className="fine-print"><CircleHelp size={13}/> 점수 출처: local_heuristic (자체 구현) · 실제 Beli `score_source=model`과 다름</p>
    </>}
    {tab==='saved'&&<>
     <div className="page-heading"><div className="eyebrow">YOUR LITTLE WISHLIST</div><h1>가보고 싶은 곳 <span className="heading-star">♡</span></h1><p>언젠가 들르고 싶은 공간을 한곳에 담아두세요.</p></div>
     <div className="section-top saved-title"><h2>저장한 장소</h2><span className="count-pill">{bookmarks.length} saved</span></div>
     <div className="list-panel">{bookmarks.length?bookmarks.map(p=><PlaceRow key={p.id} place={p} onOpen={()=>setSelected(p)} onRank={()=>openRank(p)} onBookmark={()=>void doBookmark(p)}/>):<div className="empty-state"><Bookmark size={34}/><strong>아직 저장한 곳이 없어요.</strong><span>탐색 화면에서 북마크를 눌러보세요.</span><button className="secondary-btn" onClick={()=>setTab('discover')}>장소 찾기</button></div>}</div>
    </>}
    <footer className="main-footer"><span>✳ palate lab. · Independent research prototype</span><span>Local demo · No production Beli API</span></footer>
    </>}
   </div>
  </main>

  <nav className="bottom-nav" aria-label="모바일 메뉴">{navigation.map(({id,label,icon:Icon})=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={21}/><span>{label.replace('장소 ','').replace('맞춤 ','')}</span></button>)}</nav>

  {selected&&<ModalFrame onClose={()=>setSelected(null)}><div className="detail-art"><PlaceArt place={selected} large/></div>
   <div className="detail-body"><div className="eyebrow">{CATEGORY_LABELS[selected.category]} · {selected.area}</div>
    <h2>{selected.name}</h2><div className="detail-info"><span><MapPin size={15}/> {selected.area}, {selected.city}</span><span><Star size={15} fill="currentColor"/> {selected.average_score.toFixed(1)} community</span></div>
    <div className="detail-tags">{selected.cuisines.map(c=><span key={c}>{c}</span>)}<span>{"₩".repeat(selected.price)}</span></div>
    <div className="detail-actions"><button className="secondary-btn" onClick={()=>void doBookmark(selected)}><Bookmark size={18} fill={selected.bookmarked?'currentColor':'none'}/>{selected.bookmarked?'저장됨':'가보고 싶어요'}</button>
     <button className="primary-btn" onClick={()=>openRank(selected)} disabled={!!selected.rank}>{selected.rank?<><Check size={17}/> 평가 완료</>:<>+ 내 랭킹에 추가</>}</button></div>
    <p className="detail-disclaimer">장소 데이터와 커뮤니티 점수는 오프라인 시연용 예시값입니다.</p>
   </div></ModalFrame>}

  {rankPlace&&rankMode&&<ModalFrame onClose={()=>{setRankMode(null);setRankPlace(null);}} wide={rankMode==='compare'}>
   {rankMode==='choose'&&<div className="rank-flow"><div className="modal-eyebrow">ADD TO YOUR TASTE LIST</div><h2>어땠나요?</h2>
    <p className="modal-subtitle">{rankPlace.name}에 대한 나만의 취향을 기록해보세요.</p>
    <div className="mini-place"><PlaceArt place={rankPlace}/><div><strong>{rankPlace.name}</strong><span>{rankPlace.area} · {CATEGORY_LABELS[rankPlace.category]}</span></div></div>
    <label className="field-label" htmlFor="rankCategory">추가할 카테고리</label>
    <select id="rankCategory" className="category-picker" value={rankCategory} onChange={e=>setRankCategory(e.target.value)}>{CATEGORIES.slice(1).map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select>
    <span className="field-label">이 장소는 어땠나요?</span>
    <div className="sentiment-options">
     {([{value:'liked',icon:ThumbsUp,desc:'또 가고 싶어요'},{value:'fine',icon:Heart,desc:'그럭저럭 괜찮았어요'},{value:'disliked',icon:ThumbsDown,desc:'내 취향은 아니에요'}] as const).map(item=><button key={item.value} onClick={()=>setSentiment(item.value)} className={`sentiment ${sentiment===item.value?'chosen':''} sentiment-${item.value}`}><item.icon size={19}/><span><strong>{SENTIMENT_LABELS[item.value]}</strong><small>{item.desc}</small></span>{sentiment===item.value&&<Check size={17}/>}</button>)}
    </div><button className="primary-btn full" disabled={busy} onClick={()=>void startRanking()}>{busy?'처리 중...':'순위 정하기'}<ArrowRight size={18}/></button>
    <p className="modal-note">같은 카테고리·선호 그룹에 기존 장소가 있으면 1:1 비교가 진행됩니다.</p>
   </div>}
   {rankMode==='compare'&&draft&&draft.compare_with&&<div className="compare-flow">
    <div className="modal-eyebrow">PAIRWISE COMPARISON · {CATEGORY_LABELS[draft.category]}</div><h2>둘 중 어디가 더 좋았나요?</h2>
    <p className="modal-subtitle">선택을 통해 내 리스트에서 새로운 장소의 위치를 정해요.</p>
    <div className="compare-grid"><button className="compare-card" disabled={busy} onClick={()=>void decide('new')}><PlaceArt place={draft.place} large/><div className="compare-card-inner"><span className="compare-flag new">NEW</span><strong>{draft.place.name}</strong><span>{draft.place.area}</span><div className="choose-label">이쪽이 더 좋아요 <ArrowRight size={15}/></div></div></button>
     <span className="vs-mark">VS</span>
     <button className="compare-card" disabled={busy} onClick={()=>void decide('existing')}><PlaceArt place={draft.compare_with} large/><div className="compare-card-inner"><span className="compare-flag">RANKED</span><strong>{draft.compare_with.name}</strong><span>{draft.compare_with.area}</span><div className="choose-label">이쪽이 더 좋아요 <ArrowRight size={15}/></div></div></button></div>
    <div className="compare-controls"><button disabled={busy||!draft.can_undo} onClick={()=>void decide('undo')}><RotateCcw size={15}/> 되돌리기</button><button disabled={busy} onClick={()=>void decide('skip')}>너무 어려워요 · 건너뛰기 <ArrowRight size={15}/></button></div>
    <p className="modal-note">유사도 기반 비교 후보 선택 및 순위 삽입 · 관찰된 클라이언트 규칙의 독립 재구현</p>
   </div>}
   {rankMode==='finished'&&<div className="finished-flow"><div className="finished-mark"><Check size={35}/></div><div className="modal-eyebrow">RANK SAVED</div><h2>취향 리스트에 추가했어요!</h2><p>새 평가가 개인 순위와 추천에 반영됐어요.</p><button className="primary-btn full" onClick={()=>{setRankMode(null);setRankPlace(null);setTab('rankings');}}>랭킹 확인하기 <ArrowRight size={18}/></button></div>}
  </ModalFrame>}
  {milestone&&<ModalFrame onClose={()=>setMilestone(false)}><div className="milestone-flow"><div className="confetti">✳ ✦ ✳</div><div className="milestone-emblem"><Trophy size={52}/></div><div className="modal-eyebrow">MILESTONE UNLOCKED</div><h2>취향 기록 10개 달성!</h2><p>벌써 10개의 공간을 평가했어요.<br/>당신만의 미식 지도가 선명해지고 있어요.</p><span className="milestone-number">10 <small>SPOTS RANKED</small></span><button className="primary-btn full" onClick={()=>{setMilestone(false);setTab('rankings');}}>내 랭킹 확인하기 <ArrowRight size={18}/></button><small>관찰된 자동 노출 UX를 독립 구현했습니다.</small></div></ModalFrame>}
  {notice&&<div role="status" className="toast"><Check size={16}/>{notice}</div>}
 </div>;
}
