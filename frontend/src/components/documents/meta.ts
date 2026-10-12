import { FileText, Folder, PackageX, ShieldCheck, Truck, Users, Warehouse, type LucideIcon } from 'lucide-react';
import type { DocumentDto, DocumentKind } from '@logisticai/shared';

export const KIND_LABEL: Record<DocumentKind, string> = { pdf: 'PDF', docx: 'Word', txt: 'Testo', md: 'Markdown' };

const ICONS: [RegExp, LucideIcon][] = [
  [/contratt|sla/i, FileText],
  [/serviz|resa|trasport/i, Truck],
  [/reclam|giacenz|dann/i, PackageX],
  [/magazzin|merc/i, Warehouse],
  [/vettor|qualit/i, ShieldCheck],
  [/organizz|faq|contatt/i, Users],
];
export const categoryIcon = (name: string): LucideIcon => ICONS.find(([re]) => re.test(name))?.[1] ?? Folder;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
}

export function documentMeta(d: DocumentDto): string {
  const date = new Date(d.createdAt).toLocaleDateString('it-IT');
  const who = d.origin === 'seed' ? 'Documento iniziale, aggiunto' : `Caricato da ${d.uploadedBy}`;
  const parts = [`${KIND_LABEL[d.kind]}, ${formatSize(d.sizeBytes)}`, `${who} il ${date}`];
  if (d.status === 'ready') parts.push(d.sections === 1 ? '1 sezione' : `${d.sections} sezioni`);
  return parts.join('. ');
}

export const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
