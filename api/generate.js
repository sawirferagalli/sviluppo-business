// Funzione serverless Vercel: fa da proxy verso l'API Gemini (livello gratuito).
// La chiave resta sul server (variabile d'ambiente GEMINI_API_KEY).

// Direttive di qualità applicate a ogni chiamata, indipendentemente dal
// system prompt inviato dal client: evitano piani generici che potrebbero
// andare bene per qualsiasi startup.
const QUALITY_DIRECTIVES = `
Regole di specificità obbligatorie:
- Usa ogni dato specifico fornito dall'utente (nome azienda, settore, competitor nominati, cifre di capitale/ricavi, team, vantaggio competitivo, fase dell'azienda, modello di business, uso del capitale, orizzonte temporale). Ogni affermazione del piano deve derivare da almeno uno di questi dati, non da un cliché generico valido per qualsiasi startup.
- Se manca un dato specifico su un punto, dillo esplicitamente nel testo (es. "dato non fornito, si assume uno scenario prudenziale") invece di inventare un dettaglio plausibile ma generico.
- Adatta tono e contenuto alla fase dell'azienda indicata: un'idea appena nata ha bisogno di enfasi sulla validazione di mercato, un'azienda con ricavi stabili ha bisogno di enfasi su piani di scala.`;

function extractJsonCandidate(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return cleaned;
}

function isValidJson(rawText) {
  const candidate = extractJsonCandidate(rawText);
  if (!candidate) return false;
  try {
    JSON.parse(candidate);
    return true;
  } catch (_) {
    try {
      JSON.parse(candidate.replace(/[\r\n\t]+/g, " "));
      return true;
    } catch (_e) {
      return false;
    }
  }
}

async function callGemini(system, userText, extraInstructions) {
  const fullSystem = [system, QUALITY_DIRECTIVES, extraInstructions].filter(Boolean).join("\n\n");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: fullSystem }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          maxOutputTokens: 8000,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, status: response.status, error: data.error?.message || "Errore Gemini" };
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return { ok: true, text };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error:
        "Variabile GEMINI_API_KEY non impostata. Aggiungila nelle Environment Variables del progetto su Vercel.",
    });
  }

  try {
    const { system, messages } = req.body;
    const userText = (messages || []).map((m) => m.content).join("\n");

    const firstAttempt = await callGemini(system, userText);
    if (!firstAttempt.ok) {
      return res.status(firstAttempt.status).json({ error: firstAttempt.error });
    }
    if (isValidJson(firstAttempt.text)) {
      return res.status(200).json({ content: [{ type: "text", text: firstAttempt.text }] });
    }

    const secondAttempt = await callGemini(
      system,
      userText,
      "Rispondi SOLO con JSON valido secondo lo schema richiesto, nessun testo prima o dopo."
    );
    if (!secondAttempt.ok) {
      return res.status(secondAttempt.status).json({ error: secondAttempt.error });
    }
    if (isValidJson(secondAttempt.text)) {
      return res.status(200).json({ content: [{ type: "text", text: secondAttempt.text }] });
    }

    return res.status(502).json({
      error: "Il modello non è riuscito a generare un piano in formato valido dopo due tentativi. Riprova.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Errore interno del server" });
  }
}
