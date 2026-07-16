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
  failedFiles: []
};

const elements = {};

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
    'snapshotModePanel','historySearchInput','clearHistorySearchButton',
    'historySearchResultText','historyPeriodRange','rankingTabs','warningMessage',
    'rankedCount','upCount','newCount','outCount','rankingTypeLabel',
    'rankingTableTitle','tableNote','historyTimeHeader','rankingTableBody',
    'emptyRankingMessage','outSection','outList'
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

        if (!response.ok) {
          throw new Error(`status=${response.status}`);
        }

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
    buildRankingTabs();

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
      render();
    });
    elements.rankingTabs.appendChild(button);
  });
}

function render() {
  updateModeTabs();
  updateFilterCards();
  updateRankingTabs();

  if (state.viewMode === 'history') {
    renderHistory();
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
  elements.outSection.hidden = items.length === 0;
  items.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'out-item';
    const badge = document.createElement('span');
    badge.className = 'out-badge';
    badge.textContent = 'OUT';
    const titles = document.createElement('div');
    titles.innerHTML = `<span class="program-title"></span><span class="episode-title"></span>`;
    titles.children[0].textContent = item.programTitle || '番組名なし';
    titles.children[1].textContent = item.episodeTitle || 'エピソード名なし';
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

function buildPeriodRange() {
  if (!state.snapshots.length) return '--';
  return `${state.snapshots[0].observedAt} ～ ${state.snapshots[state.snapshots.length - 1].observedAt}`;
}

function getRankingLabel(type) {
  const labels = { all: '総合', variety: 'バラエティ', drama: 'ドラマ', talk: 'トーク', vtr: 'VTR/ロケ', local: 'ローカル' };
  return labels[type] || type || 'ランキング';
}
