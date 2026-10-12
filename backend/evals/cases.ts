// Domande demo (PROGETTO.md §18) con le risposte attese, ricavate dal dataset e dalla knowledge base.
import type { ToolName } from '@logisticai/shared';

export interface EvalCase {
  id: string;
  categoria: 'rag' | 'dati' | 'ibrida' | 'robustezza';
  domanda: string;
  /** Strumenti che devono comparire, nell'ordine indicato (altri possono esserci in mezzo). */
  strumenti: ToolName[];
  /** Nessuno strumento ammesso (domande fuori ambito). */
  nessunoStrumento?: boolean;
  deveContenere: RegExp[];
  nonDeveContenere?: RegExp[];
  fonte?: RegExp;
  minArtifact?: number;
}

export const CASES: EvalCase[] = [
  { id: 'rag-reclamo-occulto', categoria: 'rag', domanda: 'Il destinatario ha accettato un collo danneggiato senza firmare con riserva: possiamo ancora aprire un reclamo? Entro quanto?', strumenti: ['cerca_knowledge_base'], deveContenere: [/8 giorni/i, /occult/i], fonte: /Procedura reclami e danni|FAQ/ },
  { id: 'rag-express-sardegna', categoria: 'rag', domanda: 'Qual è il tempo di consegna garantito per un Express verso la Sardegna?', strumenti: ['cerca_knowledge_base'], deveContenere: [/non (è )?disponibile/i, /3 giorni/i], fonte: /Catalogo servizi|FAQ/ },
  { id: 'rag-giacenza', categoria: 'rag', domanda: 'Quanti tentativi di consegna facciamo prima di mettere un collo in giacenza, e quanto costa la giacenza al cliente?', strumenti: ['cerca_knowledge_base'], deveContenere: [/\b2\b|due/i, /5(,00)? ?€|€ ?5/, /1(,00)? ?€|€ ?1\b/], fonte: /giacenze|FAQ/i },
  { id: 'rag-farmasalus', categoria: 'rag', domanda: 'FarmaSalus ci manda prodotti a temperatura controllata: qual è la procedura di ricevimento in magazzino?', strumenti: ['cerca_knowledge_base'], deveContenere: [/15/, /25/, /datalogger/i, /quarantena/i], fonte: /Procedure di magazzino/ },
  { id: 'dati-puntualita-hub', categoria: 'dati', domanda: 'Mostrami la puntualità mensile per hub negli ultimi 12 mesi.', strumenti: ['analizza_dati'], deveContenere: [/HUB-VR|Verona/i], minArtifact: 1 },
  { id: 'dati-danni-vettore', categoria: 'dati', domanda: 'Qual è il tasso di danni per vettore nel 2026? Fammi un grafico.', strumenti: ['analizza_dati'], deveContenere: [/VLX|VeloceExpress/, /3[,.][3-6]\d?\s?%/], minArtifact: 1 },
  { id: 'dati-motivi-ritardo', categoria: 'dati', domanda: 'Quali sono i motivi di ritardo più frequenti per area di destinazione?', strumenti: ['analizza_dati'], deveContenere: [/Destinatario assente|Ritardo subvettore|Picco volumi/i], minArtifact: 1 },
  { id: 'dati-margine-cliente', categoria: 'dati', domanda: 'Qual è il margine per cliente nel 2026?', strumenti: ['analizza_dati'], deveContenere: [/CasaViva/, /negativ|perdita|-\s?\d/i], minArtifact: 1 },
  { id: 'ibrida-penale-settembre', categoria: 'ibrida', domanda: 'ModaNova ha diritto a penali per settembre 2026? A quanto ammontano?', strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/93[,.]\d/, /1\.?700(,00)?\s?€|€\s?1\.?700/], nonDeveContenere: [/89[,.]8/], fonte: /Schede SLA per cliente/ },
  { id: 'ibrida-penale-con-grafico', categoria: 'ibrida', domanda: 'ModaNova ha diritto a penali per settembre 2026? A quanto ammontano? Mostrami anche il grafico della puntualità mensile del 2026.', strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/93[,.]\d/, /1\.?700(,00)?\s?€|€\s?1\.?700/], nonDeveContenere: [/5\.?000(,00)?\s?€ per effetto|6\.\d{3}/], fonte: /Schede SLA per cliente/, minArtifact: 1 },
  { id: 'ibrida-penale-luglio', categoria: 'ibrida', domanda: 'ModaNova ha diritto a penali per luglio 2026?', strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/95[,.](5[5-9]|6)/, /(nessuna|non (ha diritto|matura|è dovuta|spetta|scatta))|0,00 ?€/i], fonte: /Schede SLA per cliente/ },
  { id: 'ibrida-sospensione-vettori', categoria: 'ibrida', domanda: 'Secondo la procedura di qualifica, qualche subvettore andrebbe sospeso?', strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/VLX|VeloceExpress/, /sospe/i], fonte: /Qualifica e valutazione subvettori/ },
  { id: 'ibrida-express-sud', categoria: 'ibrida', domanda: "L'Express 24h verso il Sud rispetta i tempi di resa del nostro catalogo servizi?", strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/\bno\b|non (li )?rispett|non (pienamente|del tutto)/i, /[67]\d([,.]\d+)?\s?%/], fonte: /Catalogo servizi/ },
  { id: 'ibrida-sms-giacenze', categoria: 'ibrida', domanda: 'Il preavviso SMS introdotto nel 2025 ha ridotto le giacenze per destinatario assente come previsto dalla procedura?', strumenti: ['cerca_knowledge_base', 'analizza_dati'], deveContenere: [/sì|si,|ridott|calat|diminu/i, /30\s?%|4\d\s?%/], fonte: /giacenze/i },
  { id: 'robustezza-fuori-ambito', categoria: 'robustezza', domanda: 'Qual è la capitale della Francia?', strumenti: [], nessunoStrumento: true, deveContenere: [/spedizion|logistic|Padana/i], nonDeveContenere: [/Parigi/i] },
  { id: 'robustezza-non-in-kb', categoria: 'robustezza', domanda: 'Qual è la policy sulle ferie dei magazzinieri?', strumenti: ['cerca_knowledge_base'], deveContenere: [/non (trovo|è|sono|risulta|contiene)|ufficio del personale/i] },
  { id: 'robustezza-qualita-dati', categoria: 'robustezza', domanda: 'Quanto sono sporchi i dati delle spedizioni? Che pulizia hai fatto?', strumenti: ['analizza_dati'], deveContenere: [/duplicat/i, /240/] },
];
