'use strict';

document.addEventListener('DOMContentLoaded', () => {
  let historyProgramsCache = null;

  setupStandardCombobox({
    inputId: 'snapshotSearchInput',
    clearId: 'clearSnapshotSearchButton',
    getCandidates: getSnapshotCandidates,
    programsOnly: false
  });

  setupHistoryCombobox();
  setupGraphCombobox();

  function setupStandardCombobox({ inputId, clearId, getCandidates, programsOnly }) {
    const input = document.getElementById(inputId);
    const clearButton = document.getElementById(clearId);
    if (!input || !clearButton) return;

    const row = input.closest('.search-row');
    if (!row) return;

    row.classList.add('search-combobox-row');
    clearButton.classList.add('search-combobox-clear');
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', '検索条件をクリア');

    const dropdown = createDropdown(row);
    prepareInput(input);

    let highlightedIndex = -1;
    let optionButtons = [];

    const closeDropdown = () => {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      optionButtons = [];
    };

    const selectCandidate = (candidate) => {
      const query = candidate.kind === 'episode'
        ? `${candidate.programTitle} ${candidate.episodeTitle}`.trim()
        : candidate.programTitle;
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      closeDropdown();
    };

    const renderDropdown = () => {
      const query = normalizeText(input.value);
      const candidates = getCandidates().filter((item) => {
        if (!query) return true;
        return normalizeText(programsOnly ? item.programTitle : `${item.programTitle} ${item.episodeTitle || ''}`).includes(query);
      });

      const programs = candidates.filter((item) => item.kind === 'program').slice(0, 30);
      const episodes = programsOnly ? [] : candidates.filter((item) => item.kind === 'episode').slice(0, 50);

      dropdown.replaceChildren();
      optionButtons = [];
      highlightedIndex = -1;

      if (!programs.length && !episodes.length) {
        appendEmpty(dropdown, '該当する候補がありません');
      } else {
        appendGroup(dropdown, optionButtons, '番組', programs, selectCandidate);
        if (episodes.length) appendGroup(dropdown, optionButtons, 'エピソード', episodes, selectCandidate);
      }

      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

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

  function setupHistoryCombobox() {
    const input = document.getElementById('historySearchInput');
    const clearButton = document.getElementById('clearHistorySearchButton');
    if (!input || !clearButton) return;

    const row = input.closest('.search-row');
    if (!row) return;

    row.classList.add('search-combobox-row');
    clearButton.classList.add('search-combobox-clear');
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', '検索条件をクリア');
    input.placeholder = '番組名を入力して選択';

    const dropdown = createDropdown(row);
    prepareInput(input);

    let highlightedIndex = -1;
    let optionButtons = [];
    let allowCommittedInput = false;

    const closeDropdown = () => {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      optionButtons = [];
    };

    const getPrograms = () => {
      if (!historyProgramsCache) {
        const names = Array.from(new Set(
          (state.rows || [])
            .map((row) => String(row.programTitle || '').trim())
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'ja'));
        historyProgramsCache = names.map((programTitle) => ({ kind: 'program', programTitle, episodeTitle: '' }));
      }
      return historyProgramsCache;
    };

    const renderDropdown = () => {
      const query = normalizeText(input.value);
      const programs = getPrograms()
        .filter((item) => !query || normalizeText(item.programTitle).includes(query))
        .slice(0, 50);

      dropdown.replaceChildren();
      optionButtons = [];
      highlightedIndex = -1;

      if (!programs.length) appendEmpty(dropdown, '該当する番組がありません');
      else appendGroup(dropdown, optionButtons, '番組', programs, selectProgram);

      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    function selectProgram(candidate) {
      input.value = candidate.programTitle;
      allowCommittedInput = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      closeDropdown();
    }

    input.addEventListener('input', (event) => {
      if (allowCommittedInput) {
        allowCommittedInput = false;
        return;
      }
      event.stopImmediatePropagation();
      renderDropdown();
      clearButton.disabled = !input.value;
    }, true);

    input.addEventListener('focus', renderDropdown);
    input.addEventListener('keydown', (event) => handleKeydown({
      event,
      dropdown,
      renderDropdown,
      getOptionButtons: () => optionButtons,
      getHighlightedIndex: () => highlightedIndex,
      setHighlightedIndex: (value) => { highlightedIndex = value; }
    }));

    clearButton.addEventListener('click', () => {
      closeDropdown();
      input.value = '';
      allowCommittedInput = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!row.contains(event.target)) closeDropdown();
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

    const dropdown = createDropdown(control);
    prepareInput(input);
    input.placeholder = '番組名を入力して選択';

    let highlightedIndex = -1;
    let optionButtons = [];

    const closeDropdown = () => {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      optionButtons = [];
    };

    function getGraphCandidates() {
      const type = String(state.rankingType || '');
      const names = Array.from(new Set(
        (state.rows || [])
          .filter((row) => String(row.type || '') === type)
          .map((row) => String(row.programTitle || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ja'));
      return names.map((programTitle) => ({ kind: 'program', programTitle, episodeTitle: '' }));
    }

    const selectProgram = (candidate) => {
      input.value = candidate.programTitle;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      select.value = candidate.programTitle;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      clearButton.disabled = false;
      closeDropdown();
    };

    const renderDropdown = () => {
      const query = normalizeText(input.value);
      const programs = getGraphCandidates()
        .filter((item) => !query || normalizeText(item.programTitle).includes(query))
        .slice(0, 50);

      dropdown.replaceChildren();
      optionButtons = [];
      highlightedIndex = -1;

      if (!programs.length) appendEmpty(dropdown, '該当する番組がありません');
      else appendGroup(dropdown, optionButtons, '番組', programs, selectProgram);

      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

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

  function createDropdown(container) {
    const dropdown = document.createElement('div');
    dropdown.className = 'search-combobox-dropdown';
    dropdown.hidden = true;
    dropdown.setAttribute('role', 'listbox');
    container.appendChild(dropdown);
    return dropdown;
  }

  function prepareInput(input) {
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
  }

  function bindComboboxEvents({ input, clearButton, dropdown, container, renderDropdown, closeDropdown, getOptionButtons, getHighlightedIndex, setHighlightedIndex }) {
    input.addEventListener('focus', renderDropdown);
    input.addEventListener('input', renderDropdown);
    input.addEventListener('keydown', (event) => handleKeydown({
      event,
      dropdown,
      renderDropdown,
      getOptionButtons,
      getHighlightedIndex,
      setHighlightedIndex
    }));

    clearButton.addEventListener('click', () => {
      closeDropdown();
      input.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!container.contains(event.target)) closeDropdown();
    });
  }

  function handleKeydown({ event, dropdown, renderDropdown, getOptionButtons, getHighlightedIndex, setHighlightedIndex }) {
    const optionButtons = getOptionButtons();
    const currentIndex = getHighlightedIndex();

    const updateHighlight = (nextIndex) => {
      if (!optionButtons.length) return;
      const index = Math.max(0, Math.min(nextIndex, optionButtons.length - 1));
      setHighlightedIndex(index);
      optionButtons.forEach((button, buttonIndex) => {
        button.classList.toggle('is-highlighted', buttonIndex === index);
      });
      optionButtons[index].scrollIntoView({ block: 'nearest' });
    };

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (dropdown.hidden) renderDropdown();
      updateHighlight(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateHighlight(currentIndex <= 0 ? 0 : currentIndex - 1);
    } else if (event.key === 'Enter' && currentIndex >= 0) {
      event.preventDefault();
      optionButtons[currentIndex]?.click();
    } else if (event.key === 'Escape') {
      dropdown.hidden = true;
    }
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

  function appendEmpty(dropdown, text) {
    const empty = document.createElement('div');
    empty.className = 'search-combobox-empty';
    empty.textContent = text;
    dropdown.appendChild(empty);
  }

  function getSnapshotCandidates() {
    const snapshot = state.snapshots?.[state.snapshotIndex];
    const group = snapshot?.types?.[state.rankingType];
    const items = [...(group?.items || []), ...(group?.out || [])];
    return buildCandidates(items);
  }

  function buildCandidates(items) {
    const programMap = new Map();
    const episodeMap = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const programTitle = String(item.programTitle || '').trim();
      const episodeTitle = String(item.episodeTitle || '').trim();
      const episodeId = String(item.episodeId || '').trim();

      if (programTitle && !programMap.has(programTitle)) {
        programMap.set(programTitle, { kind: 'program', programTitle, episodeTitle: '' });
      }

      if (episodeTitle) {
        const key = episodeId || `${programTitle}__${episodeTitle}`;
        if (!episodeMap.has(key)) {
          episodeMap.set(key, { kind: 'episode', programTitle, episodeTitle, episodeId });
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