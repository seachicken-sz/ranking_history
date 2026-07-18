'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const rankingTabs = document.getElementById('rankingTabs');
  const historySearchInput = document.getElementById('historySearchInput');
  const clearHistorySearchButton = document.getElementById('clearHistorySearchButton');
  const programSearchInput = document.getElementById('programSearchInput');
  const programSelect = document.getElementById('programSelect');
  const viewModeTabs = Array.from(document.querySelectorAll('[data-view-mode]'));

  function getProgramRankingTypes(programName) {
    if (!programName) return new Set();

    return new Set(
      state.rows
        .filter((row) => String(row.programTitle || '') === programName)
        .map((row) => String(row.type || '').trim())
        .filter(Boolean)
    );
  }

  function resetTabState(button) {
    button.classList.remove('has-search-result', 'has-graph-history', 'is-unavailable');
    button.querySelector('.ranking-tab-count')?.remove();
    button.disabled = false;
    button.removeAttribute('aria-disabled');
  }

  function appendCountBadge(button, count) {
    const badge = document.createElement('span');
    badge.className = 'ranking-tab-count';
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count}件`);
    button.appendChild(badge);
  }

  function getHistoryMatchCounts(programName) {
    const counts = new Map(getRankingTypes().map((type) => [type, 0]));
    if (!programName) return counts;

    state.snapshots.forEach((snapshot) => {
      Object.entries(snapshot.types || {}).forEach(([type, group]) => {
        const rankedCount = (group.items || []).filter((item) => String(item.programTitle || '') === programName).length;
        const outCount = (group.out || []).filter((item) => String(item.programTitle || '') === programName).length;
        counts.set(type, (counts.get(type) || 0) + rankedCount + outCount);
      });
    });

    return counts;
  }

  function setUnavailable(button, unavailable) {
    button.disabled = unavailable;
    button.classList.toggle('is-unavailable', unavailable);
    if (unavailable) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }

  function switchToFirstAvailable(buttons) {
    const current = buttons.find((button) => button.dataset.rankingType === state.rankingType);
    if (current && !current.disabled) return false;

    const firstAvailable = buttons.find((button) => !button.disabled);
    if (!firstAvailable) return false;

    state.rankingType = firstAvailable.dataset.rankingType || '';
    buildProgramSelect();
    render();
    return true;
  }

  function updateRankingTabHighlights() {
    if (!rankingTabs || typeof state === 'undefined') return;

    const buttons = Array.from(rankingTabs.querySelectorAll('.ranking-tab'));
    if (!buttons.length) return;

    buttons.forEach(resetTabState);

    if (state.viewMode === 'history' && state.historySearch) {
      const counts = getHistoryMatchCounts(state.historySearch);
      buttons.forEach((button) => {
        const count = counts.get(button.dataset.rankingType) || 0;
        if (count > 0) {
          button.classList.add('has-search-result');
          appendCountBadge(button, count);
        } else {
          setUnavailable(button, true);
        }
      });

      if (switchToFirstAvailable(buttons)) return;
      return;
    }

    if (state.viewMode === 'graph' && state.selectedProgram) {
      const rankingTypes = getProgramRankingTypes(state.selectedProgram);
      buttons.forEach((button) => {
        const available = rankingTypes.has(button.dataset.rankingType);
        if (available) button.classList.add('has-graph-history');
        else setUnavailable(button, true);
      });

      if (switchToFirstAvailable(buttons)) return;
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