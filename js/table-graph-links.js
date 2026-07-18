'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('rankingTableBody');
  const headerRow = document.querySelector('#rankingTableSection thead tr');
  const graphSection = document.getElementById('graphSection');
  const graphModeButton = document.querySelector('[data-view-mode="graph"]');
  const programSearchInput = document.getElementById('programSearchInput');
  const programSelect = document.getElementById('programSelect');

  if (!tableBody || !headerRow || !graphModeButton || !programSearchInput || !programSelect) return;

  ensureGraphHeader();
  addGraphButtons();

  const observer = new MutationObserver(() => {
    addGraphButtons();
  });

  observer.observe(tableBody, { childList: true });

  function ensureGraphHeader() {
    if (headerRow.querySelector('.table-graph-header')) return;

    const header = document.createElement('th');
    header.className = 'table-graph-header';
    header.scope = 'col';
    header.textContent = 'グラフ';
    headerRow.appendChild(header);
  }

  function addGraphButtons() {
    Array.from(tableBody.querySelectorAll('tr')).forEach((row) => {
      if (row.querySelector('.table-graph-cell')) return;

      const programTitle = row.querySelector('.program-title')?.textContent?.trim() || '';
      if (!programTitle || programTitle === '番組名なし') return;

      const cell = document.createElement('td');
      cell.className = 'table-graph-cell';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-graph-button';
      button.setAttribute('aria-label', `${programTitle}の順位推移グラフを見る`);
      button.title = 'グラフを見る';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19H20M7 15l4-4 3 3 5-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openProgramGraph(programTitle);
      });

      cell.appendChild(button);
      row.appendChild(cell);
    });
  }

  function openProgramGraph(programTitle) {
    if (typeof state === 'undefined') return;

    state.programSearch = '';
    if (typeof buildProgramSelect === 'function') buildProgramSelect();

    state.selectedProgram = programTitle;
    programSearchInput.value = programTitle;
    programSelect.value = programTitle;

    graphModeButton.click();

    programSelect.value = programTitle;
    programSelect.dispatchEvent(new Event('change', { bubbles: true }));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        graphSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
});
