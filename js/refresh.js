'use strict';

/**
 * 最新更新ボタン専用処理。
 * 初回に読み込んだ過去JSONは保持し、manifestと最新日JSONだけ再取得する。
 */
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('refreshLatestButton');
  if (!button) return;

  button.addEventListener('click', refreshLatestRankingData);

  const readyTimer = window.setInterval(() => {
    if (typeof state !== 'undefined' && state.manifest && Array.isArray(state.rows)) {
      button.disabled = false;
      window.clearInterval(readyTimer);
    }
  }, 200);
});

async function refreshLatestRankingData() {
  const button = document.getElementById('refreshLatestButton');
  const buttonText = document.getElementById('refreshLatestButtonText');
  const status = document.getElementById('refreshLatestStatus');
  const icon = button ? button.querySelector('.refresh-icon') : null;

  if (!button || button.disabled) return;

  const previousObservedAt = state.snapshots[state.snapshotIndex]?.observedAt || '';
  const wasShowingLatest = state.snapshotIndex === state.snapshots.length - 1;

  button.disabled = true;
  button.classList.add('is-loading');
  if (icon) icon.classList.add('is-spinning');
  if (buttonText) buttonText.textContent = '更新中';
  if (status) status.textContent = '最新分を確認しています…';

  try {
    const cacheKey = Date.now();
    const manifestResponse = await fetch(`${MANIFEST_URL}?v=${cacheKey}`, {
      cache: 'no-store'
    });

    if (!manifestResponse.ok) {
      throw new Error(`manifest取得失敗 status=${manifestResponse.status}`);
    }

    const manifest = await manifestResponse.json();
    const files = Array.isArray(manifest.files) ? manifest.files : [];

    if (!files.length) {
      throw new Error('manifestにJSONファイルが登録されていません');
    }

    const latestFile = [...files]
      .filter((file) => file && file.path)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .at(-1);

    if (!latestFile) {
      throw new Error('最新JSONファイルを特定できませんでした');
    }

    if (status) status.textContent = '最新日のJSONを読み込んでいます…';

    const latestResponse = await fetch(`./data/${latestFile.path}?v=${cacheKey}`, {
      cache: 'no-store'
    });

    if (!latestResponse.ok) {
      throw new Error(`最新JSON取得失敗 status=${latestResponse.status}`);
    }

    const latestJson = await latestResponse.json();
    const latestRows = Array.isArray(latestJson.rows) ? latestJson.rows : [];
    const latestDateKey = String(latestFile.date || latestJson.date || '').replace(/\D/g, '');

    if (!latestDateKey) {
      throw new Error('最新JSONの日付を判定できませんでした');
    }

    state.rows = state.rows
      .filter((row) => getDateKey(row && row.observedAt) !== latestDateKey)
      .concat(latestRows);

    state.manifest = manifest;
    state.snapshots = buildSnapshots(state.rows);

    if (wasShowingLatest) {
      state.snapshotIndex = state.snapshots.length - 1;
    } else {
      const restoredIndex = state.snapshots.findIndex(
        (snapshot) => snapshot.observedAt === previousObservedAt
      );
      state.snapshotIndex = restoredIndex >= 0
        ? restoredIndex
        : Math.min(state.snapshotIndex, state.snapshots.length - 1);
    }

    const rankingTypes = getRankingTypes();
    if (!rankingTypes.includes(state.rankingType)) {
      state.rankingType = rankingTypes[0] || '';
    }

    elements.latestUpdatedAt.textContent = manifest.updatedAt || latestJson.updatedAt || '--';
    elements.historyPeriodRange.textContent = buildPeriodRange();

    buildDateSelect();
    buildRankingTabs();
    buildProgramSelect();
    render();

    if (status) {
      status.textContent = `${latestRows.length.toLocaleString('ja-JP')}件を更新しました`;
    }
  } catch (error) {
    console.error(error);
    if (status) status.textContent = `更新失敗: ${error.message || error}`;
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (icon) icon.classList.remove('is-spinning');
    if (buttonText) buttonText.textContent = '更新';
  }
}