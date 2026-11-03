// Shared by the first HTML paint and React so the loading animation stays steady.
export const loadingAnimationMarkup = '<span class="loading-steam"></span><span class="loading-steam"></span><span class="loading-steam"></span><span class="loading-bowl"></span>';
export const bootLoadingMarkup = `<div class="app-loading-screen" role="status" aria-label="正在載入" aria-busy="true"><div class="loading-animation" aria-hidden="true">${loadingAnimationMarkup}</div></div>`;
