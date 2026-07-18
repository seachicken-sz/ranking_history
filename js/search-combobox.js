'use strict';

document.addEventListener('DOMContentLoaded', () => {
  let historyCandidatesCache = null;

  const configs = [
    {
      inputId: 'snapshotSearchInput',
      clearId: 'clearSnapshotSearchButton',
      getCandidates: getSnapshotCandidates,
      includeEpisodes: true,
      requireExactProgramSelection: false
    },
    {
      inputId: 'historySearchInput',
      clear