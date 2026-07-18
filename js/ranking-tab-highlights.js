'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const rankingTabs = document.getElementById('rankingTabs');
  const historySearchInput = document.getElementById('historySearchInput');
  const clearHistorySearchButton = document.getElementById('clearHistorySearchButton');
  const programSearchInput = document.getElementById('programSearchInput');
  const programSelect = document.getElementById('programSelect');
  const viewModeTabs = Array.from(document.querySelectorAll('[data-view-mode]'));

  function getHistoryMatchCounts(query) {
    const counts = new Map(getRankingTypes().map((type) => [type, 0]));
    if (!query) return counts;

    state.snapshots.forEach((snapshot) => {
      Object.entries(snapshot.types || {}).forEach(([type, group]) => {
        const rankedCount = filterByQuery(group.items, query).length;
        const outCount = filterByQuery(group.out, query).length;
        counts.set(type, (counts.get(type) || 0) + rankedCount + outCount);
      });
    });

    return counts;
  }

  function getProgramRankingTypes(programName) {
    if (!programName) return new Set();

    return new Set(
      state.rows
        .filter((row) => String(row.programTitle || '') === programName)
        .map((row) => String(row.type || '').trim())
        .filter(Boolean)
    );
  }

  function resetTabHighlight(button) {
    button.classList.remove('has-search-result', 'has-graph-history');
    button.querySelector('.ranking-tab-count')?.remove();
  }

  function appendCountBadge(button, count) {
    const badge = document.createElement('span');
    badge.className = 'ranking-tab-count';
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count}件`);
    button.appendChild(badge);
  }

  function updateRankingTabHighlights() {
    if (!rankingTabs || typeof state === 'undefined') return;

    const buttons = Array.from(rankingTabs.querySelectorAll('.ranking-tab'));
    if (!buttons.length) return;

    buttons.forEach(resetTabHighlight);

    if (state.viewMode === 'history' && state.historySearch) {
      const counts = getHistoryMatchCounts(state.historySearch);
      buttons.forEach((button) => {
        const count = counts.get(button.dataset.rankingType) || 0;
        if (count <= 0) return;
        button.classList.add('has-search-result');
        appendCountBadge(button, count);
      });
      return;
    }

    if (state.viewMode === 'graph' && state.selectedProgram) {
      const rankingTypes = getProgramRankingTypes(state.selectedProgram);
      buttons.forEach((button) => {
        if (rankingTypes.has(button.dataset.rankingType)) {
          button.classList.add('has-graph-history');
        }
      });
    }
  }

  function waitForRankingTabs() {
    if (rankingTabs?.querySelector('.ranking-tab')) {
      updateRankingTabHighlights();
      return;
    }
    requestAnimationFrame(waitForRankingTabs);
  }

  historySearchInput?.addEventListener('input', updateRankingTabHighlights);
  clearHistorySearchButton?.addEventListener('click', updateRankingTabHighlights);
  programSearchInput?.addEventListener('input', updateRankingTabHighlights);
  programSelect?.addEventListener('change', updateRankingTabHighlights);
  rankingTabs?.addEventListener('click', updateRankingTabHighlights);
  viewModeTabs.forEach((button) => button.addEventListener('click', updateRankingTabHighlights));

  waitForRankingTabs();
});