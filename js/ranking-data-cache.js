'use strict';

(() => {
  const CACHE_NAME = 'ranking-history-daily-v1';
  const DAILY_FILE_PATTERN = /\/data\/tverRankingHistory_(\d{8})\.json$/;
  const nativeFetch = window.fetch.bind(window);

  function getTokyoDateKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const values = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
    });

    return `${values.year}${values.month}${values.day}`;
  }

  function getDailyDateKey(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      const match = url.pathname.match(DAILY_FILE_PATTERN);
      return match ? match[1] : '';
    } catch (_) {
      return '';
    }
  }

  function isCacheableRequest(input, init) {
    const method = String(init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    if (method !== 'GET') return false;

    const dateKey = getDailyDateKey(input);
    if (!dateKey) return false;

    return dateKey < getTokyoDateKey();
  }

  async function fetchWithDailyCache(input, init) {
    if (!('caches' in window) || !isCacheableRequest(input, init)) {
      return nativeFetch(input, init);
    }

    const request = new Request(input, init);
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });

    if (cached) {
      return cached;
    }

    const response = await nativeFetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.warn('日別ランキングJSONのキャッシュ保存に失敗しました', error);
      }
    }

    return response;
  }

  window.fetch = fetchWithDailyCache;
})();
