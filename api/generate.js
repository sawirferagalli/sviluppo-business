// Funzione serverless Vercel: fa da proxy verso l'API Gemini (livello gratuito).
// La chiave resta sul server (variabile d'ambiente GEMINI_API_KEY).
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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { maxOutputTokens: 1500 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Errore Gemini" });
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Errore interno del server" });
  }
}
