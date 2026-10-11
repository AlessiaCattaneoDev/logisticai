// Palette dei grafici: blu container per la prima serie, poi tinte distinguibili anche da chi
// ha deficit nella visione dei colori. Il giallo segnaletica è riservato alle linee di soglia.
export const SERIES_COLORS = ['#1f4e8c', '#2a9d8f', '#c2362b', '#7a5195', '#6b7a8f', '#d4840a', '#3d8bd9', '#4f7d3a'];
export const THRESHOLD_COLOR = '#e9b10c';
export const seriesColor = (index: number, explicit?: string) => explicit ?? SERIES_COLORS[index % SERIES_COLORS.length];
