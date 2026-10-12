// Contratti della piattaforma: libreria documenti, ambito della chat, home.

export type DocumentStatus = 'processing' | 'ready' | 'error';
export type DocumentKind = 'pdf' | 'docx' | 'txt' | 'md';

export interface DocumentCategoryDto {
  id: string;
  name: string;
  description: string;
  documents: number;
  ready: number;
}

export interface DocumentDto {
  id: string;
  title: string;
  fileName: string;
  kind: DocumentKind;
  sizeBytes: number;
  category: { id: string; name: string };
  uploadedBy: string;
  origin: 'seed' | 'upload';
  status: DocumentStatus;
  errorMessage: string | null;
  sections: number;
  createdAt: string;
  canDelete: boolean;
}

/** Chat limitata a un documento o a una categoria ("Chiedi a questo documento"). */
export interface ChatScope {
  type: 'document' | 'category';
  id: string;
  label: string;
}

export interface HomeData {
  utente: { nome: string; ruolo: 'OPERATOR' | 'ADMIN' };
  kpi: {
    documentiDisponibili: number;
    categorie: number;
    conversazioni: number;
    domandeMese: number;
    risposteUtiliPct: number | null;
  };
  domandePerTipo: { tipo: string; domande: number }[];
  domandeGiornaliere: { giorno: string; domande: number }[];
  conversazioniRecenti: { id: string; title: string; updatedAt: string }[];
  documentiRecenti: { id: string; title: string; categoria: string; status: DocumentStatus; createdAt: string }[];
  admin?: {
    costoOggiEur: number;
    budgetGiornalieroEur: number;
    segnalazioniDaRivedere: number;
    servizi: Record<string, 'ok' | 'down'>;
  };
}
