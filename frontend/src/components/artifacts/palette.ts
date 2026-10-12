// Palette dei grafici Cargo: il cobalto apre sempre, poi tinte distinguibili anche da chi ha
// deficit nella visione dei colori. L'arancio container è riservato alle linee di soglia.
export const SERIES_COLORS = ['#3b5bfd', '#14a38b', '#8b5cf6', '#e0457b', '#38bdf8', '#64748b', '#84a33a', '#1c1a4a'];
export const THRESHOLD_COLOR = '#ff7a1a';
export const seriesColor = (index: number, explicit?: string) => explicit ?? SERIES_COLORS[index % SERIES_COLORS.length];
