'use strict';

function renderEpisodeSummaries() {
  el.episodeSummaryList.replaceChildren();

  getSelectedEpisodes().forEach((episode) => {
    const likes = getSelectedProgramRows()
      .filter((row) => row.metricType === 'like' && String(row.episodeId || '') === episode.episodeId)
      .sort((a, b) => parseDate(a.observedAt) - parseDate(b.observedAt));

    const rankings = state.rankingRows
      .filter((row) => String(row.episodeId || '') === episode.episodeId)
      .sort((a, b) => parseDate(a.observedAt) - parseDate(b.observedAt));

    const byType = groupBy(rankings, (row) => row.type);
    const tr = document.createElement('tr');
    tr.className = 'summary-row';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');

    const titleCell = document.createElement('td');
    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'summary-title-button';
    titleButton.textContent = episode.episodeTitle;
    titleCell.appendChild(titleButton);

    const likeCell = document.createElement('td');
    if (likes.length) {
      const latest = likes.at(-1);
      appendArchiveMetricWithDate(likeCell, formatNumber(latest.value), latest.observedAt);
    } else {
      likeCell.textContent = '-';
    }

    const bestCell = document.createElement('td');
    const firstCell = document.createElement('td');

    const typeEntries = Object.entries(byType)
      .sort(([a], [b]) => archiveRankingTypeOrder(a) - archiveRankingTypeOrder(b));

    if (!typeEntries.length) {
      bestCell.textContent = '-';
      firstCell.textContent = '-';
    } else {
      typeEntries.forEach(([type, typeRows]) => {
        const sorted = typeRows.slice().sort((a, b) => parseDate(a.observedAt) - parseDate(b.observedAt));
        const first = sorted[0];
        const best = sorted.reduce(
          (currentBest, row) => Number(row.rank) < Number(currentBest.rank) ? row : currentBest,
          sorted[0]
        );

        appendArchiveRankMetric(bestCell, `${rankingLabel(type)}：${best.rank}位`, best.observedAt);
        appendArchiveRankMetric(firstCell, `${rankingLabel(type)}：${first.rank}位`, first.observedAt);
      });
    }

    const selectEpisode = () => {
      state.selectedEpisodeId = episode.episodeId;
      el.episodeSelect.value = episode.episodeId;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    titleButton.addEventListener('click', selectEpisode);
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectEpisode();
      }
    });

    tr.append(titleCell, likeCell, bestCell, firstCell);
    el.episodeSummaryList.appendChild(tr);
  });
}

function appendArchiveMetricWithDate(cell, value, observedAt) {
  const valueNode = document.createElement('span');
  valueNode.className = 'summary-value';
  valueNode.textContent = value;

  const dateNode = document.createElement('small');
  dateNode.className = 'summary-date';
  dateNode.textContent = `(${observedAt || '-'})`;

  cell.append(valueNode, document.createElement('br'), dateNode);
}

function appendArchiveRankMetric(cell, value, observedAt) {
  const item = document.createElement('span');
  item.className = 'summary-rank-item';

  const valueNode = document.createElement('span');
  valueNode.className = 'summary-value';
  valueNode.textContent = value;

  const dateNode = document.createElement('small');
  dateNode.className = 'summary-date';
  dateNode.textContent = `(${observedAt || '-'})`;

  item.append(valueNode, document.createElement('br'), dateNode);
  cell.appendChild(item);
}

function archiveRankingTypeOrder(type) {
  return ({ all: 10, variety: 20, drama: 30, talk: 40, vtr: 50, local: 60 })[type] || 999;
}
