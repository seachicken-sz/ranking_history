'use strict';

const FAVORITE_MANIFEST_URL = '../data_favorite/manifest.json';
const RANKING_MANIFEST_URL = '../data/manifest.json';
const COLORS = ['#335cff','#147d4f','#c43d4f','#9a5b00','#7a4bc2','#00879a','#b65f00','#5b6b7d'];

const state = {
  favoriteManifest: null,
  rankingManifest: null,
  favoriteRows: [],
  rankingRows: [],
  selectedProgramId: '',
  selectedEpisodeId: '',
  visibleEpisodes: new Set(),
  rankingCache: new Map()
};

const el = {};

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  bindEvents();
  await loadInitialData();
});

function cacheElements() {
  [
    'loadingPanel','loadingTitle','loadingDetail','appContent','programSelect','episodeSelect',
    'archiveUpdatedAt','emptyPanel','programView','episodeView','favoriteChart','favoriteTableBody',
    'likeLegend','likeCompareChart','episodeSummaryList','showAllSeriesButton','hideAllSeriesButton',
    'episodeTitle','episodeMeta','rankingCharts','episodeLikeChart','episodeHistoryHead','episodeHistoryBody'
  ].forEach((id) => { el[id] = document.getElementById(id); });
}

function bindEvents() {
  el.programSelect.addEventListener('change', async (event) => {
    state.selectedProgramId = String(event.target.value || '');
    state.selectedEpisodeId = '';
    await prepareSelectedProgram();
  });

  el.episodeSelect.addEventListener('change', (event) => {
    state.selectedEpisodeId = String(event.target.value || '');
    render();
  });

  el.showAllSeriesButton.addEventListener('click', () => {
    getSelectedEpisodes().forEach((episode) => state.visibleEpisodes.add(episode.episodeId));
    renderProgramView();
  });

  el.hideAllSeriesButton.addEventListener('click', () => {
    state.visibleEpisodes.clear();
    renderProgramView();
  });
}

async function loadInitialData() {
  try {
    const [favoriteManifest, rankingManifest] = await Promise.all([
      fetchJson(FAVORITE_MANIFEST_URL),
      fetchJson(RANKING_MANIFEST_URL)
    ]);

    state.favoriteManifest = favoriteManifest;
    state.rankingManifest = rankingManifest;
    const favoriteFiles = Array.isArray(favoriteManifest.files) ? favoriteManifest.files : [];

    for (let index = 0; index < favoriteFiles.length; index += 1) {
      el.loadingDetail.textContent = `${index + 1} / ${favoriteFiles.length}日分`;
      const json = await fetchJson(`../data_favorite/${favoriteFiles[index].path}`);
      state.favoriteRows.push(...(Array.isArray(json.rows) ? json.rows : []));
    }

    buildProgramSelect();
    el.archiveUpdatedAt.textContent = favoriteManifest.updatedAt ? `最終更新 ${favoriteManifest.updatedAt}` : '';
    el.loadingPanel.hidden = true;
    el.appContent.hidden = false;

    if (!state.favoriteRows.length) {
      el.emptyPanel.hidden = false;
      return;
    }

    state.selectedProgramId = el.programSelect.value;
    await prepareSelectedProgram();
  } catch (error) {
    console.error(error);
    el.loadingTitle.textContent = 'データを読み込めませんでした';
    el.loadingDetail.textContent = String(error.message || error);
  }
}

async function fetchJson(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} status=${response.status}`);
  return response.json();
}

function buildProgramSelect() {
  const map = new Map();
  state.favoriteRows.forEach((row) => {
    const programId = String(row.programId || row.programTitle || '').trim();
    const title = String(row.programTitle || '').trim();
    if (programId && title) map.set(programId, title);
  });

  el.programSelect.replaceChildren();
  Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ja')).forEach(([id, title]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = title;
    el.programSelect.appendChild(option);
  });
}

async function prepareSelectedProgram() {
  buildEpisodeSelect();
  const episodes = getSelectedEpisodes();
  state.visibleEpisodes = new Set(episodes.map((episode) => episode.episodeId));
  await loadRankingRowsForSelectedProgram();
  render();
}

function getSelectedProgramRows() {
  return state.favoriteRows.filter((row) => String(row.programId || row.programTitle || '') === state.selectedProgramId);
}

function getSelectedEpisodes() {
  const map = new Map();
  getSelectedProgramRows().forEach((row) => {
    const episodeId = String(row.episodeId || '').trim();
    if (!episodeId) return;
    if (!map.has(episodeId)) {
      map.set(episodeId, {
        episodeId,
        episodeTitle: String(row.episodeTitle || episodeId),
        broadcastAt: String(row.broadcastAt || '')
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => parseDate(b.broadcastAt) - parseDate(a.broadcastAt));
}

function buildEpisodeSelect() {
  el.episodeSelect.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = '番組全体';
  el.episodeSelect.appendChild(all);

  getSelectedEpisodes().forEach((episode) => {
    const option = document.createElement('option');
    option.value = episode.episodeId;
    option.textContent = `${episode.broadcastAt ? formatShortDate(episode.broadcastAt) + ' ' : ''}${episode.episodeTitle}`;
    el.episodeSelect.appendChild(option);
  });
  el.episodeSelect.value = state.selectedEpisodeId;
}

async function loadRankingRowsForSelectedProgram() {
  const rows = getSelectedProgramRows();
  const dates = rows.map((row) => dateKey(row.observedAt)).filter(Boolean).sort();
  if (!dates.length) { state.rankingRows = []; return; }
  const min = dates[0];
  const max = dates[dates.length - 1];
  const files = (state.rankingManifest.files || []).filter((file) => file.date >= min && file.date <= max);

  for (const file of files) {
    if (!state.rankingCache.has(file.date)) {
      const json = await fetchJson(`../data/${file.path}`);
      state.rankingCache.set(file.date, Array.isArray(json.rows) ? json.rows : []);
    }
  }

  const episodeIds = new Set(getSelectedEpisodes().map((episode) => episode.episodeId));
  const title = getSelectedProgramRows()[0]?.programTitle || '';
  state.rankingRows = files.flatMap((file) => state.rankingCache.get(file.date) || [])
    .filter((row) => episodeIds.has(String(row.episodeId || '')) || String(row.programTitle || '') === title);
}

function render() {
  el.programView.hidden = Boolean(state.selectedEpisodeId);
  el.episodeView.hidden = !state.selectedEpisodeId;
  if (state.selectedEpisodeId) renderEpisodeView();
  else renderProgramView();
}

function renderProgramView() {
  renderFavoriteChartAndTable();
  renderLikeComparison();
  renderEpisodeSummaries();
}

function renderFavoriteChartAndTable() {
  const rows = getSelectedProgramRows()
    .filter((row) => row.metricType === 'favorite' && Number.isFinite(Number(row.value)))
    .sort((a, b) => parseDate(a.observedAt) - parseDate(b.observedAt));
  drawLineChart(el.favoriteChart, [{ label: 'お気に入り', points: rows.map((row) => ({ x: parseDate(row.observedAt), y: Number(row.value) })) }], { xMode: 'date' });

  const episodes = getSelectedEpisodes();
  el.favoriteTableBody.replaceChildren();
  rows.slice().reverse().forEach((row, index, reversed) => {
    const previous = reversed[index + 1];
    const event = episodes.find((episode) => {
      const start = parseDate(episode.broadcastAt);
      const current = parseDate(row.observedAt);
      const before = previous ? parseDate(previous.observedAt) : -Infinity;
      return start && start <= current && start > before;
    });
    const tr = document.createElement('tr');
    if (event) tr.className = 'event-row';
    appendCells(tr, [row.observedAt || '-', formatNumber(row.value), previous ? signed(Number(row.value) - Number(previous.value)) : '-', event ? `配信開始：${event.episodeTitle}` : '-'], event ? 3 : -1);
    el.favoriteTableBody.appendChild(tr);
  });
}

function renderLikeComparison() {
  const episodes = getSelectedEpisodes();
  const series = episodes.map((episode) => {
    const rows = getSelectedProgramRows().filter((row) => row.metricType === 'like' && String(row.episodeId || '') === episode.episodeId).sort((a,b) => parseDate(a.observedAt)-parseDate(b.observedAt));
    const base = rows.length ? parseDate(rows[0].observedAt) : 0;
    return { episodeId: episode.episodeId, label: episode.episodeTitle, points: rows.map((row) => ({ x: (parseDate(row.observedAt)-base)/3600000, y: Number(row.value) })) };
  }).filter((item) => item.points.length && state.visibleEpisodes.has(item.episodeId));

  el.likeLegend.replaceChildren();
  episodes.forEach((episode, index) => {
    const label = document.createElement('label');
    label.className = 'series-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.visibleEpisodes.has(episode.episodeId);
    input.addEventListener('change', () => {
      if (input.checked) state.visibleEpisodes.add(episode.episodeId); else state.visibleEpisodes.delete(episode.episodeId);
      renderLikeComparison();
    });
    const color = document.createElement('span');
    color.className = 'series-color';
    color.style.background = COLORS[index % COLORS.length];
    label.append(input, color, document.createTextNode(episode.episodeTitle));
    el.likeLegend.appendChild(label);
  });
  drawLineChart(el.likeCompareChart, series, { xMode: 'hours' });
}

function renderEpisodeSummaries() {
  el.episodeSummaryList.replaceChildren();
  getSelectedEpisodes().forEach((episode) => {
    const likes = getSelectedProgramRows().filter((row) => row.metricType === 'like' && String(row.episodeId || '') === episode.episodeId).sort((a,b)=>parseDate(a.observedAt)-parseDate(b.observedAt));
    const rankings = state.rankingRows.filter((row) => String(row.episodeId || '') === episode.episodeId);
    const base = getRecordStart(episode.episodeId);
    const byType = groupBy(rankings, (row) => row.type);
    const button = document.createElement('button');
    button.className = 'episode-summary';
    button.type = 'button';
    const title = document.createElement('span'); title.className='episode-summary-title'; title.textContent=episode.episodeTitle;
    const meta = document.createElement('span'); meta.className='episode-summary-meta'; meta.textContent=`最終いいね ${likes.length ? formatNumber(likes.at(-1).value) + '（' + likes.at(-1).observedAt + '）' : '-'}`;
    const ranks = document.createElement('span'); ranks.className='episode-summary-ranks';
    Object.entries(byType).forEach(([type, rows]) => {
      const best = rows.reduce((min,row)=>Number(row.rank)<Number(min.rank)?row:min, rows[0]);
      const chip=document.createElement('span'); chip.className='rank-chip'; chip.textContent=`${rankingLabel(type)}：${best.rank}位 ${hourLabel(parseDate(best.observedAt)-base)}`; ranks.appendChild(chip);
    });
    button.append(title,meta,ranks);
    button.addEventListener('click',()=>{state.selectedEpisodeId=episode.episodeId;el.episodeSelect.value=episode.episodeId;render();});
    el.episodeSummaryList.appendChild(button);
  });
}

function renderEpisodeView() {
  const episode = getSelectedEpisodes().find((item) => item.episodeId === state.selectedEpisodeId);
  if (!episode) return;
  el.episodeTitle.textContent = episode.episodeTitle;
  el.episodeMeta.textContent = episode.broadcastAt ? `配信開始 ${episode.broadcastAt}` : '';
  const rankingRows = state.rankingRows.filter((row) => String(row.episodeId || '') === episode.episodeId);
  const byType = groupBy(rankingRows, (row) => row.type);
  const base = getRecordStart(episode.episodeId);
  el.rankingCharts.replaceChildren();

  Object.entries(byType).forEach(([type, rows]) => {
    const section = document.createElement('section'); section.className='panel ranking-chart-card';
    const heading=document.createElement('div'); heading.className='section-heading'; heading.innerHTML=`<div><p class="eyebrow">${rankingLabel(type)}</p><h2>${rankingLabel(type)}ランキング推移</h2></div>`;
    const scroll=document.createElement('div'); scroll.className='chart-scroll';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.classList.add('chart'); scroll.appendChild(svg); section.append(heading,scroll); el.rankingCharts.appendChild(section);
    drawLineChart(svg,[{label:rankingLabel(type),points:rows.sort((a,b)=>parseDate(a.observedAt)-parseDate(b.observedAt)).map((row)=>({x:(parseDate(row.observedAt)-base)/3600000,y:Number(row.rank)}))}],{xMode:'hours',rank:true});
  });

  const likes = getSelectedProgramRows().filter((row)=>row.metricType==='like'&&String(row.episodeId||'')===episode.episodeId).sort((a,b)=>parseDate(a.observedAt)-parseDate(b.observedAt));
  drawLineChart(el.episodeLikeChart,[{label:'いいね',points:likes.map((row)=>({x:(parseDate(row.observedAt)-base)/3600000,y:Number(row.value)}))}],{xMode:'hours'});
  renderEpisodeHistory(episode, rankingRows, likes, base);
}

function renderEpisodeHistory(episode, rankingRows, likes, base) {
  const types = Array.from(new Set(rankingRows.map((row)=>row.type)));
  el.episodeHistoryHead.innerHTML = `<tr><th>時間</th><th>取得日時</th>${types.map((type)=>`<th>${rankingLabel(type)}</th>`).join('')}<th>いいね</th><th>お気に入り</th></tr>`;
  el.episodeHistoryBody.replaceChildren();
  const times = Array.from(new Set([...rankingRows.map((r)=>r.observedAt),...likes.map((r)=>r.observedAt)])).sort((a,b)=>parseDate(a)-parseDate(b));
  const favorites = getSelectedProgramRows().filter((row)=>row.metricType==='favorite').sort((a,b)=>parseDate(a.observedAt)-parseDate(b.observedAt));
  times.forEach((time)=>{
    const tr=document.createElement('tr');
    const values=[hourLabel(parseDate(time)-base),time];
    types.forEach((type)=>{const row=nearestBefore(rankingRows.filter((r)=>r.type===type),time);values.push(row?`${row.rank}位`:'-');});
    const like=nearestBefore(likes,time); const favorite=nearestBefore(favorites,time);
    values.push(like?formatNumber(like.value):'-',favorite?formatNumber(favorite.value):'-');
    appendCells(tr,values);el.episodeHistoryBody.appendChild(tr);
  });
}

function drawLineChart(svg, series, options={}) {
  svg.replaceChildren();
  const width=1000,height=460,margin={top:24,right:24,bottom:60,left:72};
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const points=series.flatMap((s)=>s.points).filter((p)=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!points.length){appendSvg(svg,'text',{x:width/2,y:height/2,'text-anchor':'middle',class:'chart-axis'},'データがありません');return;}
  const minX=Math.min(...points.map((p)=>p.x)),maxX=Math.max(...points.map((p)=>p.x));
  const minY=options.rank?1:Math.min(...points.map((p)=>p.y));
  const maxY=options.rank?Math.max(50,...points.map((p)=>p.y)):Math.max(...points.map((p)=>p.y));
  const x=(v)=>margin.left+(maxX===minX?0.5:(v-minX)/(maxX-minX))*(width-margin.left-margin.right);
  const y=(v)=>margin.top+(options.rank?(v-minY)/(maxY-minY):(maxY===minY?0.5:(maxY-v)/(maxY-minY)))*(height-margin.top-margin.bottom);
  for(let i=0;i<6;i++){const ratio=i/5;const yy=margin.top+ratio*(height-margin.top-margin.bottom);appendSvg(svg,'line',{x1:margin.left,y1:yy,x2:width-margin.right,y2:yy,class:'chart-grid'});const value=options.rank?Math.round(minY+ratio*(maxY-minY)):Math.round(maxY-ratio*(maxY-minY));appendSvg(svg,'text',{x:margin.left-10,y:yy+4,'text-anchor':'end',class:'chart-axis'},options.rank?`${value}位`:formatNumber(value));}
  for(let i=0;i<6;i++){const ratio=i/5;const xx=margin.left+ratio*(width-margin.left-margin.right);const value=minX+ratio*(maxX-minX);appendSvg(svg,'text',{x:xx,y:height-24,'text-anchor':'middle',class:'chart-axis'},options.xMode==='date'?formatShortDateTime(value):`${Math.round(value)}h`);}
  series.forEach((s,index)=>{const color=COLORS[index%COLORS.length];appendSvg(svg,'polyline',{points:s.points.map((p)=>`${x(p.x)},${y(p.y)}`).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});s.points.forEach((p)=>appendSvg(svg,'circle',{cx:x(p.x),cy:y(p.y),r:4,fill:color}));});
}

function appendSvg(svg,name,attrs,text=''){const node=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));if(text)node.textContent=text;svg.appendChild(node);return node;}
function appendCells(tr,values,eventIndex=-1){values.forEach((value,index)=>{const td=document.createElement('td');if(index===eventIndex&&value!=='-'){const span=document.createElement('span');span.className='event-badge';span.textContent=value;td.appendChild(span);}else td.textContent=value;tr.appendChild(td);});}
function getRecordStart(episodeId){const times=[...getSelectedProgramRows().filter((r)=>String(r.episodeId||'')===episodeId).map((r)=>parseDate(r.observedAt)),...state.rankingRows.filter((r)=>String(r.episodeId||'')===episodeId).map((r)=>parseDate(r.observedAt))].filter(Boolean);return times.length?Math.min(...times):0;}
function nearestBefore(rows,time){const target=parseDate(time);return rows.filter((r)=>parseDate(r.observedAt)<=target&&target-parseDate(r.observedAt)<=5400000).sort((a,b)=>parseDate(b.observedAt)-parseDate(a.observedAt))[0]||null;}
function groupBy(rows,keyFn){return rows.reduce((result,row)=>{const key=keyFn(row);(result[key]||(result[key]=[])).push(row);return result;},{});}
function parseDate(value){const time=new Date(String(value||'').replace(/\//g,'-').replace(' ','T')).getTime();return Number.isFinite(time)?time:0;}
function dateKey(value){const time=parseDate(value);if(!time)return'';const d=new Date(time);return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;}
function formatShortDate(value){const t=typeof value==='number'?value:parseDate(value);if(!t)return'';const d=new Date(t);return`${d.getMonth()+1}/${d.getDate()}`;}
function formatShortDateTime(value){const d=new Date(value);return`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:00`;}
function formatNumber(value){return Number(value||0).toLocaleString('ja-JP');}
function signed(value){return value>0?`+${formatNumber(value)}`:formatNumber(value);}
function hourLabel(milliseconds){return`${Math.max(0,Math.floor(milliseconds/3600000))}時間目`;}
function rankingLabel(type){return({all:'総合',variety:'バラエティ',drama:'ドラマ',talk:'トーク',vtr:'VTR/ロケ',local:'ローカル'})[type]||type;}
