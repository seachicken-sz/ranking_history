'use strict';

const MANIFEST_URL = './data/manifest.json';

const state = {
  manifest: null,
  rows: [],
  snapshots: [],
  snapshotIndex: -1,
  rankingType: '',
  viewMode: 'snapshot',
  filter: 'all',
  snapshotSearch: '',
  historySearch: '',
  programSearch: '',
  selectedProgram: '',
  failedFiles: []
};

const elements = {};
const CHART_COLORS = ['#335cff','#147d4f','#c43d4f','#9a5b00','#7a4bc2','#00879a','#b65f00','#5b6b7d','#d14f8f','#4d7c0f'];

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  loadAllData();
});

function cacheElements() {
  [
    'loadingPanel','loadingTitle','loadingProgress','progressBar','appContent',
    'latestUpdatedAt','previousSnapshotButton','nextSnapshotButton',
    'currentObservedAt','snapshotPosition','snapshotSearchInput',
    'clearSnapshotSearchButton','snapshotSearchResultText','historyModePanel',
    'snapshotModePanel','graphModePanel','historySearchInput','clearHistorySearchButton',
    'historySearchResultText','historyPeriodRange','rankingTabs','warningMessage',
    'rankedCount','upCount','newCount','outCount','rankingTypeLabel',
    'rankingTableTitle','tableNote','historyTimeHeader','rankingTableBody',
    'emptyRankingMessage','outSection','outList','snapshotDateSelect',
    'programSearchInput','programSelect','graphResultText','rankingSummary',
    'rankingTableSection','graphSection','graphRankingTypeLabel','graphTitle',
    'graphLegend','programChart','emptyGraphMessage'
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });

  elements.viewModeTabs = Array.from(document.querySelectorAll('[data-view-mode]'));
  elements.filterCards = Array.from(document.querySelectorAll('[data-filter]'));
}

function bindEvents() {
  elements.viewModeTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.viewMode = button.dataset.viewMode || 'snapshot';
      render();
    });
  });

  elements.filterCards.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter || 'all';
      render();
    });
  });

  elements.previousSnapshotButton.addEventListener('click', () => moveSnapshot(-1));
  elements.nextSnapshotButton.addEventListener('click', () => moveSnapshot(1));

  elements.snapshotDateSelect.addEventListener('change', (event) => {
    moveToDate(String(event.target.value || ''));
  });

  elements.snapshotSearchInput.addEventListener('input', (event) => {
    state.snapshotSearch = normalizeText(event.target.value);
    elements.clearSnapshotSearchButton.disabled = !state.snapshotSearch;
    render();
  });

  elements.clearSnapshotSearchButton.addEventListener('click', () => {
    elements.snapshotSearchInput.value = '';
    state.snapshotSearch = '';
    elements.clearSnapshotSearchButton.disabled = true;
    render();
  });

  elements.historySearchInput.addEventListener('input', (event) => {
    state.historySearch = normalizeText(event.target.value);
    elements.clearHistorySearchButton.disabled = !state.historySearch;
    render();
  });

  elements.clearHistorySearchButton.addEventListener('click', () => {
    elements.historySearchInput.value = '';
    state.historySearch = '';
    elements.clearHistorySearchButton.disabled = true;
    render();
  });

  elements.programSearchInput.addEventListener('input', (event) => {
    state.programSearch = normalizeText(event.target.value);
    buildProgramSelect();
    renderGraph();
  });

  elements.programSelect.addEventListener('change', (event) => {
    state.selectedProgram = String(event.target.value || '');
    renderGraph();
  });
}

async function loadAllData() {
  try {
    updateLoading('manifestを読み込んでいます', 0, 1);

    const manifestResponse = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!manifestResponse.ok) {
      throw new Error(`manifest取得失敗 status=${manifestResponse.status}`);
    }

    const manifest = await manifestResponse.json();
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    state.manifest = manifest;
    state.rows = [];
    state.failedFiles = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      updateLoading('ランキング履歴を読み込んでいます', index, files.length);

      try {
        const response = await fetch(`./data/${file.path}`, {
          cache: isRecentFile(file.date) ? 'no-store' : 'default'
        });

        if (!response.ok) throw new Error(`status=${response.status}`);

        const json = await response.json();
        const rows = Array.isArray(json.rows) ? json.rows : [];
        state.rows.push(...rows);
      } catch (error) {
        console.error(file.path, error);
        state.failedFiles.push(file.path);
      }
    }

    updateLoading('ランキング履歴を構築しています', files.length, files.length);
    state.snapshots = buildSnapshots(state.rows);
    state.snapshotIndex = state.snapshots.length - 1;
    state.rankingType = getRankingTypes()[0] || '';

    elements.latestUpdatedAt.textContent = manifest.updatedAt || '--';
    elements.historyPeriodRange.textContent = buildPeriodRange();
    buildDateSelect();
    buildRankingTabs();
    buildProgramSelect();

    elements.loadingPanel.hidden = true;
    elements.appContent.hidden = false;

    if (state.failedFiles.length) {
      elements.warningMessage.hidden = false;
      elements.warningMessage.textContent = `${state.failedFiles.length}日分の取得に失敗しました。取得できた履歴のみ表示しています。`;
    }

    render();
  } catch (error) {
    console.error(error);
    elements.loadingTitle.textContent = 'ランキング履歴を読み込めませんでした';
    elements.loadingProgress.textContent = String(error.message || error);
    elements.progressBar.style.width = '100%';
  }
}

function updateLoading(title, current, total) {
  elements.loadingTitle.textContent = title;
  elements.loadingProgress.textContent = total > 0 ? `${current} / ${total}日分` : '';
  elements.progressBar.style.width = `${total > 0 ? Math.round((current / total) * 100) : 0}%`;
}

function isRecentFile(dateKey) {
  const normalized = String(dateKey || '').replace(/-/g, '');
  const today = new Date();
  const keys = [0, 1].map((offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  });
  return keys.includes(normalized);
}

function buildSnapshots(rows) {
  const typeTimeMap = new Map();

  rows.forEach((row) => {
    const type = String(row.type || '').trim();
    const observedAt = String(row.observedAt || '').trim();
    const episodeId = String(row.episodeId || '').trim();
    const rank = Number(row.rank);
    if (!type || !observedAt || !episodeId || !Number.isFinite(rank)) return;

    const key = `${type}__${observedAt}`;
    if (!typeTimeMap.has(key)) {
      typeTimeMap.set(key, { type, observedAt, items: [] });
    }

    typeTimeMap.get(key).items.push({
      type,
      rank,
      episodeId,
      programTitle: String(row.programTitle || ''),
      episodeTitle: String(row.episodeTitle || ''),
      broadcaster: String(row.broadcaster || ''),
      observedAt
    });
  });

  const groupedByTime = new Map();
  Array.from(typeTimeMap.values())
    .sort((a, b) => parseDateValue(a.observedAt) - parseDateValue(b.observedAt))
    .forEach((group) => {
      group.items.sort((a, b) => a.rank - b.rank);
      if (!groupedByTime.has(group.observedAt)) {
        groupedByTime.set(group.observedAt, { observedAt: group.observedAt, types: {} });
      }
      groupedByTime.get(group.observedAt).types[group.type] = group;
    });

  const snapshots = Array.from(groupedByTime.values())
    .sort((a, b) => parseDateValue(a.observedAt) - parseDateValue(b.observedAt));

  const previousByType = new Map();
  const bestByTypeEpisode = new Map();
  const firstByTypeEpisode = new Map();

  snapshots.forEach((snapshot) => {
    Object.entries(snapshot.types).forEach(([type, group]) => {
      const previous = previousByType.get(type) || null;
      const previousRankMap = new Map((previous?.items || []).map((item) => [item.episodeId, item.rank]));
      const currentIds = new Set(group.items.map((item) => item.episodeId));

      group.items = group.items.map((item) => {
        const previousRank = previousRankMap.has(item.episodeId) ? previousRankMap.get(item.episodeId) : null;
        const change = previousRank === null ? null : previousRank - item.rank;
        const key = `${type}__${item.episodeId}`;

        if (!bestByTypeEpisode.has(key) || item.rank < bestByTypeEpisode.get(key)) {
          bestByTypeEpisode.set(key, item.rank);
        }
        if (!firstByTypeEpisode.has(key)) {
          firstByTypeEpisode.set(key, snapshot.observedAt);
        }

        return {
          ...item,
          previousRank,
          change,
          changeType: previousRank === null ? 'new' : change > 0 ? 'up' : change < 0 ? 'down' : 'keep',
          changeText: previousRank === null ? 'NEW' : change > 0 ? `+${change}` : change < 0 ? String(change) : '-',
          bestRankAllTime: bestByTypeEpisode.get(key),
          firstAppearedAtAllTime: firstByTypeEpisode.get(key)
        };
      });

      group.out = previous
        ? previous.items.filter((item) => !currentIds.has(item.episodeId)).map((item) => ({
            ...item,
            previousRank: item.rank,
            changeType: 'out',
            changeText: 'OUT',
            observedAt: snapshot.observedAt
          }))
        : [];

      previousByType.set(type, group);
    });
  });

  return snapshots;
}

function getRankingTypes() {
  return Array.from(new Set(state.rows.map((row) => String(row.type || '').trim()).filter(Boolean)));
}

function buildRankingTabs() {
  elements.rankingTabs.replaceChildren();
  getRankingTypes().forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ranking-tab';
    button.dataset.rankingType = type;
    button.textContent = getRankingLabel(type);
    button.setAttribute('aria-selected', String(type === state.rankingType));
    button.addEventListener('click', () => {
      state.rankingType = type;
      buildProgramSelect();
      render();
    });
    elements.rankingTabs.appendChild(button);
  });
}

function buildDateSelect() {
  const dateKeys = Array.from(new Set(state.snapshots.map((snapshot) => getDateKey(snapshot.observedAt)))).filter(Boolean).sort();
  elements.snapshotDateSelect.replaceChildren();
  dateKeys.forEach((dateKey) => {
    const option = document.createElement('option');
    option.value = dateKey;
    option.textContent = formatDateKeyLabel(dateKey);
    elements.snapshotDateSelect.appendChild(option);
  });
  syncDateSelect();
}

function moveToDate(dateKey) {
  let targetIndex = -1;
  state.snapshots.forEach((snapshot, index) => {
    if (getDateKey(snapshot.observedAt) === dateKey) targetIndex = index;
  });
  if (targetIndex >= 0) {
    state.snapshotIndex = targetIndex;
    render();
  }
}

function syncDateSelect() {
  const snapshot = state.snapshots[state.snapshotIndex];
  if (snapshot) elements.snapshotDateSelect.value = getDateKey(snapshot.observedAt);
}

function getProgramNames() {
  return Array.from(new Set(
    state.rows
      .filter((row) => String(row.type || '') === state.rankingType)
      .map((row) => String(row.programTitle || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'ja'));
}

function buildProgramSelect() {
  const programs = getProgramNames().filter((name) => !state.programSearch || normalizeText(name).includes(state.programSearch));
  const previous = state.selectedProgram;
  elements.programSelect.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = programs.length ? '番組を選択してください' : '該当する番組がありません';
  elements.programSelect.appendChild(placeholder);

  programs.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    elements.programSelect.appendChild(option);
  });

  if (previous && programs.includes(previous)) {
    state.selectedProgram = previous;
    elements.programSelect.value = previous;
  } else {
    state.selectedProgram = '';
    elements.programSelect.value = '';
  }

  elements.graphResultText.textContent = `${programs.length}番組`;
}

function render() {
  updateModeTabs();
  updateFilterCards();
  updateRankingTabs();

  const isGraph = state.viewMode === 'graph';
  elements.rankingSummary.hidden = isGraph;
  elements.rankingTableSection.hidden = isGraph;
  elements.graphSection.hidden = !isGraph;
  if (isGraph) elements.outSection.hidden = true;

  if (state.viewMode === 'history') {
    renderHistory();
  } else if (state.viewMode === 'graph') {
    renderGraph();
  } else {
    renderSnapshot();
  }
}

function updateModeTabs() {
  elements.viewModeTabs.forEach((button) => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  elements.snapshotModePanel.hidden = state.viewMode !== 'snapshot';
  elements.historyModePanel.hidden = state.viewMode !== 'history';
  elements.graphModePanel.hidden = state.viewMode !== 'graph';
}

function renderSnapshot() {
  const snapshot = state.snapshots[state.snapshotIndex];
  const group = snapshot?.types?.[state.rankingType] || { items: [], out: [] };
  const searchedItems = filterByQuery(group.items, state.snapshotSearch);
  const searchedOut = filterByQuery(group.out, state.snapshotSearch);

  elements.currentObservedAt.textContent = snapshot?.observedAt || '--';
  elements.snapshotPosition.textContent = state.snapshots.length ? `${state.snapshotIndex + 1} / ${state.snapshots.length}${state.snapshotIndex === state.snapshots.length - 1 ? '・最新' : ''}` : '';
  elements.rankingTableTitle.textContent = '順位表';
  elements.historyTimeHeader.textContent = '初登場時刻';
  elements.tableNote.textContent = '前回比は同じランキング種別の直前取得時点と比較します。';
  elements.snapshotSearchResultText.textContent = state.snapshotSearch ? `${searchedItems.length}件表示` : '';

  syncDateSelect();
  updateNavigation();
  renderResultSet(searchedItems, searchedOut, false);
}

function renderHistory() {
  const query = state.historySearch;
  const ranked = [];
  const out = [];

  if (query) {
    state.snapshots.forEach((snapshot) => {
      const group = snapshot.types?.[state.rankingType];
      if (!group) return;
      filterByQuery(group.items, query).forEach((item) => ranked.push({ ...item, observedAt: snapshot.observedAt }));
      filterByQuery(group.out, query).forEach((item) => out.push({ ...item, observedAt: snapshot.observedAt }));
    });
    ranked.sort((a, b) => parseDateValue(b.observedAt) - parseDateValue(a.observedAt));
    out.sort((a, b) => parseDateValue(b.observedAt) - parseDateValue(a.observedAt));
  }

  elements.rankingTableTitle.textContent = '全期間のランキング履歴';
  elements.historyTimeHeader.textContent = '取得時刻';
  elements.tableNote.textContent = '全取得時点を横断して検索しています。';
  elements.historySearchResultText.textContent = query ? `${ranked.length + out.length}件の履歴が見つかりました` : '番組名またはエピソード名を入力してください。';

  renderResultSet(ranked, out, true);
}

function renderGraph() {
  if (state.viewMode !== 'graph') return;

  const programName = state.selectedProgram;
  elements.graphRankingTypeLabel.textContent = getRankingLabel(state.rankingType);
  elements.graphTitle.textContent = programName || '番組別順位推移';
  elements.graphLegend.replaceChildren();
  elements.programChart.replaceChildren();

  if (!programName) {
    elements.programChart.hidden = true;
    elements.emptyGraphMessage.hidden = false;
    elements.emptyGraphMessage.textContent = '番組を選択してください。';
    return;
  }

  const seriesMap = new Map();
  state.rows
    .filter((row) => String(row.type || '') === state.rankingType && String(row.programTitle || '') === programName)
    .forEach((row) => {
      const episodeId = String(row.episodeId || '').trim();
      if (!episodeId) return;
      if (!seriesMap.has(episodeId)) {
        seriesMap.set(episodeId, {
          episodeId,
          episodeTitle: String(row.episodeTitle || '') || episodeId,
          points: []
        });
      }
      seriesMap.get(episodeId).points.push({
        observedAt: String(row.observedAt || ''),
        rank: Number(row.rank)
      });
    });

  const series = Array.from(seriesMap.values())
    .map((item) => ({
      ...item,
      points: item.points
        .filter((point) => point.observedAt && Number.isFinite(point.rank))
        .sort((a, b) => parseDateValue(a.observedAt) - parseDateValue(b.observedAt))
    }))
    .filter((item) => item.points.length)
    .sort((a, b) => parseDateValue(a.points[0].observedAt) - parseDateValue(b.points[0].observedAt));

  if (!series.length) {
    elements.programChart.hidden = true;
    elements.emptyGraphMessage.hidden = false;
    elements.emptyGraphMessage.textContent = 'この番組のランキング履歴はありません。';
    return;
  }

  elements.programChart.hidden = false;
  elements.emptyGraphMessage.hidden = true;
  drawProgramChart(series);
}

function drawProgramChart(series) {
  const allPoints = series.flatMap((item) => item.points);
  const minTime = Math.min(...allPoints.map((point) => parseDateValue(point.observedAt)));
  const maxTime = Math.max(...allPoints.map((point) => parseDateValue(point.observedAt)));
  const maxRank = Math.max(50, ...allPoints.map((point) => point.rank));

  const width = Math.max(920, Math.min(2200, 920 + Math.max(0, allPoints.length - 50) * 4));
  const height = 560;
  const margin = { top: 28, right: 28, bottom: 72, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  elements.programChart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  elements.programChart.setAttribute('width', String(width));
  elements.programChart.setAttribute('height', String(height));

  const x = (time) => margin.left + (maxTime === minTime ? innerWidth / 2 : ((time - minTime) / (maxTime - minTime)) * innerWidth);
  const y = (rank) => margin.top + ((rank - 1) / Math.max(1, maxRank - 1)) * innerHeight;

  [1,10,20,30,40,50].filter((rank) => rank <= maxRank).forEach((rank) => {
    appendSvg('line', { x1: margin.left, y1: y(rank), x2: width - margin.right, y2: y(rank), class: 'chart-grid-line' });
    appendSvg('text', { x: margin.left - 10, y: y(rank) + 4, class: 'chart-axis-label', 'text-anchor': 'end' }, `${rank}位`);
  });

  const tickCount = 6;
  for (let index = 0; index < tickCount; index += 1) {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
    const time = minTime + (maxTime - minTime) * ratio;
    const xValue = x(time);
    appendSvg('line', { x1: xValue, y1: margin.top, x2: xValue, y2: height - margin.bottom, class: 'chart-grid-line vertical' });
    appendSvg('text', { x: xValue, y: height - margin.bottom + 24, class: 'chart-axis-label', 'text-anchor': 'middle' }, formatChartDate(time));
  }

  series.forEach((item, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const points = item.points.map((point) => `${x(parseDateValue(point.observedAt))},${y(point.rank)}`).join(' ');

    appendSvg('polyline', {
      points,
      fill: 'none',
      stroke: color,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    });

    item.points.forEach((point) => {
      const circle = appendSvg('circle', {
        cx: x(parseDateValue(point.observedAt)),
        cy: y(point.rank),
        r: 4.5,
        fill: color,
        class: 'chart-point'
      });
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${item.episodeTitle}\n${point.observedAt}\n${point.rank}位`;
      circle.appendChild(title);
    });

    const legend = document.createElement('div');
    legend.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    const text = document.createElement('span');
    text.textContent = item.episodeTitle;
    legend.append(swatch, text);
    elements.graphLegend.appendChild(legend);
  });
}

function appendSvg(tagName, attributes, textContent = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (textContent) node.textContent = textContent;
  elements.programChart.appendChild(node);
  return node;
}

function renderResultSet(items, outItems, isHistory) {
  const filtered = state.filter === 'up'
    ? items.filter((item) => item.changeType === 'up')
    : state.filter === 'new'
      ? items.filter((item) => item.changeType === 'new')
      : state.filter === 'out'
        ? []
        : items;

  elements.rankedCount.textContent = String(items.length);
  elements.upCount.textContent = String(items.filter((item) => item.changeType === 'up').length);
  elements.newCount.textContent = String(items.filter((item) => item.changeType === 'new').length);
  elements.outCount.textContent = String(outItems.length);
  elements.rankingTypeLabel.textContent = getRankingLabel(state.rankingType);

  renderTable(filtered, isHistory);
  renderOut(state.filter === 'all' || state.filter === 'out' ? outItems : [], isHistory);

  const noRanked = filtered.length === 0;
  elements.emptyRankingMessage.hidden = !noRanked || state.filter === 'out';
  elements.emptyRankingMessage.textContent = isHistory
    ? (state.historySearch ? '検索条件に一致するランキング履歴はありません。' : '検索語を入力してください。')
    : 'この取得時点に該当するランキングデータはありません。';
}

function renderTable(items, isHistory) {
  elements.rankingTableBody.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(makeCell(`${item.rank}位`, 'rank-value'));
    row.appendChild(makeChangeCell(item));

    const titleCell = document.createElement('td');
    const program = document.createElement('span');
    program.className = 'program-title';
    program.textContent = item.programTitle || '番組名なし';
    const episode = document.createElement('span');
    episode.className = 'episode-title';
    episode.textContent = item.episodeTitle || 'エピソード名なし';
    titleCell.append(program, episode);
    row.appendChild(titleCell);

    row.appendChild(makeCell(item.broadcaster || '-'));
    row.appendChild(makeCell(item.bestRankAllTime ? `${item.bestRankAllTime}位` : '-'));
    row.appendChild(makeCell(isHistory ? (item.observedAt || '-') : (item.firstAppearedAtAllTime || '-')));
    elements.rankingTableBody.appendChild(row);
  });
}

function renderOut(items, isHistory) {
  elements.outList.replaceChildren();
  elements.outSection.hidden = items.length === 0 || state.viewMode === 'graph';
  items.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'out-item';
    const badge = document.createElement('span');
    badge.className = 'out-badge';
    badge.textContent = 'OUT';
    const titles = document.createElement('div');
    const program = document.createElement('span');
    program.className = 'program-title';
    program.textContent = item.programTitle || '番組名なし';
    const episode = document.createElement('span');
    episode.className = 'episode-title';
    episode.textContent = item.episodeTitle || 'エピソード名なし';
    titles.append(program, episode);
    const detail = document.createElement('span');
    detail.textContent = `${isHistory ? `${item.observedAt}・` : ''}前回 ${item.previousRank || '-'}位`;
    article.append(badge, titles, detail);
    elements.outList.appendChild(article);
  });
}

function makeCell(text, className = '') {
  const cell = document.createElement('td');
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  cell.appendChild(span);
  return cell;
}

function makeChangeCell(item) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `change-badge ${item.changeType || 'keep'}`;
  badge.textContent = item.changeType === 'up' ? `↑ ${item.changeText}` : item.changeType === 'down' ? `↓ ${item.changeText}` : item.changeText || '-';
  cell.appendChild(badge);
  return cell;
}

function moveSnapshot(direction) {
  const next = state.snapshotIndex + direction;
  if (next < 0 || next >= state.snapshots.length) return;
  state.snapshotIndex = next;
  render();
}

function updateNavigation() {
  elements.previousSnapshotButton.disabled = state.snapshotIndex <= 0;
  elements.nextSnapshotButton.disabled = state.snapshotIndex >= state.snapshots.length - 1;
}

function updateFilterCards() {
  elements.filterCards.forEach((button) => button.classList.toggle('is-active', button.dataset.filter === state.filter));
}

function updateRankingTabs() {
  elements.rankingTabs.querySelectorAll('.ranking-tab').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.rankingType === state.rankingType));
  });
}

function filterByQuery(items, query) {
  if (!query) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).filter((item) => normalizeText(`${item.programTitle} ${item.episodeTitle}`).includes(query));
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g, ' ').trim();
}

function parseDateValue(value) {
  const time = new Date(String(value || '').replace(/\//g, '-').replace(' ', 'T')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getDateKey(value) {
  const match = String(value || '').match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function formatDateKeyLabel(dateKey) {
  return /^\d{8}$/.test(dateKey) ? `${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}` : dateKey;
}

function formatChartDate(time) {
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
}

function buildPeriodRange() {
  if (!state.snapshots.length) return '--';
  return `${state.snapshots[0].observedAt} ～ ${state.snapshots[state.snapshots.length - 1].observedAt}`;
}

function getRankingLabel(type) {
  const labels = { all: '総合', variety: 'バラエティ', drama: 'ドラマ', talk: 'トーク', vtr: 'VTR/ロケ', local: 'ローカル' };
  return labels[type] || type || 'ランキング';
}