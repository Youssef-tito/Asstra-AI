export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Erreur: OPENROUTER_API_KEY n'est pas définie sur Vercel." });
    }

    const body = req.body || {};
    const messages = body.messages || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Aucun message reçu." });
    }

    const formattedMessages = [
      {
        role: "system",
        content: "Tu es ASSTRA AI, un assistant intelligent. Réponds dans la même langue que l'utilisateur."
      },
      ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }))
    ];

    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://asstra-ai.vercel.app",
        "X-Title": "ASSTRA AI"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: formattedMessages,
        temperature: 0.5
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return res.status(502).json({ 
        error: `OpenRouter Error (${apiResponse.status}): ${data.error?.message || JSON.stringify(data)}` 
      });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: "Erreur: Le modèle n'a renvoyé aucune réponse." });
    }

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: reply } }],
      title: body.title || "Discussion"
    });

  } catch (err) {
    return res.status(500).json({ error: `Server Exception: ${err.message}` });
  }
}
