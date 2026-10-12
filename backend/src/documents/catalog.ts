// Categorie iniziali della libreria e collocazione dei 10 documenti della knowledge base originale.

export const DEFAULT_CATEGORIES = [
  { name: 'Contratti e SLA clienti', description: 'Schede SLA, penali e condizioni di trasporto concordate con i clienti' },
  { name: 'Servizi e tempi di resa', description: 'Catalogo dei servizi, tempi di consegna e vettori per area' },
  { name: 'Reclami e giacenze', description: 'Procedure per danni, reclami, tentativi di consegna e giacenze' },
  { name: 'Magazzino e merci speciali', description: 'Ricevimento, stoccaggio, inventario, merci pericolose e voluminose' },
  { name: 'Vettori e qualità', description: 'Qualifica, valutazione e sospensione dei subvettori' },
  { name: 'Organizzazione e FAQ', description: 'Contatti, reparti, escalation e domande frequenti' },
] as const;

/** File della knowledge base originale -> categoria. */
export const SEED_DOCUMENTS: Record<string, (typeof DEFAULT_CATEGORIES)[number]['name']> = {
  '01_organizzazione_e_contatti.md': 'Organizzazione e FAQ',
  '02_catalogo_servizi_tempi_di_resa.md': 'Servizi e tempi di resa',
  '03_condizioni_generali_di_trasporto.md': 'Contratti e SLA clienti',
  '04_schede_sla_clienti.md': 'Contratti e SLA clienti',
  '05_procedura_reclami_e_danni.md': 'Reclami e giacenze',
  '06_giacenze_e_tentativi_di_consegna.md': 'Reclami e giacenze',
  '07_procedure_di_magazzino.md': 'Magazzino e merci speciali',
  '08_merci_pericolose_e_prodotti_speciali.md': 'Magazzino e merci speciali',
  '09_qualifica_subvettori.md': 'Vettori e qualità',
  '10_faq_customer_service.md': 'Organizzazione e FAQ',
};
