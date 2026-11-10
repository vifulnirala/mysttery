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

 const genreFeeds=[
   {id:9648,name:'Mystery',grid:document.getElementById('genre-mystery-grid')},
   {id:10749,name:'Romance',grid:document.getElementById('genre-romance-grid')},
   {id:27,name:'Horror',grid:document.getElementById('genre-horror-grid')},
   {id:16,name:'Animation',grid:document.getElementById('genre-animation-grid')},
   {id:35,name:'Comedy',grid:document.getElementById('genre-comedy-grid')}
 ];
 async function loadGenreFeed(feed){
   try{
     const response=await fetch('/api/discover?genreId='+feed.id,{cache:'no-store'});
     const data=await response.json();if(!response.ok)throw new Error(data.error||'Unavailable');
     renderTmdbShelf(feed.grid,Array.isArray(data.results)?data.results:[], 'No '+feed.name.toLowerCase()+' titles found.');
   }catch{renderTmdbShelf(feed.grid,[],'Could not load '+feed.name.toLowerCase()+' titles.')}
 }
 Promise.all(genreFeeds.map(loadGenreFeed));


 function renderWatch(){const items=read(W);watch.replaceChildren();if(!items.length){watch.innerHTML='<div class="empty">Your watchlist is waiting for its first mystery.</div>';return}items.forEach(item=>{const card=document.createElement('article');card.className='card';const img=document.createElement('img');img.src=item.posterUrl||item.poster||'';img.alt='';img.loading='lazy';const wrap=document.createElement('div');wrap.className='poster-wrap';wrap.append(img);const info=document.createElement('div');info.className='card-info';const title=document.createElement('div');title.className='card-title';title.textContent=item.title||'Saved title';const open=document.createElement('button');open.className='vault-watch-btn';open.textContent='▶ Open';open.onclick=()=>window.MysteryVault?.openItem(item);const remove=document.createElement('button');remove.className='vault-watch-btn';remove.textContent='Remove';remove.onclick=()=>{write(W,read(W).filter(x=>key(x)!==key(item)));renderWatch();syncButtons();loadRecommendations()};info.append(title,open,remove);card.append(wrap,info);watch.append(card)})}
 function syncButtons(root=document){const saved=new Set(read(W).map(key));root.querySelectorAll('.card[data-card-type]').forEach(card=>{const info=card.querySelector('.card-info'),item=get(card);if(!info||!item)return;let b=info.querySelector('.vault-watch-btn[data-watch]');if(!b){b=document.createElement('button');b.type='button';b.className='vault-watch-btn';b.dataset.watch='1';info.append(b)}const yes=saved.has(key(item));b.classList.toggle('is-saved',yes);const label=yes?'♥ Saved':'♡ Watchlist';if(b.textContent!==label)b.textContent=label})}
 document.addEventListener('click',e=>{const b=e.target.closest('.vault-watch-btn[data-watch]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const item=get(b.closest('.card'));if(!item)return;const a=read(W),exists=a.some(x=>key(x)===key(item));write(W,exists?a.filter(x=>key(x)!==key(item)):[item,...a].slice(0,100));syncButtons();renderWatch();loadRecommendations()},true);
 function renderContinue(){const items=read(H).filter(x=>x.kind==='external'||(x.progress>0&&x.progress<.95)).slice(0,10);cont.replaceChildren();if(!items.length){cont.innerHTML='<div class="empty">Your unfinished streams will appear here.</div>';return}items.forEach(x=>{const card=document.createElement('article');card.className='card';const info=document.createElement('div');info.className='card-info';const title=document.createElement('div');title.className='card-title';title.textContent=x.title||'Continue watching';if(x.kind==='external'){const meta=document.createElement('div');meta.className='section-note';meta.textContent=x.item?.mediaType==='tv'&&x.item.season!=null?'External player · S'+String(x.item.season).padStart(2,'0')+' E'+String(x.item.episode||1).padStart(2,'0'):'External player';info.append(title,meta)}else{const bar=document.createElement('div');bar.className='vault-progress';const fill=document.createElement('span');fill.style.width=Math.round(x.progress*100)+'%';bar.append(fill);info.append(title,bar)}const resume=document.createElement('button');resume.className='vault-watch-btn';resume.textContent='▶ Resume';resume.onclick=()=>{if(x.kind==='torrent')window.MysteryVault?.playFile(x.source,x.fileIndex,x.title,x.position);else if(x.item)window.MysteryVault?.openItem(x.item)};info.append(resume);card.append(info);cont.append(card)})}
 let active=null,last=0;
 window.addEventListener('mysteryvault:play',e=>{const d=e.detail||{};active=d.kind==='torrent'?{kind:'torrent',source:d.source,fileIndex:d.fileIndex,title:d.fileName,key:d.source+'|'+d.fileIndex,progress:0,position:0}:{kind:'external',title:d.title,key:(d.payload?.mediaType+'|'+d.payload?.id+'|'+(d.payload?.season??'')+'|'+(d.payload?.episode??'')),progress:0.01,position:0};if(d.payload)active.item={tmdbId:d.payload.id,mediaType:d.payload.mediaType,title:d.title,season:d.payload.season,episode:d.payload.episode};const a=read(H);write(H,[active,...a.filter(x=>x.key!==active.key)].slice(0,40));renderContinue();loadRecommendations()});
 video.addEventListener('timeupdate',()=>{if(!active||!video.duration||Date.now()-last<2500)return;last=Date.now();active.position=video.currentTime;active.progress=Math.min(.99,video.currentTime/video.duration);const a=read(H);const i=a.findIndex(x=>x.key===active.key);if(i>=0)a[i]=active;write(H,a);renderContinue()});
 video.addEventListener('ended',()=>{if(active){write(H,read(H).filter(x=>x.key!==active.key));active=null;renderContinue()}});
 document.getElementById('vault-playback-speed')?.addEventListener('change',e=>{video.playbackRate=Number(e.target.value)||1});
 document.getElementById('vault-subtitle-file')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{let t=await f.text();if(f.name.toLowerCase().endsWith('.srt'))t='WEBVTT\n\n'+t.replace(/^(\d+)\r?\n/gm,'').replace(/,(\d{3})/g,'.$1');const u=URL.createObjectURL(new Blob([t],{type:'text/vtt'}));video.querySelectorAll('track[data-vault]').forEach(x=>x.remove());const tr=document.createElement('track');tr.kind='subtitles';tr.label=f.name;tr.srclang='en';tr.src=u;tr.default=true;tr.dataset.vault='1';video.append(tr);document.getElementById('vault-gesture-hint').textContent='Subtitle loaded: '+f.name}catch{document.getElementById('vault-gesture-hint').textContent='Could not load subtitle file.'}});
 let locked=false;
 const lock=document.getElementById('vault-lock-toggle');
 const mediaStages=[];
 function wrapMedia(media){
   if(!media)return;
   if(media.parentElement?.classList.contains('vault-media-stage'))return;
   const stage=document.createElement('div');
   stage.className='vault-media-stage';
   media.parentNode.insertBefore(stage,media);
   stage.appendChild(media);
   const shield=document.createElement('div');
   shield.className='vault-player-lock-shield';
   shield.hidden=true;
   shield.setAttribute('aria-hidden','true');
   stage.appendChild(shield);
   mediaStages.push({stage,shield});
 }
 wrapMedia(video);
 wrapMedia(document.getElementById('external-player-frame'));
 function setPlayerLocked(value){
   locked=Boolean(value);
   video.controls=!locked;
   mediaStages.forEach(({shield})=>{shield.hidden=!locked});
   lock?.setAttribute('aria-pressed',String(locked));
   lock?.setAttribute('aria-label',locked?'Unlock player interactions':'Lock player interactions');
   lock?.setAttribute('title',locked?'Unlock player interactions':'Lock player interactions');
   document.getElementById('vault-gesture-hint').textContent=locked?'Player locked':'';
 }
 lock?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setPlayerLocked(!locked)});
 let start=null,lastTap=0,brightness=Number(localStorage.getItem('mysteryVault.brightness')||1);
 video.style.filter=`brightness(${brightness})`;
 const gestureHint=document.getElementById('vault-gesture-hint');
 const bufferStatus=document.getElementById('vault-buffer-status');
 function updateBufferStatus(){if(!video.duration||!video.buffered.length){bufferStatus.textContent='';return}let end=0;for(let i=0;i<video.buffered.length;i++){if(video.buffered.start(i)<=video.currentTime+0.5)end=Math.max(end,video.buffered.end(i))}bufferStatus.textContent='Buffered '+Math.max(0,Math.floor(end-video.currentTime))+'s ahead'}
 video.addEventListener('progress',updateBufferStatus);video.addEventListener('timeupdate',updateBufferStatus);
 video.addEventListener('waiting',()=>{bufferStatus.textContent='Buffering…'});video.addEventListener('playing',updateBufferStatus);video.addEventListener('loadedmetadata',updateBufferStatus);
 video.addEventListener('touchstart',e=>{if(locked)return;if(e.touches.length===1)start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
 video.addEventListener('touchend',e=>{
   if(locked){start=null;return}
   if(!start)return;const p=e.changedTouches[0],dx=p.clientX-start.x,dy=p.clientY-start.y,r=video.getBoundingClientRect();
   if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3){video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+(dx>0?10:-10)));gestureHint.textContent=dx>0?'+10 seconds':'−10 seconds'}
   else if(Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)*1.3){
     if(p.clientX<r.left+r.width/2){brightness=Math.max(.35,Math.min(1.5,brightness+(dy<0?.08:-.08)));video.style.filter=`brightness(${brightness})`;localStorage.setItem('mysteryVault.brightness',String(brightness));gestureHint.textContent='Brightness '+Math.round(brightness*100)+'%'}
     else{video.muted=false;video.volume=Math.max(0,Math.min(1,video.volume+(dy<0?.08:-.08)));gestureHint.textContent='Volume '+Math.round(video.volume*100)+'%'}
   }else if(Math.abs(dx)<18&&Math.abs(dy)<18){const now=Date.now();if(now-lastTap<320){const delta=p.clientX<r.left+r.width/2?-10:10;video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+delta));gestureHint.textContent=delta>0?'+10 seconds':'−10 seconds';lastTap=0}else lastTap=now}
   start=null
 },{passive:true});
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
   host.append(trigger,menu);
   // Keep the custom popup outside the player/iframe stacking context. An iframe
   // is a separate compositing layer, so a popup nested beside it can appear
   // to open while actually being painted underneath the iframe.
   document.body.appendChild(host);
   host.style.position='fixed';
   host.style.zIndex='2147483647';
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
   function positionMenu(){
     if(!host.classList.contains('open'))return;
     const r=trigger.getBoundingClientRect();
     const margin=8;
     const menuRect=menu.getBoundingClientRect();
     const menuWidth=Math.min(menuRect.width || 250, window.innerWidth-margin*2);
     const menuHeight=menuRect.height || 220;
     const left=Math.min(Math.max(margin,r.left),window.innerWidth-menuWidth-margin);
     let top=r.top-menuHeight-7;
     if(top<margin)top=Math.min(r.bottom+7,window.innerHeight-menuHeight-margin);
     host.style.left=Math.round(r.left)+'px';
     host.style.top=Math.round(r.top)+'px';
     host.style.width=Math.round(r.width)+'px';
     host.style.height=Math.round(r.height)+'px';
     menu.style.left=Math.round(left-r.left)+'px';
     menu.style.top=Math.round(top-r.top)+'px';
     menu.style.right='auto';
     menu.style.bottom='auto';
   }
   trigger.addEventListener('click',()=>{
     document.querySelectorAll('.vault-select-popover.open').forEach(x=>{if(x!==host)x.classList.remove('open')});
     host.classList.toggle('open');
     requestAnimationFrame(positionMenu);
   });
   window.addEventListener('resize',positionMenu,{passive:true});
   window.addEventListener('scroll',positionMenu,{passive:true,capture:true});
   const observer=new MutationObserver(update);observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
   select.addEventListener('change',update);update();
 }
 addSelectPopover('vault-playback-speed','1×','speed');
 addSelectPopover('player-season','S01','season');
 addSelectPopover('player-episode','E01','episode');
 document.addEventListener('click',event=>{
   if(!event.target.closest('.vault-select-popover'))document.querySelectorAll('.vault-select-popover.open').forEach(x=>x.classList.remove('open'));
 });

 const exportButton=document.getElementById('vault-export-backup'),importInput=document.getElementById('vault-import-backup'),importBackupButton=document.getElementById('vault-import-backup-button'),diagButton=document.getElementById('vault-diagnostics'),diag=document.getElementById('vault-diagnostics-result');
 importBackupButton?.addEventListener('click',()=>importInput?.click());
 exportButton?.addEventListener('click',()=>{const payload={format:'mystery-vault-backup-v1',createdAt:new Date().toISOString(),watchlist:read(W),history:read(H),searchHistory:read(SEARCH)};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mystery-vault-backup.json';a.click();URL.revokeObjectURL(url)});
 importInput?.addEventListener('change',async()=>{const file=importInput.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='mystery-vault-backup-v1')throw new Error('This is not a Mystery Vault backup.');if(Array.isArray(data.watchlist))write(W,data.watchlist.slice(0,100));if(Array.isArray(data.history))write(H,data.history.slice(0,40));if(Array.isArray(data.searchHistory))write(SEARCH,data.searchHistory.slice(0,12));renderWatch();renderContinue();renderSearchHistory();syncButtons();loadRecommendations();diag.textContent='Backup restored successfully.'}catch(error){diag.textContent=error.message||'Could not import backup.'}finally{importInput.value=''}});
 diagButton?.addEventListener('click',async()=>{diag.textContent='Checking app services…';const checks=[];checks.push('Network: '+(navigator.onLine?'online':'offline'));checks.push('WebView: '+navigator.userAgent);checks.push('Video: '+(['video/mp4','video/webm'].map(t=>t+' '+(video.canPlayType(t)||'unsupported')).join(', ')));checks.push('MediaSource: '+(!!window.MediaSource));checks.push('Saved watchlist: '+read(W).length);checks.push('Watch history: '+read(H).length);try{const response=await fetch('/api/library',{cache:'no-store'});checks.push('Local API: '+(response.ok?'reachable':'HTTP '+response.status))}catch{checks.push('Local API: unavailable')}try{const estimate=await navigator.storage?.estimate?.();if(estimate)checks.push('Origin storage: '+Math.round(estimate.usage/1048576)+' / '+Math.round(estimate.quota/1048576)+' MB')}catch{}diag.textContent=checks.join(' · ')});

})();