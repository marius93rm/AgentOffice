# Agent Lobby 2.0

Checkout locale `feat/workspace-decor`. La baseline dell'ultima iterazione ha superato TypeScript e 318 test. La versione originale usata per il confronto è `e23536c`.

## Flusso dei dati

1. Il daemon fornisce snapshot e aggiornamenti di agenti e workspace. Il controller aggiorna la directory, il modello costruisce l'albero dei team e assegna le scrivanie.
2. Il registro di connessione condivide un massimo di otto timeline tra mappa e chat. Il feed aggrega gli eventi prima del rendering e richiede la coda della timeline dopo una riconnessione.
3. Il layout è indipendente dallo stato operativo. Le presenze traducono i cambi di stato in pose e percorsi. Gli sprite sono bitmap indicizzate da 16 × 24 su tile da 16 × 16. Il renderer riutilizza PNG e strisce già preparate.
4. Il modulo risposte traduce domande e permessi nelle richieste originali del provider. I pannelli di supervisione riutilizzano lo stesso feed e lo stesso registro di sottoscrizioni.
5. Le preferenze sono documenti versionati di Paseo. Il replay usa eventi osservati con l'ordine di ricezione come discriminante a parità di timestamp. La demo si alimenta con un adattatore locale.

## Interventi

| N. | Intervento | Dipende da | Moduli | Accettazione | Stato |
| --- | --- | --- | --- | --- | --- |
| 1 | Design system pixel | — | `client/pixel/palette.ts`, `client/art-preview.tsx`, `scripts/render-previews.ts` | Token coerenti, nitidezza e confronto chiaro/scuro | Completed |
| 2 | Font pixel | 1 | `client/pixel/font.ts`, `text.ts` | Rumeno e italiano, misure, fallback ed ellissi | Completed |
| 3 | Avatar | 1 | `shared/avatar.ts`, `characters.ts`, `avatar.tsx` | Layer, anteprima, randomize/reset, salvataggio per agente | Completed |
| 4 | Attività reali | 1, 3 | `client/exchanges.ts`, `client/operations.ts`, `client/use-feed.ts`, `client/office.tsx` | Provenienza, interruzioni, scadenza e pose | Completed |
| 5 | Ruoli | 1, 3 | `client/roles.ts`, `characters.ts`, `scene-model.ts` | Dieci ruoli con fallback e compatibilità label | Completed |
| 6 | Giorno/notte | 1 | `client/lighting.ts`, `client/pixel/palette.ts`, `shared/preferences.ts` | Tre modalità, nessun tick periodico | Completed |
| 7 | Lavagna | 4, 9 | `client/operations.ts`, `client/supervision.tsx`, `client/use-feed.ts` | Task strutturati aggiornati e navigabili | Completed |
| 8 | Notifiche | 4, 17 | `client/notifications.ts`, `client/use-notices.ts`, `client/supervision.tsx` | Deduplica, preferenze, azioni e privacy | Completed |
| 9 | Operazioni live | 4 | `client/use-feed.ts`, `client/operations.ts`, `client/supervision.tsx` | Sorgenti reali, timestamp e stato della connessione | Completed |
| 10 | Timeline e replay | 4, 9 | `client/replay-model.ts`, `client/replay.tsx`, `client/use-playback.ts` | Seek, velocità, ordine deterministico e storia dichiarata | Completed |
| 11 | Metriche | 7, 9 | `client/metrics.ts`, `client/supervision.tsx` | Sorgenti verificabili e valori mancanti espliciti | Completed |
| 12 | Personalizzazione stanze | 1, 6 | `client/office-model.ts`, `client/room-preview.tsx`, `shared/preferences.ts` | Anteprima, migrazione, footprint, porte percorribili | Completed |
| 13 | Vita ambientale | 4, 12 | `client/office-model.ts`, `client/scene-model.ts` | Destinazioni libere e priorità del lavoro reale | Completed |
| 14 | Gatto opzionale | 1, 12, 13 | `client/pet-model.ts`, `client/room-pet.tsx`, `client/pixel/cat.ts` | Sei animazioni, occupazione e riduzione movimento | Completed |
| 15 | Eventi risultati | 4, 8 | `client/visual-events.ts`, `client/use-effects.ts`, `client/office.tsx` | Esiti verificati, durata, deduplica e accodamento | Blocked |
| 16 | Demo | 1–15 | `client/demo.tsx`, `client/demo-model.ts`, `index.client.tsx` | Sei ruoli, scenari riproducibili, comandi locali | Completed |
| 17 | Privacy e screenshot | 1, 9 | `client/privacy.ts`, `client/screenshot.ts`, `client/web.ts` | Redazione in dati e UI, export Web e fallback nativo | Completed |
| 18 | Robustezza e misure | 1–17 | `client/directory-controller.ts`, `tests/`, `scripts/benchmark-lobby.ts` | Race corretta, test verdi, confronto 10/30/100 agenti | Completed |

## Decisioni e limiti delle API

- I permessi hanno un flusso esplicito. Le domande strutturate usano `updatedInput.answers`; un provider con formato sconosciuto apre la chat nativa.
- La lavagna usa gli aggiornamenti strutturati `todo`. L’SDK documenta `pending`, `in_progress` e `completed`. Lobby gestisce anche `blocked` quando il provider lo trasmette esplicitamente. Un ID del provider rimane stabile durante le modifiche al task. In assenza di ID, il titolo e l’occorrenza identificano le voci e un cambio di titolo può comparire come sostituzione.
- La directory applica gli aggiornamenti live e conserva per ogni caricamento le aggiunte, le modifiche e le rimozioni arrivate prima della chiusura della richiesta. La ripresa di una timeline richiede una coda limitata e l’aggiornamento della lavagna su richiesta mantiene il cursore live.
- Le timeline hanno un limite condiviso di otto per connessione. Il replay e il recupero dei task storici usano refetch limitati. La sessione conserva in memoria al massimo 1.200 eventi di replay. La cronologia proiettata può omettere stati, permessi trascorsi e chiusure storiche.
- Gli effetti disponibili coprono completamenti strutturati, test con exit code esplicito, messaggi da agenti ed errori di turno. Il caso ‘report completato’ rimane bloccato perché il contratto Paseo non identifica la consegna di un report. Il livello di gravità dell’errore segue quello esposto dal provider.
- Il PNG Web usa gli stessi layer pixel della scena e le etichette già proiettate con Privacy Mode. Il fallback su iOS e Android usa la cattura di sistema. La verifica del layout a dimensione iPhone è Web. Serve un dispositivo o simulatore per la validazione nativa.
- Il modello di metriche usa gli snapshot della directory e la copertura delle lavagne. La durata osservata misura la creazione fino alla ricezione della chiusura. Il calcolo dei costi e di totali di token o contesto rimane fuori dalle metriche esposte.
- Un cambio di geometria, salvataggio della stanza o zoom può riposizionare il gatto. Il suo percorso usa i tile percorribili e ripianifica quando il prossimo tile risulta occupato.

## Milestone 0 · Preparazione

Analizzati manifest, dipendenze, controller, feed, rendering e SDK. La demo minima e il supporto alle domande sono già presenti nel checkout locale. Il confronto con l'originale viene eseguito su una copia temporanea dello stesso commit, con le stesse dipendenze. La prossima fase interviene su palette, glifi, avatar e ruoli.

## Milestone 1 · Fondamenta grafiche

Palette semantica e anteprima chiaro/scuro in `pixel/palette.ts` e `art-preview.tsx`. Glifi latini estesi, registro di dieci ruoli e avatar a strati con salvataggio per agente. `detail.tsx` e `chat.tsx` aggiornano il pannello inferiore con controlli touch e attività tecniche raggruppate. TypeScript e 320 test passati. Rimane la verifica visiva sul browser a dimensione iPhone. La prossima fase integra il feed operativo.


## Milestone 2 · Attività e supervisione

Implementati classificazione del feed tramite tool strutturati, pose operative, pannelli di attività, notifiche e lavagna. `directory-controller.ts` riconcilia gli update durante un caricamento. TypeScript e 327 test passati, con regressioni per caricamento iniziale, refetch manuale e backstop. Gli stati dei task dipendono dal protocollo del provider. La fase successiva ha introdotto illuminazione, arredi e simulazione.

## Milestone 3 · Simulazione ambientale

`lighting.ts` calcola il passaggio locale di giorno e notte. I file della scena e l’editor mostrano arredi e materiali salvati per workspace. `pet-model.ts` riusa il movimento per le sei pose del gatto. `visual-events.ts` accoda esiti verificati. TypeScript e 335 test passati, di cui 8 dedicati a questa fase. La consegna di un report richiede un segnale del provider. La fase successiva ha implementato il replay e la privacy.

## Milestone 4 · Replay, metriche e privacy

`replay-model.ts` registra eventi ordinati e ricostruisce lo stato tramite checkpoint. `metrics.ts` espone i valori osservati e la loro copertura. `privacy.ts` filtra le informazioni prima del rendering e `screenshot.ts` compone la scena per l’esportazione Web. TypeScript e 342 test passati. La memoria del replay è legata alla sessione. La fase finale completa gli scenari, la regressione del modulo domande e la verifica del runtime.

## Milestone 5 · Consolidamento

Demo con sei ruoli, due scenari, controlli Play, Pause e Restart, e anteprima della chat. Il renderer mantiene stabile la geometria quando cambiano i timestamp e monta le stanze visibili con un margine di un tile. `npm run check` ha superato TypeScript e 343 test in 21 file. `git diff --check` è pulito. Il repository non configura un comando lint.

Con Paseo Web 0.16.1 a 390 × 844 sono stati aperti la Lobby, l’editor di stanza e la demo. Il modulo ha registrato un’opzione singola e due opzioni multiple. La [cattura della chat](docs/lobby-v2-phone.png) mostra il riepilogo dei tool dopo l’espansione. Privacy Mode ha sostituito il nome della stanza. Il comando di esportazione ha generato un link download con un PNG valido e nome neutro. Le [anteprime diurne](docs/lobby-v2-day.png) e [notturne](docs/lobby-v2-night.png) sono state ispezionate come bitmap separate.

La demo, già caricata nel client, è partita con il daemon di prova spento e ha mostrato l’arrivo della squadra completa, incluso il subagente. Il plugin è stato ricaricato sul daemon locale di Paseo e risulta `running`. La verifica nativa su iPhone resta aperta.

## Confronto prestazionale

Stesso Mac Intel i5-1038NG7, Node 24.22.2. `scripts/benchmark-lobby.ts` confronta `e23536c` e 2.0 con fixture uguali. Ogni scenario prevede un primo passaggio da cache fredda, 10 passaggi di riscaldamento e 100 passaggi misurati. Il lavoro misurato comprende directory, layout, presenze, preparazione delle bitmap e piano delle timeline. A 100 agenti sono ripartiti in dieci stanze.

| Agenti | Primo passaggio, ms | Mediana, ms | p95, ms | CPU per 100 passaggi, ms | Picco heap osservato, MiB | Timeline pianificate |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 40,07 → 43,68 | 0,81 → 0,38 | 5,83 → 1,06 | 139,83 → 68,48 | 30,38 → 38,18 | 6 → 6 |
| 30 | 51,90 → 53,78 | 1,48 → 0,46 | 2,46 → 1,01 | 188,69 → 60,33 | 30,84 → 38,99 | 8 → 8 |
| 100 | 143,10 → 109,67 | 3,12 → 1,38 | 5,07 → 3,85 | 470,16 → 261,71 | 31,64 → 40,17 | 8 → 8 |

L’heap include il runtime dei test, le dipendenze caricate e le cache. I tempi del primo passaggio sono più sensibili al carico del sistema. Le misure si riferiscono ai modelli su Node. Commit React, memoria del renderer, timer del client e frame rate su iPhone restano da misurare su un ambiente nativo. I test dei controller, delle sottoscrizioni e dei timer verificano i percorsi di cleanup e riconnessione.
