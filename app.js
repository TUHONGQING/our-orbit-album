import { createGalaxy } from './galaxy.js';
import { initCover } from './cover.js';
import { pickDailyPhotos, shanghaiDateKey } from './daily-selection.js';
import { atlasPoint, atlasPose, cardGalleryPose, clamp } from './photo-effects.js';
import * as cloud from './cloud-service.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const defaults = { name: 'OUR ORBIT', palette: 'pink', glow: 75, speed: 30, galaxyMotion: true };
const palettes = {
  pink: { bg: '#030208', panel: '#18101e', accent: '#f5b5e0', rgb: '238,155,216' },
  blue: { bg: '#080e20', panel: '#111a30', accent: '#bbcfff', rgb: '93,131,225' },
  violet: { bg: '#130e21', panel: '#211930', accent: '#d6bef1', rgb: '160,109,213' },
  teal: { bg: '#081a20', panel: '#122831', accent: '#b4e6da', rgb: '76,177,167' }
};
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('our-orbit-style') || '{}') }; } catch { /* Defaults stay usable when storage is unavailable. */ }
// Migrate only visual defaults once; existing photo storage and personalized text remain intact.
try { const version=localStorage.getItem('our-orbit-style-version');if(!version){settings.palette='pink';settings.glow=75;}if(version!=='3'){if(settings.name==='我们的星轨')settings.name='OUR ORBIT';delete settings.title;delete settings.subtitle;localStorage.setItem('our-orbit-style',JSON.stringify(settings));localStorage.setItem('our-orbit-style-version','3');} } catch { if(settings.name==='我们的星轨')settings.name='OUR ORBIT'; }
settings.palette = palettes[settings.palette] ? settings.palette : 'pink';
settings.glow = Math.min(100, Math.max(10, Number(settings.glow) || 60));
settings.speed = Math.min(100, Math.max(0, Number(settings.speed) || 0));
if (typeof settings.name !== 'string') settings.name = defaults.name;
const galaxy = createGalaxy($('#galaxy-canvas'));

let photos = [], albums = ['未分类', '一起旅行', '日常碎片', '特别的日子'];
let currentFilter = 'all', query = '', view = 'ring', page = 0;
let dailyKey = shanghaiDateKey(), collectionVisible = 60;
let rotating = !reducedMotion.matches, dragging = false, dragMoved = false;
let currentPhoto = null, detailSource = 'collection', db = null, loading = true, importing = false, saving = false;
let cloudUser = null, localRecords = [], lastLibraryRefresh = 0;
let frame = 0, lastTime = 0, stageWidth = 0, stageHeight = 0;
let inertiaFrame = 0, inertiaLastTime = 0, inertiaVelocity = 0, positionFrame = 0, wheelTimer = 0;
let spaceCards = [];
let galleryPosition = 0, chapter = 0, chapterTarget = 0, effectFrame = 0;
let camera = { x: 0, y: 0, z: 650 }, cameraTarget = { x: 0, y: 0, z: 650 };
let atlasFocusIndex = -1, atlasFocusPhoto = null;
let atlasPoints = [];
const ALBUM_PAGE_SIZE = 24, COLLECTION_BATCH = 60, urls = new Set();
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
function objectUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
function releasePhoto(photo) { for (const key of ['url', 'originalUrl']) if (photo[key]?.startsWith('blob:')) { URL.revokeObjectURL(photo[key]); urls.delete(photo[key]); } }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function openDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); stopLoop(); }
function closeDialog(dialog) { dialog.close(); startLoop(); }
$$('.close-dialog').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
$$('dialog').forEach(dialog => { dialog.addEventListener('close', () => { if (dialog.id === 'photo-dialog') currentPhoto = null; startLoop(); }); dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } }); });

// Local vector artwork deliberately stands in for the couple's photographs.
function artwork(index) {
  const colorSets = [['#30395d','#ce9f94','#101e35'],['#747e9a','#dec3ad','#333d5c'],['#273f4d','#b0b8a1','#112a36'],['#314461','#b59491','#172641'],['#7b7f96','#e3bc99','#373249'],['#586173','#c7c0ae','#263d4b'],['#29495a','#9ea7b4','#123447'],['#3e3656','#b69aa1','#1c233c'],['#50687a','#b6ccd3','#243849'],['#3e526b','#c4a894','#202f46']];
  const [a,b,c] = colorSets[index % colorSets.length];
  const scenes = [
    `<path d="M0 218Q65 194 135 210T320 202V400H0Z" fill="${c}"/><path d="M0 260Q90 239 174 260T320 246M0 306Q80 285 171 301T320 300" fill="none" stroke="${b}" opacity=".3"/><circle cx="221" cy="108" r="27" fill="${b}"/><path d="M202 135L230 135L254 220L180 220Z" fill="${b}" opacity=".12"/>`,
    `<path d="M0 261L87 145L156 237L235 119L320 246V400H0" fill="${a}"/><path d="M0 310L124 194L221 301L279 251L320 303V400H0" fill="${c}"/><path d="M180 390L157 311L192 281" stroke="${b}" stroke-width="6" fill="none" opacity=".6"/>`,
    `<path d="M0 270Q95 223 175 260T320 235V400H0" fill="${c}"/><path d="M0 330Q90 258 210 312T320 265" stroke="${b}" stroke-width="26" fill="none" opacity=".25"/><g stroke="${c}" stroke-width="6"><path d="M40 0V292M80 0V249M261 0V294M300 0V278"/></g><g fill="${c}"><ellipse cx="40" cy="70" rx="63" ry="120"/><ellipse cx="280" cy="50" rx="55" ry="140"/></g>`,
    `<path d="M0 265H320V400H0" fill="${c}"/><g fill="${c}"><path d="M28 155H82V302H28ZM99 105H171V302H99ZM184 190H245V302H184ZM252 128H310V302H252Z"/></g><g fill="${b}" opacity=".7"><path d="M41 176H49V184H41ZM65 202H73V210H65ZM112 127H120V135H112ZM144 152H152V160H144ZM112 203H120V211H112ZM198 213H206V221H198ZM269 154H277V162H269ZM293 179H301V187H293Z"/></g>`,
    `<path d="M0 252H320V400H0" fill="${c}"/><ellipse cx="160" cy="273" rx="115" ry="24" fill="${b}" opacity=".23"/><path d="M100 210H190V256Q145 294 100 256Z" fill="${b}"/><path d="M190 217Q230 208 221 241Q215 254 191 250" fill="none" stroke="${b}" stroke-width="9"/><path d="M135 191Q120 169 139 154M158 192Q174 171 157 151" fill="none" stroke="${b}" opacity=".5" stroke-width="2"/>`,
    `<rect x="53" y="51" width="214" height="260" fill="${c}"/><rect x="64" y="62" width="192" height="240" fill="${a}"/><path d="M65 225L124 174L176 239L256 175V302H65Z" fill="${b}" opacity=".35"/><path d="M160 62V301M65 185H255" stroke="${c}" stroke-width="10"/><path d="M0 311H320V400H0" fill="${c}"/><path d="M194 328H234L225 369H202Z" fill="${b}"/><path d="M214 328V270M214 302Q180 272 192 260Q218 268 214 302M214 292Q241 269 242 247Q214 249 214 292" fill="${c}" stroke="${c}" stroke-width="3"/>`,
    `<path d="M0 248Q130 218 320 240V400H0" fill="${c}"/><path d="M108 245L161 400H215L144 245Z" fill="${b}" opacity=".65"/><path d="M0 120L120 235M320 117L142 235" stroke="${c}" stroke-width="4"/><path d="M68 103V315M248 81V339" stroke="${c}" stroke-width="8"/><circle cx="230" cy="104" r="24" fill="${b}" opacity=".8"/>`,
    `<circle cx="218" cy="95" r="34" fill="${b}"/><circle cx="231" cy="84" r="33" fill="${a}"/><path d="M0 286L78 200L131 251L204 174L320 299V400H0" fill="${c}"/><path d="M0 334L100 275L194 325L265 269L320 302V400H0" fill="#0b142b" opacity=".55"/>`,
    `<path d="M0 265Q144 192 320 249V400H0" fill="${c}"/><path d="M40 168L78 96L115 168Z M203 189L247 104L290 189Z" fill="${c}"/><path d="M78 152V297M247 174V292" stroke="${c}" stroke-width="10"/><path d="M138 399Q216 314 159 262" stroke="${b}" stroke-width="22" fill="none" opacity=".45"/>`,
    `<path d="M0 285Q136 264 320 278V400H0" fill="${c}"/><path d="M50 228H270V244H50ZM68 244V313M253 244V313M49 193H271V209H49Z" fill="${c}"/><circle cx="127" cy="192" r="12" fill="${c}"/><circle cx="167" cy="186" r="12" fill="${c}"/><path d="M116 205H138L144 248H111ZM156 198H179L184 245H150Z" fill="${c}"/>`
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400"><defs><linearGradient id="s" x2=".2" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".065"/></feComponentTransfer></filter></defs><rect width="320" height="400" fill="url(#s)"/>${scenes[index % scenes.length]}<rect width="320" height="400" filter="url(#g)" opacity=".6"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const names = ['等海风，也等你','一起走过的山路','迷路也没关系','城市慢慢亮起来','周末，慢半拍','窗边的一小片晴天','下一站，还是你','把月亮留给今晚','走进绿色的夏天','就这样坐一会儿'];
const demos = names.map((caption,i) => ({ id: `demo-${i}`, caption, url: artwork(i), album: ['一起旅行','一起旅行','一起旅行','日常碎片','日常碎片','日常碎片','一起旅行','特别的日子','一起旅行','特别的日子'][i], date: '', favorite: false, demo: true }));
const atlasDemos = Array.from({length:240},(_,index)=>demos[index%demos.length]);
function allPhotos() { return photos.length ? photos : demos; }
function visiblePhotos() { return allPhotos().filter(p => (currentFilter === 'all' || (currentFilter === 'favorites' ? p.favorite : p.album === currentFilter)) && `${p.caption} ${p.date} ${p.album}`.toLocaleLowerCase().includes(query)); }

function applyStyle(persist = false) {
  const palette = palettes[settings.palette];
  const root = document.documentElement;
  for (const [key,value] of Object.entries({ '--bg':palette.bg, '--panel':palette.panel, '--accent':palette.accent, '--glow-rgb':palette.rgb, '--glow':settings.glow/100 })) root.style.setProperty(key,value);
  $('#brand-name').textContent = settings.name || defaults.name;
  $('#cover-name').textContent = settings.name || defaults.name;
  document.title = `${settings.name || defaults.name} · Memory`;
  $('meta[name="theme-color"]').content = palette.bg;
  $('#glow-output').value = `${settings.glow}%`;
  $('#speed-output').value = settings.speed === 0 ? '静静停留' : settings.speed < 45 ? '轻轻流动' : '自由旋转';
  galaxy.setAppearance({ color: palette.rgb, glow: settings.glow/100, motion: settings.galaxyMotion });
  if (persist) { try { localStorage.setItem('our-orbit-style', JSON.stringify(settings)); } catch { toast('浏览器未允许保存风格，当前预览仍然有效。'); } }
  updateMotion();
}
function populateStyle() { const form = $('#style-form'); for (const [key,value] of Object.entries(settings)) { const field=form.elements.namedItem(key);if(field){if(field.type==='checkbox')field.checked=Boolean(value);else field.value=value;} } }
$('#style-open').addEventListener('click', () => { populateStyle(); openDialog('#style-dialog'); });
$('#style-form').addEventListener('input', event => { const key = event.target.name; if (!(key in defaults)) return; settings[key] = event.target.type==='checkbox' ? event.target.checked : ['speed','glow'].includes(key) ? Number(event.target.value) : event.target.value; applyStyle(true); });
$('#style-form').addEventListener('submit', event => { event.preventDefault(); applyStyle(true); closeDialog($('#style-dialog')); toast('这片夜空，已经是你的样子了。'); });
$('#style-reset').addEventListener('click', () => { settings = {...defaults}; populateStyle(); applyStyle(true); });

function openDatabase() { return new Promise((resolve,reject) => { const request=indexedDB.open('our-orbit-album',1); request.onupgradeneeded=() => { request.result.createObjectStore('photos',{keyPath:'id'}); request.result.createObjectStore('meta'); }; request.onsuccess=() => resolve(request.result); request.onerror=() => reject(request.error); request.onblocked=() => reject(new Error('请关闭其他相册页面后重试')); }); }
function databaseOperation(storeName, mode, action) { return new Promise((resolve,reject) => { if (!db) { reject(new Error('浏览器存储未就绪')); return; } const transaction=db.transaction(storeName,mode); let result; const request=action(transaction.objectStore(storeName)); request.onsuccess=() => { result=request.result; }; transaction.oncomplete=() => resolve(result); transaction.onabort=() => reject(transaction.error || new Error('保存未完成')); transaction.onerror=() => reject(transaction.error || new Error('存储失败')); }); }
function photoRecord(photo) { const { url,originalUrl,...record }=photo; return record; }
async function savePhoto(photo) { await cloud.savePhoto(photo); }
function storageError() { toast('云端未能保存，请检查网络后重试，并保留原始文件。'); }
function updateCloudAccount() {
  $('#cloud-account').textContent = cloudUser ? `${cloudUser.username || '已登录'} · 退出` : '登录私人相册';
  $('.local-note').textContent = cloudUser ? '云端共享相册 · 仅两人可访问' : '请登录查看你们的照片';
  $('#migrate-local').hidden = !cloudUser || !localRecords.length;
}
async function refreshLibrary() {
  if (!cloudUser) return;
  const library = await cloud.loadLibrary();
  for (const photo of photos) releasePhoto(photo);
  photos = library.photos;
  albums = [...new Set(['未分类','一起旅行','日常碎片','特别的日子',...library.albums,...photos.map(p => p.album)])];
  lastLibraryRefresh = Date.now();
  render();
}
async function init() {
  applyStyle(); populateStyle(); render();
  try {
    db=await openDatabase();
    localRecords=(await databaseOperation('photos','readonly',store=>store.getAll())).filter(record=>!record.cloudId);
  } catch { db=null; }
  try { cloudUser=await cloud.restoreSession(); if(cloudUser)await refreshLibrary(); }
  catch { cloudUser=null; toast('云端连接未就绪，请稍后重试。'); }
  loading=false; updateCloudAccount(); render();
  if(!cloudUser && document.body.dataset.screen!=='cover')openDialog('#login-dialog');
}
$('#cloud-account').addEventListener('click', async () => {
  if (!cloudUser) { openDialog('#login-dialog'); return; }
  await cloud.logout(); cloudUser=null;
  for (const photo of photos) releasePhoto(photo);
  photos=[]; updateCloudAccount(); render(); openDialog('#login-dialog');
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form=event.currentTarget,button=$('button[type=submit]',form);
  button.disabled=true;
  try {
    cloudUser=await cloud.login(form.elements.username.value.trim(),form.elements.password.value);
    form.elements.password.value='';
    await refreshLibrary(); updateCloudAccount(); closeDialog($('#login-dialog'));
    toast('欢迎回来，我们的回忆已经同步。');
  } catch(error) { cloudUser=null; $('#login-error').textContent=error.message || '登录失败，请重试'; }
  finally { button.disabled=false; }
});

function renderFilters() {
  const container=$('#album-filters');container.replaceChildren();
  for (const [id,label] of [['all','全部回忆'],['favorites','♡ 心动收藏'],...albums.map(name=>[name,name])]) {
    const button=el('button','',label);button.setAttribute('aria-pressed',String(currentFilter===id));button.addEventListener('click',()=>{currentFilter=id;page=0;collectionVisible=COLLECTION_BATCH;render();});container.append(button);
  }
}
function render() {
  const list=visiblePhotos();
  page=Math.min(page,Math.max(0,Math.ceil(albums.length/ALBUM_PAGE_SIZE)-1));
  const daily=pickDailyPhotos(list,dailyKey,100);
  const presentation=view==='atlas'?(photos.length?list:atlasDemos):daily;
  $('#demo-label').textContent=view==='grid'?`${albums.length} 本相册 · 选择一本翻看`:view==='atlas'?(photos.length?`全部 ${list.length} 张 · 立体穿梭`:'示例空间 · 导入后展示你们的全部照片'):photos.length?`今日精选 ${daily.length} / ${list.length} 张`:'示例插画 · 等待你们的照片';
  $('#photo-count').textContent=`${list.length} ${photos.length ? '个片段' : '幅示例插画'}`;
  $('#collection-title').firstChild.textContent=currentFilter==='all'?'所有回忆':currentFilter==='favorites'?'心动收藏':currentFilter;
  renderFilters();
  if(document.body.dataset.screen==='album')renderSpace(presentation);
  if(document.body.dataset.screen==='collection')renderGrid(list);
  $('#empty').hidden=!!list.length;
  $('#empty-text').textContent=currentFilter==='favorites' ? '轻点照片上的爱心，留住最喜欢的瞬间。' : query ? '换个词试试，或者查看全部回忆。' : '放入第一张照片，让故事从这里开始。';
  $('#empty-import').hidden=currentFilter==='favorites'||!!query;
  $('#import-open').disabled=loading||importing;$('#empty-import').disabled=loading||importing;
}
function renderSpace(list) {
  const space=$('#photo-space');space.replaceChildren();
  atlasFocusIndex=-1;atlasFocusPhoto=null;$('#atlas-focus-info').hidden=true;
  if(view==='grid'){renderAlbumCovers(space);return;}
  for (const [index,photo] of list.entries()) {
    const button=el('button','space-photo');button.setAttribute('aria-label',`查看：${photo.caption}`);
    if(view==='atlas'){
      const aspect=clamp(photo.width&&photo.height?photo.width/photo.height:[.72,1.32,1,.8,1.54][index%5],.58,1.8);
      button.style.setProperty('--ratio-width',Math.sqrt(aspect).toFixed(3));
      button.style.setProperty('--ratio-height',(1/Math.sqrt(aspect)).toFixed(3));
      if(view==='atlas'&&photo.demo)button.style.filter=`hue-rotate(${(index*29)%120-60}deg)`;
    }
    const img=el('img');img.src=photo.url;img.alt='';img.draggable=false;img.decoding='async';img.loading='lazy';button.append(img,el('span','',photo.caption));
    button.addEventListener('click',()=>{if(dragMoved)return;if(view==='atlas')focusAtlas(index,photo);else showPhoto(photo.id,'daily');});
    button.addEventListener('focus',stopLoop);button.addEventListener('blur',startLoop);space.append(button);
  }
  spaceCards=[...space.children];
  $('#space-count').textContent=view==='atlas'?photos.length?`全部 ${list.length} 张`:`示例 ${list.length} 张`:list.length?`今日 ${list.length} 张`:'暂无照片';
  $('#page-prev').hidden=$('#page-next').hidden=true;
  measureStage();startLoop();
}
function renderAlbumCovers(space) {
  spaceCards=[];
  const start=page*ALBUM_PAGE_SIZE,group=albums.slice(start,start+ALBUM_PAGE_SIZE);
  for(const [index,name] of group.entries()){
    const members=allPhotos().filter(photo=>photo.album===name);
    const tile=el('button','album-tile');tile.setAttribute('aria-label',`打开相册：${name}`);
    const artwork=el('div','album-cover');
    if(members.length){const img=el('img');img.src=members[0].url;img.alt='';img.loading='lazy';artwork.append(img);}
    else{artwork.classList.add('album-cover-empty');artwork.append(el('span','','✧'));}
    artwork.append(el('span','album-cover-index',`${String(start+index+1).padStart(2,'0')} / ALBUM`));
    const info=el('div','album-tile-info'),copy=el('div');copy.append(el('h3','',name),el('p','',members.length?`${members.length} ${photos.length?'张照片':'幅示例插画'}`:'等待第一张回忆'));
    info.append(copy,el('span','album-tile-arrow','↗'));tile.append(artwork,info);
    tile.addEventListener('click',()=>{location.hash=`#collection?album=${encodeURIComponent(name)}`;});space.append(tile);
  }
  $('#space-count').textContent=`${albums.length} 个相册`;
  $('#page-prev').hidden=$('#page-next').hidden=false;
  $('#page-prev').disabled=page===0;$('#page-next').disabled=start+ALBUM_PAGE_SIZE>=albums.length;
  stopLoop();measureStage();
}
function renderGrid(list) {
  const grid=$('#photo-grid');grid.replaceChildren();
  for (const photo of list.slice(0,collectionVisible)) {
    const card=el('article','memory-card'),imageBox=el('div','memory-image');
    const open=el('button','memory-open');open.setAttribute('aria-label',`查看：${photo.caption}`);
    const image=el('img');image.src=photo.url;image.alt=photo.caption;image.loading='lazy';image.width=400;image.height=300;open.append(image);open.addEventListener('click',()=>showPhoto(photo.id,'collection'));
    const favorite=el('button','memory-favorite',photo.favorite?'♥':'♡');favorite.setAttribute('aria-label',`${photo.favorite?'取消收藏':'收藏'}：${photo.caption}`);favorite.setAttribute('aria-pressed',String(photo.favorite));favorite.addEventListener('click',()=>toggleFavorite(photo.id));
    imageBox.append(open,favorite);
    const meta=el('div','memory-meta'),text=el('div');text.append(el('h3','',photo.caption),el('p','',photo.demo?'示例插画 · 可导入你们的照片':photo.date.replaceAll('-',' . ')));meta.append(text,el('span','',photo.album));card.append(imageBox,meta);grid.append(card);
  }
  const remaining=Math.max(0,list.length-collectionVisible);
  $('#load-more').hidden=!remaining;
  if(remaining)$('#load-more').textContent=`再看 ${Math.min(COLLECTION_BATCH,remaining)} 张回忆 ↓`;
}
function measureStage() {
  stageWidth=$('#stage').clientWidth;stageHeight=$('#stage').clientHeight;
  if(view==='atlas')atlasPoints=spaceCards.map((_,index)=>atlasPoint(index,stageWidth,stageHeight));
  positionCards();
}
function clearAtlasFocus(resetCamera=false) {
  atlasFocusIndex=-1;atlasFocusPhoto=null;$('#atlas-focus-info').hidden=true;
  if(resetCamera)cameraTarget={x:0,y:0,z:650};
  requestEffects();
}
function focusAtlas(index,photo) {
  if(atlasFocusIndex===index){showPhoto(photo.id,photo.demo?'daily':'collection');return;}
  const point=atlasPoints[index]||atlasPoint(index,stageWidth,stageHeight);
  const focal=stageHeight*1.35,targetFactor=stageWidth<680?2.35:2.9;
  atlasFocusIndex=index;atlasFocusPhoto=photo;
  cameraTarget={x:point.x,y:point.y,z:point.z+focal/targetFactor-focal};
  $('#atlas-focus-title').textContent=photo.caption;
  $('#atlas-focus-info').hidden=false;
  requestEffects();
}
$('#atlas-focus-open').addEventListener('click',()=>{if(atlasFocusPhoto)showPhoto(atlasFocusPhoto.id,atlasFocusPhoto.demo?'daily':'collection');});
$('#atlas-focus-back').addEventListener('click',()=>clearAtlasFocus(true));
function positionCards() {
  if(view==='grid'||!stageWidth||!stageHeight)return;
  spaceCards.forEach((card,index)=>{
    const pose=view==='ring'
      ?cardGalleryPose(index,spaceCards.length,galleryPosition,chapter,stageWidth,stageHeight)
      :atlasPose(index,camera,stageWidth,stageHeight,spaceCards.length,atlasPoints[index]);
    if(card.hidden===pose.visible)card.hidden=!pose.visible;
    if(!pose.visible)return;
    card.style.transform=`translate(-50%,-50%) translate3d(${pose.x.toFixed(2)}px,${pose.y.toFixed(2)}px,0) rotateY(${pose.ry.toFixed(2)}deg) rotateZ(${pose.rz.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
    card.style.zIndex=String(Math.round(100000+pose.depth));
    const focused=view==='atlas'&&atlasFocusIndex>=0;
    const selected=focused&&index===atlasFocusIndex;
    card.classList.toggle('is-focused',selected);
    card.style.opacity=(focused&&!selected?pose.opacity*.035:pose.opacity).toFixed(3);
    card.style.pointerEvents=focused&&!selected?'none':'auto';
  });
}
function schedulePosition() { if(!positionFrame)positionFrame=requestAnimationFrame(()=>{positionFrame=0;positionCards();}); }
function tickEffects() {
  effectFrame=0;
  const ease=reducedMotion.matches?1:.16;
  chapter+=(chapterTarget-chapter)*ease;
  for(const key of ['x','y','z'])camera[key]+=(cameraTarget[key]-camera[key])*ease;
  const moving=Math.abs(chapterTarget-chapter)>.001||['x','y','z'].some(key=>Math.abs(cameraTarget[key]-camera[key])>.08);
  if(!moving){chapter=chapterTarget;camera={...cameraTarget};}
  positionCards();
  if(moving)effectFrame=requestAnimationFrame(tickEffects);
}
function requestEffects() { if(!effectFrame)effectFrame=requestAnimationFrame(tickEffects); }
function setChapter(next) {
  chapterTarget=clamp(next,0,3);
  $$('[data-chapter]',$('.ring-chapters')).forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.chapter)===Math.round(chapterTarget))));
  requestEffects();
}
$$('[data-chapter]',$('.ring-chapters')).forEach(button=>button.addEventListener('click',()=>setChapter(Number(button.dataset.chapter))));
$('#atlas-home').addEventListener('click',()=>clearAtlasFocus(true));
function canAnimate() { return document.body.dataset.screen==='album' && rotating && settings.speed>0 && view==='ring' && !dragging && !inertiaFrame && !document.hidden && !document.querySelector('dialog[open]') && !$('#photo-space').contains(document.activeElement); }
function animate(time) { frame=0;if(!canAnimate())return;if(lastTime)galleryPosition+=Math.min(time-lastTime,50)*(.000008+settings.speed*.0000008)*24/(Math.PI*2);lastTime=time;positionCards();frame=requestAnimationFrame(animate); }
function stopLoop() { cancelAnimationFrame(frame);cancelAnimationFrame(inertiaFrame);frame=0;inertiaFrame=0;lastTime=0;inertiaLastTime=0; }
function startLoop() { if(!frame&&canAnimate())frame=requestAnimationFrame(animate); }
function animateInertia(time) {
  if(document.body.dataset.screen!=='album'||view!=='ring'||document.hidden||document.querySelector('dialog[open]')){stopLoop();return;}
  if(inertiaLastTime){const dt=Math.min(time-inertiaLastTime,40);galleryPosition+=inertiaVelocity*dt;inertiaVelocity*=Math.pow(.91,dt/16.67);positionCards();}
  inertiaLastTime=time;
  if(Math.abs(inertiaVelocity)>.00012)inertiaFrame=requestAnimationFrame(animateInertia);
  else{inertiaFrame=0;inertiaLastTime=0;startLoop();}
}
function updateMotion() { const active=rotating&&settings.speed>0;$('#motion-toggle').textContent=active?'Ⅱ':'▷';$('#motion-toggle').setAttribute('aria-label',active?'暂停旋转':'开始旋转');$('#motion-toggle').setAttribute('aria-pressed',String(active));if(active)startLoop();else stopLoop(); }
$('#motion-toggle').addEventListener('click',()=>{rotating=!(rotating&&settings.speed>0);if(rotating&&settings.speed===0){settings.speed=30;applyStyle(true);}updateMotion();});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){rotating=false;updateMotion();}requestEffects();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLoop();else startLoop();});
new ResizeObserver(measureStage).observe($('#stage'));
$$('[data-view]', $('.view-controls')).forEach(button=>button.addEventListener('click',()=>{
  view=button.dataset.view;page=0;$('#stage').dataset.view=view;
  touchPoints.clear();pinch=null;dragging=false;activePointer=null;
  if(view==='atlas'){camera={x:0,y:0,z:650};cameraTarget={...camera};}
  $('#motion-toggle').hidden=view!=='ring';
  $$('[data-view]',$('.view-controls')).forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('#interaction-hint').textContent=view==='grid'?'选择一本相册，展开这一段回忆':view==='atlas'?'视频开头效果 · 拖动穿行 · 滚轮缩放 · 点击照片飞近':'左右拖动浏览照片 · 上下滚动切换展开方式';
  $('#stage').setAttribute('aria-label',view==='atlas'?'全部照片的立体空间':view==='grid'?'相册分类':'照片星轨');
  $('#stage').tabIndex=view==='grid'?-1:0;
  render();if(view==='grid')stopLoop();else startLoop();
}));
let pointerStartX=0,pointerStartY=0,previousX=0,previousY=0,previousTime=0,pointerVelocity=0,activePointer=null,dragAxis=null,pinch=null;
const touchPoints=new Map();
const minimumCameraZ=()=>-Math.max(2200,Math.ceil(spaceCards.length/20)*430+600);
$('#stage').addEventListener('pointerdown',event=>{
  if(view==='grid'||event.button!==0||event.target.closest('.effect-toolbar,.atlas-focus-info'))return;
  if(view==='atlas'&&event.pointerType==='touch'){
    touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touchPoints.size===2){
      const [a,b]=[...touchPoints.values()];
      pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),z:cameraTarget.z};
      dragMoved=true;dragAxis='pinch';$('#stage').setPointerCapture(event.pointerId);
      return;
    }
  }
  dragging=true;dragMoved=false;dragAxis=null;
  pointerStartX=previousX=event.clientX;pointerStartY=previousY=event.clientY;
  previousTime=event.timeStamp;pointerVelocity=0;activePointer=event.pointerId;stopLoop();
});
$('#stage').addEventListener('pointermove',event=>{
  if(touchPoints.has(event.pointerId)){
    touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch&&touchPoints.size===2){
      const [a,b]=[...touchPoints.values()];
      if(view==='atlas'&&atlasFocusIndex>=0)clearAtlasFocus();
      cameraTarget.z=clamp(pinch.z-(Math.hypot(a.x-b.x,a.y-b.y)-pinch.distance)*4,minimumCameraZ(),1800);
      requestEffects();return;
    }
  }
  if(!dragging||event.pointerId!==activePointer)return;
  const totalX=event.clientX-pointerStartX,totalY=event.clientY-pointerStartY;
  if(!dragMoved&&Math.hypot(totalX,totalY)>6){dragMoved=true;dragAxis=Math.abs(totalX)>Math.abs(totalY)?'horizontal':'vertical';$('#stage').setPointerCapture(event.pointerId);}
  if(dragMoved){
    const dx=event.clientX-previousX,dy=event.clientY-previousY,dt=Math.max(8,Math.min(event.timeStamp-previousTime,48));
    if(view==='ring'){
      if(dragAxis==='horizontal'){
        const delta=-dx/(stageWidth<680?42:75);galleryPosition+=delta;
        pointerVelocity=clamp(pointerVelocity*.6+delta/dt*.4,-.065,.065);schedulePosition();
      }else setChapter(chapterTarget+dy/(stageWidth<680?150:190));
    }else{
      if(view==='atlas'&&atlasFocusIndex>=0)clearAtlasFocus();
      const factor=Math.max(.5,Math.abs(camera.z)/650);
      cameraTarget.x-=dx*factor;cameraTarget.y-=dy*factor;requestEffects();
    }
  }
  previousX=event.clientX;previousY=event.clientY;previousTime=event.timeStamp;
});
function endDrag(event) {
  touchPoints.delete(event.pointerId);
  if(pinch){
    if(touchPoints.size){
      const [id,point]=touchPoints.entries().next().value;
      activePointer=id;previousX=point.x;previousY=point.y;previousTime=event.timeStamp;
      pinch=null;dragAxis=null;return;
    }
    pinch=null;
  }
  if(event.pointerId!==activePointer)return;
  const glide=view==='ring'&&dragAxis==='horizontal'&&dragMoved&&event.type==='pointerup'&&!reducedMotion.matches&&event.timeStamp-previousTime<100&&Math.abs(pointerVelocity)>.0003;
  if(view==='ring'&&dragAxis==='vertical')setChapter(Math.round(chapterTarget));
  dragging=false;activePointer=null;
  if(glide){inertiaVelocity=pointerVelocity;inertiaLastTime=0;inertiaFrame=requestAnimationFrame(animateInertia);}
  else startLoop();
  setTimeout(()=>{dragMoved=false;},0);
}
document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);
$('#stage').addEventListener('wheel',event=>{
  if(view==='grid'||document.body.dataset.screen!=='album'||event.target.closest('.effect-toolbar,.atlas-focus-info'))return;
  event.preventDefault();
  const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
  if(view==='atlas'){
    if(view==='atlas'&&atlasFocusIndex>=0)clearAtlasFocus();
    if(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))cameraTarget.x+=delta*1.3;
    else cameraTarget.z=clamp(cameraTarget.z-delta*1.65,minimumCameraZ(),1800);
    requestEffects();
  }else if(Math.abs(event.deltaX)>Math.abs(event.deltaY)){
    stopLoop();galleryPosition+=event.deltaX/(stageWidth<680?48:82);schedulePosition();clearTimeout(wheelTimer);wheelTimer=setTimeout(startLoop,350);
  }else setChapter(chapterTarget+clamp(delta,-180,180)*.006);
},{passive:false});
$('#stage').addEventListener('keydown',event=>{
  if(view==='grid'||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('.effect-toolbar,.atlas-focus-info'))return;
  if(view==='ring'){
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();galleryPosition+=event.key==='ArrowRight'?1:-1;schedulePosition();}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setChapter(Math.round(chapterTarget)+(event.key==='ArrowDown'?1:-1));}
    else if(event.key==='Home'){event.preventDefault();galleryPosition=0;setChapter(0);schedulePosition();}
  }else{
    if(view==='atlas'&&event.key==='Escape'){event.preventDefault();clearAtlasFocus(true);return;}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();cameraTarget.x+=(event.key==='ArrowRight'?1:-1)*160;requestEffects();}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();cameraTarget.z+=event.key==='ArrowDown'?-330:330;requestEffects();}
    else if(event.key==='Home'){event.preventDefault();clearAtlasFocus(true);}
  }
});
$('#page-prev').addEventListener('click',()=>{page=Math.max(0,page-1);render();});$('#page-next').addEventListener('click',()=>{page++;render();});
$('#search').addEventListener('input',event=>{query=event.target.value.trim().toLocaleLowerCase();page=0;collectionVisible=COLLECTION_BATCH;render();});
$('#load-more').addEventListener('click',()=>{collectionVisible+=COLLECTION_BATCH;renderGrid(visiblePhotos());});
function refreshDailyKey() {
  const todayKey=shanghaiDateKey();
  if(todayKey===dailyKey)return;
  dailyKey=todayKey;
  if(document.body.dataset.screen==='album')render();
}
setInterval(refreshDailyKey,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshDailyKey();if(cloudUser&&Date.now()-lastLibraryRefresh>8*60*1000)refreshLibrary().catch(()=>toast('云端刷新失败，请稍后重试。'));}});

async function toggleFavorite(id) {
  if(saving)return;
  const photo=allPhotos().find(p=>p.id===id);if(!photo)return;
  saving=true;
  try { const updated={...photo,favorite:!photo.favorite};if(!photo.demo)await savePhoto(updated);photo.favorite=updated.favorite;render();if(currentPhoto===id)refreshFavorite(photo); }
  catch{storageError();}finally{saving=false;}
}
function refreshFavorite(photo) { $('#photo-favorite').textContent=photo.favorite?'♥ 已收藏':'♡ 收藏';$('#photo-favorite').setAttribute('aria-pressed',String(photo.favorite)); }
function showPhoto(id,source=detailSource) {
  const photo=allPhotos().find(p=>p.id===id);if(!photo)return;
  currentPhoto=id;detailSource=source;const image=$('#detail-image');
  image.src=photo.originalUrl||photo.url;image.alt=photo.caption;
  if (!photo.demo && !photo.originalUrl && cloudUser) {
    cloud.signedUrl(photo.id,photo.viewOriginal===false?'display':'original').then(url=>{ if(currentPhoto===id&&url)image.src=url; }).catch(()=>toast('原图暂时无法载入，请重试。'));
  }
  const form=$('#detail-form');form.elements.caption.value=photo.caption;form.elements.date.value=photo.date;
  form.elements.album.replaceChildren(...albums.map(name=>{const option=el('option','',name);option.value=name;return option;}));form.elements.album.value=photo.album;
  for(const name of ['caption','date','album'])form.elements[name].disabled=!!photo.demo;
  $('#photo-save').hidden=!!photo.demo;$('#photo-delete').hidden=!!photo.demo;$('#photo-download').hidden=!!photo.demo;
  $('#detail-label').textContent=photo.demo?'ILLUSTRATION / 示例插画':'OUR MEMORY / 我们的回忆';
  $('#detail-note').textContent=photo.demo?'这些插画用于预览风格。导入照片后，这里会换成你们的回忆。':'这张照片保存在你们的私人云相册。请另外保留原图备份。';
  refreshFavorite(photo);openDialog('#photo-dialog');
}
function adjacentPhoto(direction) { const list=detailSource==='daily'?pickDailyPhotos(visiblePhotos(),dailyKey,100):visiblePhotos();if(!list.length)return;const index=list.findIndex(p=>p.id===currentPhoto);const next=index<0?0:(index+direction+list.length)%list.length;showPhoto(list[next].id); }
$('#photo-prev').addEventListener('click',()=>adjacentPhoto(-1));$('#photo-next').addEventListener('click',()=>adjacentPhoto(1));
$('#photo-dialog').addEventListener('keydown',event=>{if(event.target.matches('input,textarea,select'))return;if(event.key==='ArrowLeft'){event.preventDefault();adjacentPhoto(-1);}if(event.key==='ArrowRight'){event.preventDefault();adjacentPhoto(1);}});
$('#photo-favorite').addEventListener('click',()=>toggleFavorite(currentPhoto));
$('#detail-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving)return;const photo=photos.find(p=>p.id===currentPhoto);if(!photo)return;
  const form=event.currentTarget,caption=form.elements.caption.value.trim();if(!caption){toast('给这一刻起一个名字吧。');return;}
  saving=true;$('#photo-save').disabled=true;
  try { const updated={...photo,caption,date:form.elements.date.value,album:form.elements.album.value};await savePhoto(updated);Object.assign(photo,updated);render();toast('这一刻，记下了。');closeDialog($('#photo-dialog')); }catch{storageError();}finally{saving=false;$('#photo-save').disabled=false;}
});
$('#photo-download').addEventListener('click',async()=>{const photo=photos.find(p=>p.id===currentPhoto);if(!photo)return;try{const previewOnly=photo.originalReady===false;const url=photo.originalUrl||await cloud.signedUrl(photo.id,previewOnly?'display':'original');if(!url)throw new Error();const link=el('a');link.href=url;link.download=previewOnly?(photo.filename||'memory').replace(/\.[^.]+$/,'')+'.webp':photo.filename||'memory.jpg';link.target='_blank';document.body.append(link);link.click();link.remove();if(previewOnly)toast('原文件同步中，已下载清晰预览图。');}catch{toast('照片下载暂时不可用，请稍后再试。');}});
$('#photo-delete').addEventListener('click',()=>openDialog('#delete-dialog'));
$('#delete-confirm').addEventListener('click',async()=>{if(saving)return;const photo=photos.find(p=>p.id===currentPhoto);if(!photo)return;saving=true;$('#delete-confirm').disabled=true;try{await cloud.removePhoto(photo.id);photos=photos.filter(p=>p.id!==photo.id);releasePhoto(photo);closeDialog($('#delete-dialog'));closeDialog($('#photo-dialog'));render();toast('已从共同相册移除。');}catch{storageError();}finally{saving=false;$('#delete-confirm').disabled=false;}});

$('#album-create').addEventListener('click',()=>{ $('#album-form').reset();openDialog('#album-dialog'); });
$('#album-form').addEventListener('submit',async event=>{
  event.preventDefault();const name=event.currentTarget.elements.albumName.value.trim();if(!name)return;
  if(['all','favorites'].includes(name)||albums.includes(name)){toast('这个名字已经使用，请换一个名字。');return;}
  const button=$('button[type=submit]',event.currentTarget);button.disabled=true;
  try{if(!cloudUser){openDialog('#login-dialog');return;}const next=[...albums,name];await cloud.createAlbum(name);albums=next;currentFilter=name;query='';$('#search').value='';page=0;render();closeDialog($('#album-dialog'));toast(`相册「${name}」建好了，导入照片就会放进这里。`);}catch{storageError();}finally{button.disabled=false;}
});
function chooseFiles() { if(loading||importing)return;if(!cloudUser){openDialog('#login-dialog');return;}$('#file-input').click(); }
$('#import-open').addEventListener('click',chooseFiles);$('#empty-import').addEventListener('click',chooseFiles);
async function makeThumbnail(file) {
  const url=URL.createObjectURL(file),image=new Image();
  try {
    image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('无法读取图片');
    const resize=async max=>{const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('无法生成预览')),'image/webp',.84));};
    const [thumbnail,display]=await Promise.all([resize(480),resize(1600)]);
    return {thumbnail,display,width:image.naturalWidth,height:image.naturalHeight};
  }finally{URL.revokeObjectURL(url);}
}
$('#file-input').addEventListener('change',async event=>{
  if(importing||!cloudUser)return;const files=[...event.target.files];event.target.value='';if(!files.length)return;
  if(files.length>1000){toast('一次最多导入 1000 张照片，请分批选择。');return;}
  importing=true;$('#import-open').disabled=true;$('#empty-import').disabled=true;
  const album=albums.includes(currentFilter)?currentFilter:'未分类';let imported=0,unsupported=0,oversized=0,failed=0;
  for(const [index,file] of files.entries()){
    $('#import-open').textContent=`正在放入 ${index+1}/${files.length}`;
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){unsupported++;continue;}
    if(file.size>25*1024*1024){oversized++;continue;}
    try {
      const preview=await makeThumbnail(file);
      const record=await cloud.uploadPhoto(file,preview,{album,date:today()});
      photos.unshift(record);imported++;
    }catch{failed++;}
  }
  importing=false;$('#import-open').replaceChildren(el('span','','＋'),document.createTextNode(' 放入回忆'));
  if(imported){if(currentFilter==='favorites')currentFilter='all';query='';$('#search').value='';page=0;}
  render();
  const notes=[`已上传到共同相册 ${imported} 张照片`];if(unsupported)notes.push(`${unsupported} 张格式不支持`);if(oversized)notes.push(`${oversized} 张超过 25 MB`);if(failed)notes.push(`${failed} 张未保存，请检查网络后重试`);
  toast(notes.join('；')+'。日期默认今天，可在照片详情修改。');
});
$('#migrate-local').addEventListener('click',async()=>{
  if(!cloudUser||!localRecords.length||importing)return;
  importing=true;$('#migrate-local').disabled=true;
  let copied=0,failed=0;
  for(const [index,record] of localRecords.entries()){
    $('#migrate-local').textContent=`正在同步旧照片 ${index+1}/${localRecords.length}`;
    try{
      const file=new File([record.blob],record.filename||'memory.jpg',{type:record.blob.type||'image/jpeg'});
      const preview=await makeThumbnail(file);
      const result=await cloud.uploadPhoto(file,preview,{caption:record.caption,date:record.date,album:record.album,favorite:record.favorite,createdAt:record.createdAt});
      await databaseOperation('photos','readwrite',store=>store.put({...record,cloudId:result.id}));
      record.cloudId=result.id;
      copied++;
    }catch{failed++;}
  }
  importing=false;$('#migrate-local').disabled=false;$('#migrate-local').textContent='同步这台电脑以前导入的照片';
  localRecords=localRecords.filter(record=>!record.cloudId);
  await refreshLibrary();
  toast(`已同步 ${copied} 张旧照片${failed?`；${failed} 张失败，请保留本机原图`:''}。`);
});
// Keep object URLs valid when the browser restores this document from its back/forward cache.
// Removed photos are revoked explicitly; the browser releases remaining URLs on document disposal.
window.addEventListener('pagehide',stopLoop);
window.addEventListener('pageshow',startLoop);
initCover({
  onScreenChange(isAlbum,screen){
    galaxy.setActive(isAlbum);
    if(screen==='album'){dailyKey=shanghaiDateKey();currentFilter='all';query='';$('#search').value='';page=0;render();requestAnimationFrame(measureStage);startLoop();if(!loading&&!cloudUser)openDialog('#login-dialog');}else stopLoop();
  },
  onFavorites(){currentFilter='favorites';query='';$('#search').value='';page=0;collectionVisible=COLLECTION_BATCH;render();},
  onCollection(category){currentFilter=category||'all';query='';$('#search').value='';page=0;collectionVisible=COLLECTION_BATCH;render();}
});
init();

