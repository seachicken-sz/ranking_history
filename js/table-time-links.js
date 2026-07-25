'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('rankingTableBody');
  const rankingTableSection = document.getElementById('rankingTableSection');
  const snapshotSearchInput = document.getElementById('snapshotSearchInput');
  const clearSnapshotSearchButton = document.getElementById('clearSnapshotSearchButton');

  if (!tableBody) return;

  decorateTimeCells();

  const observer = new MutationObserver(() => {
    decorateTimeCells();
  });

  observer.observe(tableBody, { childList: true, subtree: false });

  function decorateTimeCells() {
    Array.from(tableBody.querySelectorAll('tr')).forEach((row) => {
      const timeCell = row.children[5];
      if (!timeCell || timeCell.querySelector('.table-time-link')) return;

      const observedAt = String(timeCell.textContent || '').trim();
      if (!observedAt || observedAt === '-') return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-time-link';
      button.textContent = observedAt;
      button.setAttribute('aria-label', `${observedAt}の1時間ごと表示を見る`);
      button.title = 'この取得時点を1時間ごと表示で見る';

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        jumpToSnapshot(observedAt);
      });

      timeCell.replaceChildren(button);
    });
  }

  function jumpToSnapshot(observedAt) {
    if (typeof state === 'undefined' || !Array.isArray(state.snapshots)) return;

    let targetIndex = state.snapshots.findIndex(
      (snapshot) => String(snapshot.observedAt || '') === observedAt
    );

    if (targetIndex < 0 && typeof parseDateValue === 'function') {
      const targetTime = parseDateValue(observedAt);
      if (targetTime) {
        targetIndex = state.snapshots.findIndex(
          (snapshot) => parseDateValue(snapshot.observedAt) === targetTime
        );
      }
    }

    if (targetIndex < 0) return;

    state.snapshotIndex = targetIndex;
    state.viewMode = 'snapshot';
    state.snapshotSearch = '';

    if (snapshotSearchInput) snapshotSearchInput.value = '';
    if (clearSnapshotSearchButton) clearSnapshotSearchButton.disabled = true;

    if (typeof render === 'function') render();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rankingTableSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
});
