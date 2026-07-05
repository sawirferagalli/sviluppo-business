# Generatore di Piani di Investimento AI

Prototipo React (Vite) che genera un piano di investimento per startup seed-stage
a partire da idea, settore e budget, con grafici (mercato, allocazione capitale,
proiezioni finanziarie, liquidità nel tempo).

## Struttura

```
├── index.html
├── src/
│   ├── main.jsx        ← entry point
│   └── App.jsx         ← tutto il generatore (form, grafici, logica)
├── api/
│   └── generate.js     ← funzione serverless Vercel: chiama l'API Anthropic
│                          tenendo la chiave al sicuro sul server
├── package.json
└── vite.config.js
```

## 1. Provarlo in locale

```bash
npm install
npm run dev
```

Nota: in locale la funzione in `api/` non gira automaticamente con `vite dev`.
Per testare la generazione AI in locale serve la Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

## 2. Caricarlo su GitHub (cartella/repo separata dagli altri progetti)

```bash
cd business-plan-generator-ai
git init
git add .
git commit -m "Primo commit: generatore di piani di investimento AI"
```

Poi su github.com:
1. Crea un nuovo repository vuoto (es. `business-plan-generator-ai`) — **senza**
   README/gitignore precompilati, per evitare conflitti.
2. Copia i comandi che GitHub ti mostra dopo la creazione, tipo:

```bash
git remote add origin https://github.com/TUO-USERNAME/business-plan-generator-ai.git
git branch -M main
git push -u origin main
```

## 3. Metterlo online con Vercel

1. Vai su [vercel.com](https://vercel.com) e accedi (puoi farlo con l'account GitHub).
2. "Add New… → Project" → seleziona il repository appena creato.
3. Vercel riconosce Vite automaticamente: lascia le impostazioni di default.
4. **Prima di cliccare Deploy**, apri "Environment Variables" e aggiungi:
   - Key: `ANTHROPIC_API_KEY`
   - Value: la tua chiave da [console.anthropic.com](https://console.anthropic.com)
     (Settings → API Keys)
5. Clicca **Deploy**. In circa un minuto avrai un URL pubblico tipo
   `business-plan-generator-ai.vercel.app`.

## Nota sul modello

`src/App.jsx` chiama il modello `claude-sonnet-4-6`. Se una volta online ricevi un
errore "model not found", controlla su console.anthropic.com quale nome di modello
è attivo sulla tua chiave (es. potrebbe essere `claude-sonnet-5` o simile) e
aggiornalo nella chiamata dentro `generate()`.

## Prossimi passi possibili

- Dominio personalizzato su Vercel (gratuito, si aggiunge dal progetto).
- Export PDF del piano generato.
- Salvataggio dei piani generati (richiederebbe un database, es. Vercel Postgres
  o Supabase).
