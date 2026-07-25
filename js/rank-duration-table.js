'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const graphSection = document.getElementById('graphSection');
  const programSelect = document.getElementById('programSelect');
  const rankingTabs = document.getElementById('rankingTabs');
  const latestUpdatedAt = document.getElementById('latestUpdatedAt');
  const graphTitle = document.getElementById('graphTitle');
  const graphRankingTypeLabel = document.getElementById('graphRankingTypeLabel');

  if (!graphSection || !programSelect) return;

  const card = document.createElement('section');
  card.className = 'graph-card rank-duration-card';
  card.hidden = true;
  card.innerHTML = `
    <div class="rank-duration-heading">
      <div>
        <p class="eyebrow">RANKING DURATION</p>
        <h2>順位滞在時間</h2>
        <p class="rank-duration-note">各取得時点の順位を次の取得時点まで維持したものとして集計します。大きな欠測区間は集計から除外します。</p>
      </div>
      <button type="button" class="rank-duration-share-button" disabled>画像でシェア</button>
    </div>
    <div class="rank-duration-table-scroll">
      <table class="rank-duration-table">
        <thead><tr><th>エピソード</th><th>最高順位</th><th>ランクイン時間</th><th>最長連続</th><th>順位別滞在時間</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="rank-duration-empty" hidden>番組を選択してください。</div>
  `;
  graphSection.insertAdjacentElement('afterend', card);

  const tbody = card.querySelector('tbody');
  const tableScroll = card.querySelector('.rank-duration-table-scroll');
  const empty = card.querySelector('.rank-duration-empty');
  const shareButton = card.querySelector('.rank-duration-share-button');
  let currentSummary = [];

  function median(values) {
    const nums = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!nums.length) return 60 * 60 * 1000;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0時間';
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days}日`);
    if (hours) parts.push(`${hours}時間`);
    if (!days && minutes) parts.push(`${minutes}分`);
    return parts.join('') || '0時間';
  }

  function buildSummary() {
    if (typeof state === 'undefined' || !state.selectedProgram || !state.rankingType) return [];

    const typeSnapshots = (state.snapshots || [])
      .map((snapshot, index) => ({ snapshot, index, time: parseDateValue(snapshot.observedAt) }))
      .filter(({ snapshot, time }) => snapshot?.types?.[state.rankingType] && time)
      .sort((a, b) => a.time - b.time);

    if (!typeSnapshots.length) return [];

    const gaps = [];
    for (let index = 0; index < typeSnapshots.length - 1; index += 1) {
      gaps.push(typeSnapshots[index + 1].time - typeSnapshots[index].time);
    }
    const normalInterval = median(gaps);
    const maxContinuousGap = normalInterval * 1.5;
    const latestTypeSnapshot = typeSnapshots[typeSnapshots.length - 1];

    const episodeMap = new Map();

    typeSnapshots.forEach(({ snapshot, time }, snapshotPosition) => {
      const group = snapshot.types[state.rankingType];
      const matchingItems = (group.items || []).filter((item) => String(item.programTitle || '') === state.selectedProgram);

      matchingItems.forEach((item) => {
        const episodeId = String(item.episodeId || '').trim();
        if (!episodeId) return;
        if (!episodeMap.has(episodeId)) {
          episodeMap.set(episodeId, {
            episodeId,
            episodeTitle: String(item.episodeTitle || '') || episodeId,
            bestRank: Number(item.rank),
            firstTime: time,
            lastTime: time,
            totalMs: 0,
            longestMs: 0,
            currentRunMs: 0,
            rankMs: new Map(),
            presentPositions: new Set(),
            latestRank: null,
            isCurrent: false
          });
        }
        const episode = episodeMap.get(episodeId);
        episode.bestRank = Math.min(episode.bestRank, Number(item.rank));
        episode.firstTime = Math.min(episode.firstTime, time);
        episode.lastTime = Math.max(episode.lastTime, time);
        episode.presentPositions.add(snapshotPosition);
        if (snapshotPosition === typeSnapshots.length - 1) {
          episode.isCurrent = true;
          episode.latestRank = Number(item.rank);
        }
      });
    });

    episodeMap.forEach((episode) => {
      for (let position = 0; position < typeSnapshots.length - 1; position += 1) {
        const current = typeSnapshots[position];
        const next = typeSnapshots[position + 1];
        const gap = next.time - current.time;
        const isPresentNow = episode.presentPositions.has(position);
        const isPresentNext = episode.presentPositions.has(position + 1);

        if (!isPresentNow) {
          episode.currentRunMs = 0;
          continue;
        }

        if (!(gap > 0) || gap > maxContinuousGap) {
          episode.currentRunMs = 0;
          continue;
        }

        const currentItem = (current.snapshot.types[state.rankingType]?.items || []).find(
          (item) => String(item.episodeId || '') === episode.episodeId && String(item.programTitle || '') === state.selectedProgram
        );
        const rank = Number(currentItem?.rank);
        if (!Number.isFinite(rank)) {
          episode.currentRunMs = 0;
          continue;
        }

        episode.totalMs += gap;
        episode.currentRunMs += gap;
        episode.longestMs = Math.max(episode.longestMs, episode.currentRunMs);
        episode.rankMs.set(rank, (episode.rankMs.get(rank) || 0) + gap);

        if (!isPresentNext) episode.currentRunMs = 0;
      }
    });

    return Array.from(episodeMap.values())
      .map((episode) => ({
        ...episode,
        ranks: Array.from(episode.rankMs.entries())
          .map(([rank, ms]) => ({ rank, ms, isCurrent: episode.isCurrent && episode.latestRank === rank }))
          .sort((a, b) => a.rank - b.rank),
        normalInterval,
        maxContinuousGap,
        latestObservedAt: latestTypeSnapshot.snapshot.observedAt
      }))
      .sort((a, b) => b.firstTime - a.firstTime || b.lastTime - a.lastTime);
  }

  function render() {
    const visible = typeof state !== 'undefined' && state.viewMode === 'graph';
    card.hidden = !visible;
    if (!visible) return;

    currentSummary = buildSummary();
    tbody.replaceChildren();

    if (!state.selectedProgram) {
      tableScroll.hidden = true;
      empty.hidden = false;
      empty.textContent = '番組を選択してください。';
      shareButton.disabled = true;
      return;
    }

    if (!currentSummary.length) {
      tableScroll.hidden = true;
      empty.hidden = false;
      empty.textContent = 'この番組の順位滞在時間を集計できるデータがありません。';
      shareButton.disabled = true;
      return;
    }

    tableScroll.hidden = false;
    empty.hidden = true;
    shareButton.disabled = false;

    currentSummary.forEach((episode) => {
      const row = document.createElement('tr');

      const episodeCell = document.createElement('td');
      episodeCell.className = 'rank-duration-episode';
      const title = document.createElement('strong');
      title.textContent = episode.episodeTitle;
      episodeCell.appendChild(title);
      if (episode.isCurrent) {
        const current = document.createElement('small');
        current.textContent = `現在ランクイン中（${episode.latestRank}位）`;
        episodeCell.appendChild(current);
      }

      const bestCell = document.createElement('td');
      bestCell.textContent = Number.isFinite(episode.bestRank) ? `${episode.bestRank}位` : '-';

      const totalCell = document.createElement('td');
      totalCell.textContent = formatDuration(episode.totalMs);

      const longestCell = document.createElement('td');
      longestCell.textContent = `${formatDuration(episode.longestMs)}${episode.isCurrent && episode.currentRunMs === episode.longestMs ? ' 継続中' : ''}`;

      const ranksCell = document.createElement('td');
      const ranks = document.createElement('div');
      ranks.className = 'rank-duration-ranks';
      episode.ranks.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `rank-duration-chip${item.isCurrent ? ' is-current' : ''}`;
        chip.textContent = `${item.rank}位 ${formatDuration(item.ms)}${item.isCurrent ? ' 継続中' : ''}`;
        ranks.appendChild(chip);
      });
      if (!episode.ranks.length) ranks.textContent = '-';
      ranksCell.appendChild(ranks);

      row.append(episodeCell, bestCell, totalCell, longestCell, ranksCell);
      tbody.appendChild(row);
    });
  }

  function wrapText(ctx, text, maxWidth) {
    const chars = Array.from(String(text || ''));
    const lines = [];
    let current = '';
    chars.forEach((char) => {
      const next = current + char;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  async function buildShareBlob() {
    const width = 1080;
    const side = 56;
    const titleHeight = 170;
    const episodeGap = 24;
    const episodeBlocks = currentSummary.map((episode) => {
      const rankText = episode.ranks.map((item) => `${item.rank}位 ${formatDuration(item.ms)}${item.isCurrent ? ' 継続中' : ''}`).join(' / ');
      return { episode, rankText };
    });

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = '600 22px Arial, sans-serif';
    const maxTextWidth = width - side * 2 - 36;
    const blockHeights = episodeBlocks.map(({ rankText }) => {
      const rankLines = Math.max(1, wrapText(measureCtx, rankText || '-', maxTextWidth).length);
      return 178 + rankLines * 32;
    });
    const height = titleHeight + blockHeights.reduce((sum, value) => sum + value, 0) + episodeGap * Math.max(0, episodeBlocks.length - 1) + 90;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#1d2430';
    ctx.font = '700 34px Arial, sans-serif';
    const titleLines = wrapText(ctx, String(graphTitle?.textContent || state.selectedProgram || '番組'), width - side * 2).slice(0, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, side, 54 + index * 40));

    const metaY = 54 + titleLines.length * 40 + 10;
    ctx.fillStyle = '#335cff';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText(`${String(graphRankingTypeLabel?.textContent || getRankingLabel(state.rankingType))}ランキング・順位滞在時間`, side, metaY);

    let y = titleHeight;
    episodeBlocks.forEach(({ episode, rankText }, index) => {
      const blockHeight = blockHeights[index];
      ctx.fillStyle = '#f7f8fb';
      ctx.strokeStyle = '#e1e5ec';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(side, y, width - side * 2, blockHeight, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1d2430';
      ctx.font = '700 25px Arial, sans-serif';
      const epLines = wrapText(ctx, episode.episodeTitle, width - side * 2 - 36).slice(0, 2);
      epLines.forEach((line, lineIndex) => ctx.fillText(line, side + 18, y + 36 + lineIndex * 31));

      let detailY = y + 36 + epLines.length * 31 + 18;
      ctx.font = '600 21px Arial, sans-serif';
      ctx.fillStyle = '#3b4350';
      ctx.fillText(`最高順位：${episode.bestRank}位`, side + 18, detailY);
      ctx.fillText(`ランクイン時間：${formatDuration(episode.totalMs)}`, side + 300, detailY);
      ctx.fillText(`最長連続：${formatDuration(episode.longestMs)}${episode.isCurrent && episode.currentRunMs === episode.longestMs ? ' 継続中' : ''}`, side + 620, detailY);

      detailY += 42;
      ctx.fillStyle = '#697386';
      ctx.font = '600 19px Arial, sans-serif';
      ctx.fillText('順位別滞在時間', side + 18, detailY);
      detailY += 30;
      ctx.fillStyle = '#1d2430';
      ctx.font = '600 20px Arial, sans-serif';
      const rankLines = wrapText(ctx, rankText || '-', width - side * 2 - 36);
      rankLines.forEach((line, lineIndex) => ctx.fillText(line, side + 18, detailY + lineIndex * 30));

      y += blockHeight + episodeGap;
    });

    ctx.fillStyle = '#7a8494';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(`最終更新：${String(latestUpdatedAt?.textContent || '--')}`, side, height - 36);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG生成に失敗しました')), 'image/png', 0.95);
    });
  }

  function makeFileName() {
    const safeTitle = String(state?.selectedProgram || 'ranking-duration').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    return `${safeTitle}_${String(state?.rankingType || 'ranking')}_duration.png`;
  }

  async function shareOrDownload() {
    if (shareButton.disabled || !currentSummary.length) return;
    const original = shareButton.textContent;
    shareButton.disabled = true;
    shareButton.textContent = '画像を作成中…';
    try {
      const blob = await buildShareBlob();
      const file = new File([blob], makeFileName(), { type: 'image/png' });
      const shareData = {
        title: `${state.selectedProgram} 順位滞在時間`,
        text: `${state.selectedProgram} ${getRankingLabel(state.rankingType)}ランキング 順位滞在時間`,
        files: [file]
      };

      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        alert('順位滞在時間の画像を作成できませんでした。');
      }
    } finally {
      shareButton.textContent = original;
      shareButton.disabled = !currentSummary.length;
    }
  }

  shareButton.addEventListener('click', shareOrDownload);
  programSelect.addEventListener('change', () => requestAnimationFrame(render));
  rankingTabs?.addEventListener('click', () => requestAnimationFrame(render));
  document.querySelectorAll('[data-view-mode]').forEach((button) => button.addEventListener('click', () => requestAnimationFrame(render)));

  const graphObserver = new MutationObserver(() => requestAnimationFrame(render));
  graphObserver.observe(graphSection, { attributes: true, attributeFilter: ['hidden'] });

  render();
});
