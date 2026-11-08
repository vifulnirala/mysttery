'use strict';
(() => {
 const W='mysteryVault.watchlist.v1',H='mysteryVault.history.v1';
 const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return []}};
 const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn(e)}};
 const watch=document.getElementById('watchlist-grid'),cont=document.getElementById('continue-grid'),video=document.getElementById('video-element');
 const key=x=>String(x.tmdbId||x.id||x.source||x.magnet||x.title);
 const get=card=>window.MysteryVault&&window.MysteryVault.getCatalogItem(card.dataset.cardType,Number(card.dataset.index));
 const esc=s=>{const e=document.createElement('span');e.textContent=s||'';return e.innerHTML};

 const trendingGrid=document.getElementById('trending-grid');
 const recommendationsGrid=document.getElementById('recommendations-grid');
 function renderTmdbShelf(grid,items,emptyText){
   if(!grid)return;grid.replaceChildren();
   if(!items.length){grid.innerHTML='<div class="empty">'+esc(emptyText)+'</div>';return}
   items.forEach(item=>{
     const card=document.createElement('article');card.className='card';
     const poster=document.createElement('div');poster.className='poster-wrap';
     const img=document.createElement('img');img.loading='lazy';img.alt='';img.src=item.posterUrl||item.poster||'';poster.append(img);
     const info=document.createElement('div');info.className='card-info';
     const title=document.createElement('div');title.className='card-title';title.textContent=item.title||'Untitled';
     const meta=document.createElement('div');meta.className='meta-row';meta.textContent=[item.year,item.mediaType==='tv'?'TV':'Movie'].filter(Boolean).join(' · ');
     const open=document.createElement('button');open.className='vault-watch-btn';open.textContent='▶ Open';open.onclick=()=>window.MysteryVault?.openItem(item);
     info.append(title,meta,open);card.append(poster,info);grid.append(card);
   });
 }
 async function loadTrending(){
   try{const response=await fetch('/api/trending',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unavailable');renderTmdbShelf(trendingGrid,Array.isArray(data.results)?data.results:[],'Trending titles are unavailable right now.')}
   catch{renderTmdbShelf(trendingGrid,[],'Trending titles are unavailable right now.')}
 }
 let recommendationSeed='';
 async function loadRecommendations(){
   const seed=read(W).find(x=>x.tmdbId&&['movie','tv'].includes(x.mediaType))||read(H).find(x=>x.item?.tmdbId&&['movie','tv'].includes(x.item.mediaType))?.item;
   if(!seed){renderTmdbShelf(recommendationsGrid,[],'Add a movie or show to your watchlist to get recommendations.');recommendationSeed='';return}
   const key=seed.mediaType+'|'+seed.tmdbId;if(key===recommendationSeed)return;recommendationSeed=key;
   try{const response=await fetch('/api/recommendations?mediaType='+encodeURIComponent(seed.mediaType)+'&id='+encodeURIComponent(seed.tmdbId),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unavailable');renderTmdbShelf(recommendationsGrid,Array.isArray(data.results)?data.results:[],'No recommendations are available for this title yet.')}
   catch{renderTmdbShelf(recommendationsGrid,[],'Recommendations are unavailable right now.')}
 }
 loadTrending();

 function renderWatch(){const items=read(W);watch.replaceChildren();if(!items.length){watch.innerHTML='<div class="empty">Your watchlist is waiting for its first mystery.</div>';return}items.forEach(item=>{const card=document.createElement('article');card.className='card';const img=document.createElement('img');img.src=item.posterUrl||item.poster||'';img.alt='';img.loading='lazy';const wrap=document.createElement('div');wrap.className='poster-wrap';wrap.append(img);const info=document.createElement('div');info.className='card-info';const title=document.createElement('div');title.className='card-title';title.textContent=item.title||'Saved title';const open=document.createElement('button');open.className='vault-watch-btn';open.textContent='▶ Open';open.onclick=()=>window.MysteryVault?.openItem(item);const remove=document.createElement('button');remove.className='vault-watch-btn';remove.textContent='Remove';remove.onclick=()=>{write(W,read(W).filter(x=>key(x)!==key(item)));renderWatch();syncButtons()};info.append(title,open,remove);card.append(wrap,info);watch.append(card)})}
 function syncButtons(root=document){const saved=new Set(read(W).map(key));root.querySelectorAll('.card[data-card-type]').forEach(card=>{const info=card.querySelector('.card-info'),item=get(card);if(!info||!item)return;let b=info.querySelector('.vault-watch-btn[data-watch]');if(!b){b=document.createElement('button');b.type='button';b.className='vault-watch-btn';b.dataset.watch='1';info.append(b)}const yes=saved.has(key(item));b.classList.toggle('is-saved',yes);const label=yes?'♥ Saved':'♡ Watchlist';if(b.textContent!==label)b.textContent=label})}
 document.addEventListener('click',e=>{const b=e.target.closest('.vault-watch-btn[data-watch]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const item=get(b.closest('.card'));if(!item)return;const a=read(W),exists=a.some(x=>key(x)===key(item));write(W,exists?a.filter(x=>key(x)!==key(item)):[item,...a].slice(0,100));syncButtons();renderWatch();loadRecommendations()},true);
 function renderContinue(){const items=read(H).filter(x=>x.kind==='external'||(x.progress>0&&x.progress<.95)).slice(0,10);cont.replaceChildren();if(!items.length){cont.innerHTML='<div class="empty">Your unfinished streams will appear here.</div>';return}items.forEach(x=>{const card=document.createElement('article');card.className='card';const info=document.createElement('div');info.className='card-info';const title=document.createElement('div');title.className='card-title';title.textContent=x.title||'Continue watching';if(x.kind==='external'){const meta=document.createElement('div');meta.className='section-note';meta.textContent=x.item?.mediaType==='tv'&&x.item.season!=null?'External player · S'+String(x.item.season).padStart(2,'0')+' E'+String(x.item.episode||1).padStart(2,'0'):'External player';info.append(title,meta)}else{const bar=document.createElement('div');bar.className='vault-progress';const fill=document.createElement('span');fill.style.width=Math.round(x.progress*100)+'%';bar.append(fill);info.append(title,bar)}const resume=document.createElement('button');resume.className='vault-watch-btn';resume.textContent='▶ Resume';resume.onclick=()=>{if(x.kind==='torrent')window.MysteryVault?.playFile(x.source,x.fileIndex,x.title,x.position);else if(x.item)window.MysteryVault?.openItem(x.item)};info.append(resume);card.append(info);cont.append(card)})}
 let active=null,last=0;
 window.addEventListener('mysteryvault:play',e=>{const d=e.detail||{};active=d.kind==='torrent'?{kind:'torrent',source:d.source,fileIndex:d.fileIndex,title:d.fileName,key:d.source+'|'+d.fileIndex,progress:0,position:0}:{kind:'external',title:d.title,key:(d.payload?.mediaType+'|'+d.payload?.id+'|'+(d.payload?.season??'')+'|'+(d.payload?.episode??'')),progress:0.01,position:0};if(d.payload)active.item={tmdbId:d.payload.id,mediaType:d.payload.mediaType,title:d.title,season:d.payload.season,episode:d.payload.episode};const a=read(H);write(H,[active,...a.filter(x=>x.key!==active.key)].slice(0,40));renderContinue()});
 video.addEventListener('timeupdate',()=>{if(!active||!video.duration||Date.now()-last<2500)return;last=Date.now();active.position=video.currentTime;active.progress=Math.min(.99,video.currentTime/video.duration);const a=read(H);const i=a.findIndex(x=>x.key===active.key);if(i>=0)a[i]=active;write(H,a);renderContinue()});
 video.addEventListener('ended',()=>{if(active){write(H,read(H).filter(x=>x.key!==active.key));active=null;renderContinue()}});
 document.getElementById('vault-playback-speed')?.addEventListener('change',e=>{video.playbackRate=Number(e.target.value)||1});
 document.getElementById('vault-subtitle-file')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{let t=await f.text();if(f.name.toLowerCase().endsWith('.srt'))t='WEBVTT\n\n'+t.replace(/^(\d+)\r?\n/gm,'').replace(/,(\d{3})/g,'.$1');const u=URL.createObjectURL(new Blob([t],{type:'text/vtt'}));video.querySelectorAll('track[data-vault]').forEach(x=>x.remove());const tr=document.createElement('track');tr.kind='subtitles';tr.label=f.name;tr.srclang='en';tr.src=u;tr.default=true;tr.dataset.vault='1';video.append(tr);document.getElementById('vault-gesture-hint').textContent='Subtitle loaded: '+f.name}catch{document.getElementById('vault-gesture-hint').textContent='Could not load subtitle file.'}});
 let locked=false;const lock=document.getElementById('vault-lock-toggle');lock?.addEventListener('click',()=>{locked=!locked;video.controls=!locked;lock.textContent=locked?'Unlock controls':'Lock controls';document.getElementById('vault-gesture-hint').textContent=locked?'Player controls locked':''});
 let start=null,lastTap=0;video.addEventListener('touchstart',e=>{if(e.touches.length===1)start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});video.addEventListener('touchend',e=>{if(!start)return;const p=e.changedTouches[0],dx=p.clientX-start.x,dy=p.clientY-start.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3){video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+(dx>0?10:-10)));document.getElementById('vault-gesture-hint').textContent=dx>0?'+10 seconds':'−10 seconds'}else if(Math.abs(dx)<18&&Math.abs(dy)<18){const now=Date.now();if(now-lastTap<320){const r=video.getBoundingClientRect(),delta=p.clientX<r.left+r.width/2?-10:10;video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+delta));document.getElementById('vault-gesture-hint').textContent=delta>0?'+10 seconds':'−10 seconds';lastTap=0}else lastTap=now}start=null},{passive:true});
 document.querySelectorAll('[data-discover-genre]').forEach(b=>b.addEventListener('click',()=>window.MysteryVault?.discoverGenre?.(b.dataset.discoverGenre,b.dataset.genreName||'Discover')));
 const cardObserver=new MutationObserver(records=>{let addedCards=false;for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches?.('.card[data-card-type]')||node.querySelector?.('.card[data-card-type]')){addedCards=true;break}}if(addedCards)break}if(addedCards)syncButtons()});cardObserver.observe(document.body,{childList:true,subtree:true});renderWatch();renderContinue();syncButtons();loadRecommendations();
 const searchInput=document.getElementById('search'),searchHistory=document.getElementById('search-history-options');
 const SEARCH='mysteryVault.searchHistory.v1';
 function renderSearchHistory(){if(!searchHistory)return;searchHistory.replaceChildren();read(SEARCH).forEach(q=>{const o=document.createElement('option');o.value=q;searchHistory.append(o)})}
 document.getElementById('search-form')?.addEventListener('submit',()=>{const q=searchInput.value.trim();if(q.length>1){write(SEARCH,[q,...read(SEARCH).filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,12));renderSearchHistory()}},true);
 renderSearchHistory();

 function addSelectPopover(selectId, icon, mode) {
   const select=document.getElementById(selectId); if(!select||select.dataset.popoverReady)return;
   select.dataset.popoverReady='1';
   const host=document.createElement('div');host.className='vault-select-popover';
   const trigger=document.createElement('button');trigger.type='button';trigger.className='vault-select-trigger';
   trigger.setAttribute('aria-label',select.getAttribute('aria-label')||selectId);trigger.title=select.getAttribute('aria-label')||selectId;
   const menu=document.createElement('div');menu.className='vault-select-menu';menu.setAttribute('role','listbox');
   host.append(trigger,menu);select.parentElement.append(host);
   const labelFor=option=>{
     if(mode==='season'){const n=Number(option.value);return n===0?'Specials':'S'+String(n).padStart(2,'0')}
     if(mode==='episode'){const n=Number(option.value);return 'E'+String(n).padStart(2,'0')+(option.textContent?' · '+option.textContent:'')}
     return option.textContent||option.value;
   };
   const update=()=>{
     const current=select.selectedOptions?.[0];
     trigger.textContent=mode==='server'?icon:(current?labelFor(current).split(' · ')[0]:icon);
     menu.replaceChildren();
     Array.from(select.options).forEach(option=>{
       const item=document.createElement('button');item.type='button';item.className='vault-select-option';
       item.textContent=labelFor(option);item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));
       item.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));host.classList.remove('open');update()});
       menu.append(item);
     });
     trigger.disabled=!select.options.length||select.disabled;
   };
   trigger.addEventListener('click',()=>{
     document.querySelectorAll('.vault-select-popover.open').forEach(x=>{if(x!==host)x.classList.remove('open')});
     host.classList.toggle('open');
   });
   const observer=new MutationObserver(update);observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
   select.addEventListener('change',update);update();
 }
 addSelectPopover('vault-playback-speed','1×','speed');
 addSelectPopover('external-server-select','▤','server');
 addSelectPopover('player-season','S01','season');
 addSelectPopover('player-episode','E01','episode');
 document.addEventListener('click',event=>{
   if(!event.target.closest('.vault-select-popover'))document.querySelectorAll('.vault-select-popover.open').forEach(x=>x.classList.remove('open'));
 });

 const exportButton=document.getElementById('vault-export-backup'),importInput=document.getElementById('vault-import-backup'),diagButton=document.getElementById('vault-diagnostics'),diag=document.getElementById('vault-diagnostics-result');
 exportButton?.addEventListener('click',()=>{const payload={format:'mystery-vault-backup-v1',createdAt:new Date().toISOString(),watchlist:read(W),history:read(H),searchHistory:read(SEARCH)};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mystery-vault-backup.json';a.click();URL.revokeObjectURL(url)});
 importInput?.addEventListener('change',async()=>{const file=importInput.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='mystery-vault-backup-v1')throw new Error('This is not a Mystery Vault backup.');if(Array.isArray(data.watchlist))write(W,data.watchlist.slice(0,100));if(Array.isArray(data.history))write(H,data.history.slice(0,40));if(Array.isArray(data.searchHistory))write(SEARCH,data.searchHistory.slice(0,12));renderWatch();renderContinue();renderSearchHistory();syncButtons();loadRecommendations();diag.textContent='Backup restored successfully.'}catch(error){diag.textContent=error.message||'Could not import backup.'}finally{importInput.value=''}});
 diagButton?.addEventListener('click',async()=>{diag.textContent='Checking app services…';const checks=[];checks.push('Network: '+(navigator.onLine?'online':'offline'));checks.push('WebView: '+navigator.userAgent);checks.push('Video: '+(['video/mp4','video/webm'].map(t=>t+' '+(video.canPlayType(t)||'unsupported')).join(', ')));checks.push('MediaSource: '+(!!window.MediaSource));checks.push('Saved watchlist: '+read(W).length);checks.push('Watch history: '+read(H).length);try{const response=await fetch('/api/library',{cache:'no-store'});checks.push('Local API: '+(response.ok?'reachable':'HTTP '+response.status))}catch{checks.push('Local API: unavailable')}try{const estimate=await navigator.storage?.estimate?.();if(estimate)checks.push('Origin storage: '+Math.round(estimate.usage/1048576)+' / '+Math.round(estimate.quota/1048576)+' MB')}catch{}diag.textContent=checks.join(' · ')});

})();