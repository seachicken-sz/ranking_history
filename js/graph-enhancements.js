'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const graphSection = document.getElementById('graphSection');
  const chartScroll = graphSection?.querySelector('.chart-scroll');
  const programChart = document.getElementById('programChart');
  const graphLegend = document.getElementById('graphLegend');
  const graphTitle = document.getElementById('graphTitle');
  const graphRankingTypeLabel = document.getElementById('graphRankingTypeLabel');
  const latestUpdatedAt = document.getElementById('latestUpdatedAt');
  const emptyGraphMessage = document.getElementById('emptyGraphMessage');

  if (!graphSection || !chartScroll || !programChart) return;

  const shareActions = document.createElement('div');
  shareActions.className = 'graph-share-actions';
  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'graph-share-button';
  shareButton.textContent = '画像でシェア';
  shareButton.disabled = true;
  shareActions.appendChild(shareButton);
  graphLegend.insertAdjacentElement('afterend', shareActions);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'graph-chart-wrap';
  const yAxis = document.createElement('div');
  yAxis.className = 'graph-y-axis';
  yAxis.setAttribute('aria-hidden', 'true');
  const scrollInner = document.createElement('div');
  scrollInner.className = 'graph-chart-scroll-inner';

  chartScroll.parentNode.insertBefore(chartWrap, chartScroll);
  scrollInner.appendChild(programChart);
  chartWrap.append(yAxis, scrollInner);
  chartScroll.remove();

  function syncFixedYAxis() {
    const viewBox = programChart.viewBox?.baseVal;
    const height = viewBox?.height || Number(programChart.getAttribute('height')) || 560;
    const marginTop = 28;
    const marginBottom = 72;
    const innerHeight = height - marginTop - marginBottom;
    const ranks = [1, 10, 20, 30, 40, 50];

    yAxis.replaceChildren();
    ranks.forEach((rank) => {
      const top = marginTop + ((rank - 1) / 49) * innerHeight;
      const label = document.createElement('span');
      label.className = 'graph-y-axis-label';
      label.style.top = `${top}px`;
      label.textContent = `${rank}位`;
      yAxis.appendChild(label);
    });

    Array.from(programChart.querySelectorAll('text')).forEach((node) => {
      const text = String(node.textContent || '').trim();
      node.classList.toggle('y-axis-source', /^\d+位$/.test(text));
    });

    shareButton.disabled = programChart.hidden || !programChart.childElementCount || !String(graphTitle?.textContent || '').trim();
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

  function getLegendItems() {
    return Array.from(graphLegend?.querySelectorAll('.legend-item') || []).map((item) => {
      const swatch = item.querySelector('.legend-swatch');
      const text = item.querySelector('span:last-child');
      return {
        color: swatch?.style.background || '#335cff',
        text: String(text?.textContent || '').trim()
      };
    }).filter((item) => item.text);
  }

  function serializeChartSvg() {
    const clone = programChart.cloneNode(true);
    clone.hidden = false;
    clone.removeAttribute('class');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('style', 'background:#ffffff');

    Array.from(clone.querySelectorAll('text')).forEach((node) => {
      node.setAttribute('fill', '#5b6472');
      node.setAttribute('font-size', '12');
      node.setAttribute('font-family', 'Arial, sans-serif');
      node.style.opacity = '1';
    });
    Array.from(clone.querySelectorAll('.chart-grid-line')).forEach((node) => {
      node.setAttribute('stroke', '#e5e8ee');
      node.setAttribute('stroke-width', '1');
    });

    return new XMLSerializer().serializeToString(clone);
  }

  function svgToImage(svgText) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('グラフ画像の生成に失敗しました'));
      };
      image.src = url;
    });
  }

  async function buildShareBlob() {
    const svgImage = await svgToImage(serializeChartSvg());
    const legendItems = getLegendItems();
    const chartWidth = Math.max(920, Number(programChart.getAttribute('width')) || 920);
    const chartHeight = Number(programChart.getAttribute('height')) || 560;
    const canvasWidth = Math.min(1800, Math.max(1080, chartWidth));
    const chartDrawWidth = canvasWidth - 96;
    const chartDrawHeight = chartHeight * (chartDrawWidth / chartWidth);
    const legendColumnWidth = (canvasWidth - 96) / 2;
    const legendLineHeight = 34;
    const legendHeight = Math.ceil(legendItems.length / 2) * legendLineHeight;
    const canvasHeight = Math.ceil(190 + chartDrawHeight + Math.max(70, legendHeight) + 80);

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#1d2430';
    ctx.font = '700 34px Arial, sans-serif';
    const titleLines = wrapText(ctx, String(graphTitle?.textContent || '番組別順位推移'), canvasWidth - 96).slice(0, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, 48, 58 + index * 42));

    const metaY = 58 + titleLines.length * 42 + 8;
    ctx.fillStyle = '#335cff';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText(`${String(graphRankingTypeLabel?.textContent || 'ランキング')}ランキング`, 48, metaY);

    ctx.drawImage(svgImage, 48, metaY + 28, chartDrawWidth, chartDrawHeight);

    let legendY = metaY + 28 + chartDrawHeight + 38;
    ctx.font = '600 18px Arial, sans-serif';
    legendItems.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 48 + column * legendColumnWidth;
      const y = legendY + row * legendLineHeight;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + 7, y - 6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2430';
      const label = item.text.length > 32 ? `${item.text.slice(0, 32)}…` : item.text;
      ctx.fillText(label, x + 24, y);
    });

    const footerY = canvasHeight - 34;
    ctx.fillStyle = '#7a8494';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(`最終更新：${String(latestUpdatedAt?.textContent || '--')}`, 48, footerY);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG生成に失敗しました')), 'image/png', 0.95);
    });
  }

  function makeFileName() {
    const safeTitle = String(graphTitle?.textContent || 'ranking-graph').replace(/[\\/:*?\"<>|]/g, '_').slice(0, 60);
    return `${safeTitle}_${String(graphRankingTypeLabel?.textContent || 'ranking')}.png`;
  }

  async function shareOrDownload() {
    if (shareButton.disabled) return;
    const originalText = shareButton.textContent;
    shareButton.disabled = true;
    shareButton.textContent = '画像を作成中…';

    try {
      const blob = await buildShareBlob();
      const file = new File([blob], makeFileName(), { type: 'image/png' });
      const shareData = {
        title: String(graphTitle?.textContent || 'TVerランキング推移'),
        text: `${String(graphTitle?.textContent || '')} ${String(graphRankingTypeLabel?.textContent || '')}ランキングの順位推移`,
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
        alert('グラフ画像を作成できませんでした。');
      }
    } finally {
      shareButton.textContent = originalText;
      syncFixedYAxis();
    }
  }

  shareButton.addEventListener('click', shareOrDownload);

  const observer = new MutationObserver(syncFixedYAxis);
  observer.observe(programChart, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'width', 'height', 'viewBox'] });
  observer.observe(emptyGraphMessage, { attributes: true, attributeFilter: ['hidden'] });

  document.getElementById('programSelect')?.addEventListener('change', () => requestAnimationFrame(syncFixedYAxis));
  document.getElementById('rankingTabs')?.addEventListener('click', () => requestAnimationFrame(syncFixedYAxis));
  document.querySelectorAll('[data-view-mode]').forEach((button) => button.addEventListener('click', () => requestAnimationFrame(syncFixedYAxis)));

  syncFixedYAxis();
});