import { z } from 'zod';
import type { ToolName } from '@logisticai/shared';
import type { ToolDefinition } from '../llm/types.js';

// Validazione degli argomenti generati dall'LLM (mai fidarsi dell'output del modello).
export const toolArgs = {
  cerca_knowledge_base: z.object({
    query: z.string().trim().min(2).max(500),
    cliente: z.string().trim().max(100).optional(),
    top_k: z.number().int().min(1).max(8).optional(),
  }),
  analizza_dati: z.object({
    domanda: z.string().trim().min(3).max(2000),
    genera_grafico: z.boolean().default(false),
    regole_da_applicare: z.string().trim().max(4000).optional(),
  }),
} satisfies Record<ToolName, z.ZodType>;

// Le descrizioni sono la parte più importante del routing: dicono QUANDO usare ogni tool.
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'cerca_knowledge_base',
    description:
      'Cerca nei documenti aziendali di Padana Logistics: schede SLA dei clienti (soglie di puntualità, penali, esclusioni), ' +
      'catalogo servizi e tempi di resa, condizioni di trasporto e massimali, procedura reclami e danni, giacenze, ' +
      'procedure di magazzino, merci pericolose, qualifica dei subvettori, organizzazione, FAQ. ' +
      'Usalo per QUALSIASI regola, soglia, procedura, scadenza o definizione. ' +
      'Esempi: "entro quanto si apre un reclamo per danno occulto?", "qual è la penale di ModaNova?". ' +
      'NON usarlo per numeri calcolati sullo storico spedizioni (per quelli usa analizza_dati).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cosa cercare, in italiano, con le parole chiave della domanda.' },
        cliente: { type: 'string', description: 'Nome esatto del cliente se la domanda riguarda il suo SLA (es. "ModaNova").' },
        top_k: { type: 'integer', description: 'Numero di estratti da restituire (1-8, default 5).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'analizza_dati',
    description:
      "Delega l'analisi dello storico spedizioni (ottobre 2024 - settembre 2026) a un analista dati Python che pulisce i dati, " +
      'calcola KPI e crea grafici e tabelle mostrati direttamente all’utente. ' +
      'Usalo per puntualità, ritardi e motivi, danni, giacenze, volumi, costi, ricavi, margini, trend, classifiche, confronti. ' +
      'Esempi: "puntualità mensile per hub", "tasso di danni per vettore nel 2026", "margine per cliente". ' +
      'Se il calcolo dipende da regole contrattuali (penali, soglie SLA, esclusioni dal calcolo, soglie dei subvettori, tempi di resa): ' +
      'PRIMA chiama cerca_knowledge_base in un passaggio separato, leggi il risultato, POI chiama questo strumento riportando ' +
      'in regole_da_applicare i valori concreti trovati (mai frasi generiche come "se presenti"). ' +
      'NON usarlo per domande su procedure o regole.',
    parameters: {
      type: 'object',
      properties: {
        domanda: { type: 'string', description: 'La richiesta di analisi, precisa e autosufficiente (periodo, cliente, raggruppamenti).' },
        genera_grafico: { type: 'boolean', description: 'true se un grafico o una tabella aiutano la risposta.' },
        regole_da_applicare: {
          type: 'string',
          description:
            'Valori concreti letti nella knowledge base, da applicare al calcolo. Es.: "Soglia 95%. Penale 1.000 € per punto sotto soglia, tetto 5.000 € al mese. Escludere dal calcolo: Meteo avverso, Destinatario assente, Indirizzo errato, spedizioni In transito. Penale non applicabile sotto 50 spedizioni nel mese."',
        },
      },
      required: ['domanda', 'genera_grafico'],
      additionalProperties: false,
    },
  },
];
