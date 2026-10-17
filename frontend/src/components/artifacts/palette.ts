// Palette dei grafici Cargo: il corallo apre sempre, poi tinte distinguibili anche da chi ha
// deficit nella visione dei colori. Il nero caffè tratteggiato è riservato alle linee di soglia.
export const SERIES_COLORS = ['#ff6f59', '#14a38b', '#8b5cf6', '#2f6fed', '#e0a82e', '#64748b', '#84a33a', '#181010'];
export const THRESHOLD_COLOR = '#181010';
export const seriesColor = (index: number, explicit?: string) => explicit ?? SERIES_COLORS[index % SERIES_COLORS.length];
