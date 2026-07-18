'use strict';

document.addEventListener('DOMContentLoaded', () => {
  let historyCandidatesCache = null;

  const configs = [
    {
      inputId: 'snapshotSearchInput',
      clearId: 'clearSnapshotSearchButton',
      getCandidates: getSnapshotCandidates
    },
    {
      inputId: 'historySearchInput',
      clearId: 'clearHistorySearchButton',
      getCandidates: getHistoryCandidates
    }
  ];

  configs.forEach(setupCombobox);
  setupGraphCombobox();

  function setupCombobox(config) {
    const input = document.getElementById(config.inputId);
    const clearButton = document.getElementById(config.clearId);
    if (!input || !clearButton) return;

    const row = input.closest('.search-row');
    if (!row) return;

    row.classList.add('search-combobox-row');
    clearButton.classList.add('search-combobox-clear');
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', '検索条件をクリア');

    const dropdown = document.createElement('div');
    dropdown.className = 'search-combobox-dropdown';
    dropdown.hidden = true;
    dropdown.setAttribute('role', 'listbox');
    row.appendChild(dropdown);

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    let highlightedIndex = -1;
    let optionButtons = [];

    function closeDropdown() {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      optionButtons = [];
    }

    function selectCandidate(candidate) {
      const query = candidate.kind === 'episode'
        ? `${candidate.programTitle} ${candidate.episodeTitle}`.trim()
        : candidate.programTitle;

      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      closeDropdown();
    }

    function renderDropdown() {
      const query = normalizeText(input.value);
      const candidates = config.getCandidates().filter((item) => {
        if (!query) return true;
        return normalizeText(`${item.programTitle} ${item.episodeTitle || ''}`).includes(query);
      });

      const programs = candidates.filter((item) => item.kind === 'program').slice(0, 30);
      const episodes = candidates.filter((item) => item.kind === 'episode').slice(0, 50);

      dropdown.replaceChildren();
      optionButtons = [];
      highlightedIndex = -1;

      if (!programs.length && !episodes.length) {
        const empty = document.createElement('div');
        empty.className = 'search-combobox-empty';
        empty.textContent = '該当する候補がありません';
        dropdown.appendChild(empty);
      } else {
        appendGroup(dropdown, optionButtons, '番組', programs, selectCandidate);
        appendGroup(dropdown, optionButtons, 'エピソード', episodes, selectCandidate);
      }

      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    bindComboboxEvents({
      input,
      clearButton,
      dropdown,
      container: row,
      renderDropdown,
      closeDropdown,
      getOptionButtons: () => optionButtons,
      getHighlightedIndex: () => highlightedIndex,
      setHighlightedIndex: (value) => { highlightedIndex = value; }
    });
  }

  function setupGraphCombobox() {
    const input = document.getElementById('programSearchInput');
    const select = document.getElementById('programSelect');
    if (!input || !select) return;

    const control = input.closest('.graph-control');
    const selectControl = select.closest('.graph-control');
    const controls = input.closest('.graph-controls');
    if (!control || !selectControl || !controls) return;

    controls.classList.add('graph-controls-combobox');
    control.classList.add('graph-search-combobox');
    selectControl.classList.add('graph-select-control-hidden');

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'search-combobox-clear graph-combobox-clear';
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', '番組選択をクリア');
    clearButton.disabled = true;
    control.appendChild(clearButton);

    const dropdown = document.createElement('div');
    dropdown.className = 'search-combobox-dropdown';
    dropdown.hidden = true;
    dropdown.setAttribute('role', 'listbox');
    control.appendChild(dropdown);

    input.placeholder = '番組名を入力して選択';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    let highlightedIndex = -1;
    let optionButtons = [];

    function closeDropdown() {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      optionButtons = [];
    }

    function selectProgram(candidate) {
      input.value = candidate.programTitle;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      select.value = candidate.programTitle;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      clearButton.disabled = false;
      closeDropdown();
    }

    function getGraphCandidates() {
      if (typeof state === 'undefined') return [];
      const type = String(state.rankingType || '');
      const names = Array.from(new Set(
        (state.rows || [])
          .filter((row) => String(row.type || '') === type)
          .map((row) => String(row.programTitle || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ja'));

      return names.map((programTitle) => ({ kind: 'program', programTitle, episodeTitle: '' }));
    }

    function renderDropdown() {
      const query = normalizeText(input.value);
      const programs = getGraphCandidates()
        .filter((item) => !query || normalizeText(item.programTitle).includes(query))
        .slice(0, 50);

      dropdown.replaceChildren();
      optionButtons = [];
      highlightedIndex = -1;

      if (!programs.length) {
        const empty = document.createElement('div');
        empty.className = 'search-combobox-empty';
        empty.textContent = '該当する番組がありません';
        dropdown.appendChild(empty);
      } else {
        appendGroup(dropdown, optionButtons, '番組', programs, selectProgram);
      }

      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    bindComboboxEvents({
      input,
      clearButton,
      dropdown,
      container: control,
      renderDropdown,
      closeDropdown,
      getOptionButtons: () => optionButtons,
      getHighlightedIndex: () => highlightedIndex,
      setHighlightedIndex: (value) => { highlightedIndex = value; }
    });

    input.addEventListener('input', () => {
      clearButton.disabled = !input.value;
    });

    clearButton.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      clearButton.disabled = true;
    });

    select.addEventListener('change', () => {
      if (select.value && input.value !== select.value) input.value = select.value;
      clearButton.disabled = !select.value && !input.value;
    });
  }

  function bindComboboxEvents({ input, clearButton, dropdown, container, renderDropdown, closeDropdown, getOptionButtons, getHighlightedIndex, setHighlightedIndex }) {
    function updateHighlight(nextIndex) {
      const optionButtons = getOptionButtons();
      if (!optionButtons.length) return;
      const highlightedIndex = Math.max(0, Math.min(nextIndex, optionButtons.length - 1));
      setHighlightedIndex(highlightedIndex);
      optionButtons.forEach((button, index) => {
        button.classList.toggle('is-highlighted', index === highlightedIndex);
      });
      optionButtons[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', renderDropdown);
    input.addEventListener('input', renderDropdown);
    input.addEventListener('keydown', (event) => {
      const highlightedIndex = getHighlightedIndex();
      const optionButtons = getOptionButtons();

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (dropdown.hidden) renderDropdown();
        updateHighlight(highlightedIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        updateHighlight(highlightedIndex <= 0 ? 0 : highlightedIndex - 1);
      } else if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault();
        optionButtons[highlightedIndex]?.click();
      } else if (event.key === 'Escape') {
        closeDropdown();
      }
    });

    clearButton.addEventListener('click', () => {
      closeDropdown();
      input.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!container.contains(event.target)) closeDropdown();
    });
  }

  function appendGroup(dropdown, optionButtons, label, items, onSelect) {
    if (!items.length) return;

    const groupLabel = document.createElement('div');
    groupLabel.className = 'search-combobox-group-label';
    groupLabel.textContent = label;
    dropdown.appendChild(groupLabel);

    items.forEach((candidate) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-combobox-option';
      button.setAttribute('role', 'option');

      const main = document.createElement('span');
      main.className = 'search-combobox-option-main';
      main.textContent = candidate.kind === 'program' ? candidate.programTitle : candidate.episodeTitle;
      button.appendChild(main);

      if (candidate.kind === 'episode') {
        const sub = document.createElement('span');
        sub.className = 'search-combobox-option-sub';
        sub.textContent = candidate.programTitle;
        button.appendChild(sub);
      }

      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => onSelect(candidate));
      dropdown.appendChild(button);
      optionButtons.push(button);
    });
  }

  function getSnapshotCandidates() {
    if (typeof state === 'undefined') return [];
    const snapshot = state.snapshots?.[state.snapshotIndex];
    const group = snapshot?.types?.[state.rankingType];
    const items = [...(group?.items || []), ...(group?.out || [])];
    return buildCandidates(items);
  }

  function getHistoryCandidates() {
    if (typeof state === 'undefined') return [];
    if (!historyCandidatesCache) {
      historyCandidatesCache = buildCandidates(state.rows || []);
    }
    return historyCandidatesCache;
  }

  function buildCandidates(items) {
    const programMap = new Map();
    const episodeMap = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const programTitle = String(item.programTitle || '').trim();
      const episodeTitle = String(item.episodeTitle || '').trim();
      const episodeId = String(item.episodeId || '').trim();

      if (programTitle && !programMap.has(programTitle)) {
        programMap.set(programTitle, {
          kind: 'program',
          programTitle,
          episodeTitle: ''
        });
      }

      if (episodeTitle) {
        const key = episodeId || `${programTitle}__${episodeTitle}`;
        if (!episodeMap.has(key)) {
          episodeMap.set(key, {
            kind: 'episode',
            programTitle,
            episodeTitle,
            episodeId
          });
        }
      }
    });

    return [
      ...Array.from(programMap.values()).sort((a, b) => a.programTitle.localeCompare(b.programTitle, 'ja')),
      ...Array.from(episodeMap.values()).sort((a, b) => {
        const programCompare = a.programTitle.localeCompare(b.programTitle, 'ja');
        return programCompare || a.episodeTitle.localeCompare(b.episodeTitle, 'ja');
      })
    ];
  }
});