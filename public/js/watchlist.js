'use strict';
const KEY='mystery-vault-watchlist-v1';
const grid=document.getElementById('watchlist-grid');
const fallback='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#18213a"/><text x="200" y="300" fill="#a78bfa" font-size="52" text-anchor="middle">✦</text></svg>');
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}}
function write(v){localStorage.setItem(KEY,JSON.stringify(v));render()}
function render(){
  const items=read(); grid.innerHTML='';
  if(!items.length){grid.innerHTML='<div class="watchlist-empty">Your watchlist is empty.<br><a class="nav-link" style="display:inline-flex;margin-top:16px" href="/">Search for something to watch</a></div>';return}
  items.forEach(item=>{
    const el=document.createElement('article');el.className='watchlist-item';
    const img=document.createElement('img');img.className='poster';img.src=item.poster||fallback;img.alt='';img.loading='lazy';img.onerror=()=>{img.src=fallback};
    const info=document.createElement('div');info.className='info';
    const title=document.createElement('div');title.className='title';title.textContent=item.title||'Untitled';
    const meta=document.createElement('div');meta.className='meta';meta.textContent=[item.year,item.provider,item.mediaType==='tv'?'Series':item.mediaType==='movie'?'Movie':item.quality].filter(Boolean).join(' · ');
    const actions=document.createElement('div');actions.className='watchlist-actions';
    const open=document.createElement('a');open.href='/?q='+encodeURIComponent(item.title);open.textContent='Open search';
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>write(read().filter(x=>x.id!==item.id)));
    actions.append(open,remove);info.append(title,meta,actions);el.append(img,info);grid.append(el);
  });
}
document.getElementById('clear-watchlist').addEventListener('click',()=>{if(read().length&&confirm('Clear the entire watchlist?'))write([])});
const theme=document.getElementById('theme-toggle'),root=document.documentElement;
const savedTheme=localStorage.getItem('mystery-vault-theme')||'dark';root.dataset.theme=savedTheme;
theme.innerHTML=savedTheme==='dark'?'☼ <span>Light mode</span>':'☾ <span>Dark mode</span>';
theme.addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;localStorage.setItem('mystery-vault-theme',next);theme.innerHTML=next==='dark'?'☼ <span>Light mode</span>':'☾ <span>Dark mode</span>'});
render();