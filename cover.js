const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

export function initCover({ onScreenChange, onFavorites, onCollection }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const videos = $$('.cover-video');
  let selected = 0, paused = reduced.matches, clockTimer = 0, waitingTimer = 0;
  const isCover = () => document.body.dataset.screen === 'cover';
  const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false });

  function updateClock() {
    $('#cover-clock').textContent = `SHANGHAI ${clockFormat.format(new Date())}`;
    $('#cover-clock').dateTime = new Date().toISOString();
  }
  function clockState() { clearInterval(clockTimer); updateClock(); if (isCover()&&!document.hidden) clockTimer=setInterval(updateClock,1000); }
  function updateMotionButton() { $('#cover-motion').textContent=paused?'▷ 播放动态':'Ⅱ 暂停动态';$('#cover-motion').setAttribute('aria-pressed',String(!paused));$('#cover-motion').setAttribute('aria-label',paused?'播放封面动态':'暂停封面动态'); }
  function activateVideo(index) {
    if(index!==selected)return;
    clearTimeout(waitingTimer);
    videos.forEach((video,i)=>video.classList.toggle('active',i===index));
    $('#cover-media-note').textContent='';
    syncVideo();
  }
  function syncVideo() {
    videos.forEach((video,index)=>{
      if(index!==selected||paused||!isCover()||document.hidden){video.pause();return;}
      video.muted=true;
      video.play().catch(()=>{
        if(selected===index&&isCover()&&!document.hidden&&!paused){
          paused=true;updateMotionButton();
          if(!video.error)$('#cover-media-note').textContent='轻点播放，唤醒动态封面';
        }
      });
    });
  }
  function selectSlide(index) {
    selected=index;
    $('#cover').dataset.slide=String(index);
    document.documentElement.style.setProperty('--cover-accent',index===0?'#F598F2':'#ffffff');
    $$('[data-cover-slide]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.coverSlide)===index)));
    const video=videos[index];
    if(video.readyState>=2){activateVideo(index);return;}
    clearTimeout(waitingTimer);
    $('#cover-media-note').textContent='';
    waitingTimer=setTimeout(()=>{if(selected===index&&video.readyState<2)$('#cover-media-note').textContent='动态封面载入中，可以先进入相册';},6500);
    video.preload='auto';
    if(video.error)video.load();
    syncVideo();
  }
  videos.forEach((video,index)=>{
    video.muted=true;
    video.addEventListener('loadeddata',()=>activateVideo(index));
    video.addEventListener('error',()=>{if(selected===index){clearTimeout(waitingTimer);$('#cover-media-note').textContent='动态封面暂未载入，仍可进入相册';}});
  });
  $$('[data-cover-slide]').forEach(button=>button.addEventListener('click',()=>selectSlide(Number(button.dataset.coverSlide))));
  $('#cover-motion').addEventListener('click',()=>{paused=!paused;updateMotionButton();syncVideo();});
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;updateMotionButton();syncVideo();}});

  function closeMenu() { $('.cover-menu-toggle').setAttribute('aria-expanded','false');$('.cover-menu-toggle').innerHTML='Menu <span aria-hidden="true">＋</span>';$('#cover-mobile-menu').classList.remove('open');$('#cover-mobile-menu').inert=true; }
  $('.cover-menu-toggle').addEventListener('click',()=>{
    const open=$('.cover-menu-toggle').getAttribute('aria-expanded')!=='true';
    if(!open){closeMenu();return;}
    $('.cover-menu-toggle').setAttribute('aria-expanded','true');$('.cover-menu-toggle').innerHTML='Close <span aria-hidden="true">−</span>';$('#cover-mobile-menu').inert=false;$('#cover-mobile-menu').classList.add('open');
  });
  $('#cover-mobile-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();$('.cover-menu-toggle').focus();}});

  const descriptions = {
    about: { title:'只属于我们的片刻', paragraphs:['一起看过的海，随手拍下的晚霞，还有那些说不清为什么喜欢的日常，都值得被好好收藏。','进入星空后，可以拖动照片、创建相册，或在“调整风格”中写下你们自己的话。'] },
    storage: { title:'让回忆，安心留下来', paragraphs:['登录私人相册后，网页导入的照片会上传到云端，你们两人可以在各自设备查看。','云端相册仍需要续费和备份，请保留电脑或移动硬盘上的原图。','这台电脑以前导入的照片可以在登录后手动同步；同步前它们仍保存在原浏览器中。'] }
  };
  $$('[data-info]').forEach(button=>button.addEventListener('click',()=>{
    const info=descriptions[button.dataset.info];closeMenu();$('#cover-info-title').textContent=info.title;
    $('#cover-info-content').replaceChildren(...info.paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    $('#cover-info-dialog').showModal();
  }));
  $('#info-enter').addEventListener('click',()=>$('#cover-info-dialog').close());

  function route(initial=false) {
    const hash=location.hash.split('?')[0];
    const category=new URLSearchParams(location.hash.split('?')[1]||'').get('album');
    const collection=hash==='#collection'||hash==='#favorites';
    const screen=collection?'collection':hash==='#album'?'album':'cover';
    const album=screen!=='cover';
    const changed=document.body.dataset.screen!==screen;
    $('#cover').hidden=album;$('#album-shell').hidden=!album;document.body.dataset.screen=screen;
    $('.universe').hidden=screen!=='album';$('#collection').hidden=!collection;
    if(collection)$('.nav-albums').setAttribute('aria-current','page');else $('.nav-albums').removeAttribute('aria-current');
    closeMenu();
    onScreenChange(album,screen);
    if(hash==='#favorites')onFavorites();
    else if(collection)onCollection(category);
    if(changed||initial||collection) {
      window.scrollTo({top:0,behavior:'instant'});
      if(album&&!initial)$(collection?'#collection-title':'#stage').focus({preventScroll:true});
    }
    clockState();syncVideo();
  }
  $('.nav-albums').addEventListener('click',event=>{if(location.hash==='#collection'){event.preventDefault();route();}});
  window.addEventListener('hashchange',()=>route());
  document.addEventListener('visibilitychange',()=>{clockState();syncVideo();});
  window.addEventListener('pagehide',()=>{clearInterval(clockTimer);clearTimeout(waitingTimer);videos.forEach(video=>video.pause());});
  window.addEventListener('pageshow',()=>{clockState();syncVideo();});
  updateMotionButton();selectSlide(0);route(true);
}
