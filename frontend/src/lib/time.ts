const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "oggi", "ieri", "3 giorni fa", poi la data: come si parla in ufficio. */
export function relativeDay(iso: string, now = new Date()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (diff <= 0) return 'oggi';
  if (diff === 1) return 'ieri';
  if (diff < 7) return `${diff} giorni fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

export const longDate = (now = new Date()) => {
  const s = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
