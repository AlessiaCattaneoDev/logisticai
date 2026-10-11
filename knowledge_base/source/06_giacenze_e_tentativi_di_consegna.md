# Gestione giacenze e tentativi di consegna

Procedura operativa PO-CS-06 di Padana Logistics S.r.l. - revisione 2, marzo 2025.

## Tentativi di consegna

Per ogni spedizione il vettore effettua fino a **2 tentativi di consegna** in due giorni lavorativi diversi.

Se al primo tentativo il destinatario è assente, il vettore lascia un avviso con il numero di spedizione e i contatti del Customer Service, e registra il motivo "Destinatario assente". Il secondo tentativo avviene il giorno lavorativo successivo.

Se anche il secondo tentativo fallisce, la spedizione entra **in giacenza** presso il deposito del vettore.

## Giacenza

- **Durata massima:** 10 giorni lavorativi dalla data di apertura della giacenza.
- **Costi a carico del cliente:** 5 € per l'apertura della giacenza + 1 € per ogni giorno lavorativo di giacenza.
- **Svincolo:** durante la giacenza il Customer Service contatta il destinatario e il cliente per concordare una nuova consegna, il ritiro in deposito o un nuovo indirizzo.
- **Fine giacenza:** se la giacenza non viene svincolata entro 10 giorni lavorativi, la spedizione è restituita al mittente (**reso al mittente**). Il reso costa al cliente quanto la tariffa di andata.

Le giacenze per destinatario assente o per indirizzo errato non contano come ritardo ai fini dello SLA (motivi non imputabili).

## Indirizzo errato o incompleto

Se l'indirizzo è errato o incompleto, il vettore registra il motivo "Indirizzo errato" e il Customer Service chiede al cliente l'indirizzo corretto. Senza risposta entro 5 giorni lavorativi la spedizione viene resa al mittente.

## Preavviso SMS (dal 1° marzo 2025)

Dal **1° marzo 2025** per tutte le consegne **B2C** (destinatari privati) il destinatario riceve un SMS il giorno lavorativo prima della consegna con:
- la fascia oraria prevista (mattina o pomeriggio);
- un link per riprogrammare la consegna o scegliere il ritiro in un punto convenzionato.

Obiettivo della procedura: ridurre di almeno il **30%** le mancate consegne per destinatario assente sulle consegne B2C rispetto al periodo precedente l'introduzione.

L'SMS richiede che il cliente trasmetta il numero di cellulare del destinatario. Se il numero manca, l'SMS non viene inviato e la consegna segue la procedura standard.

## Cosa dire al cliente o al destinatario

- Il destinatario può chiedere una nuova data di consegna gratuita **prima** del secondo tentativo.
- Dopo l'apertura della giacenza si applicano i costi di giacenza.
- Il cambio di indirizzo dopo il ritiro è possibile solo nella stessa area di destinazione e richiede l'autorizzazione del cliente mittente.
