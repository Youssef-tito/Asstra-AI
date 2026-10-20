module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY introuvable sur Vercel."
      });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const incomingContents = Array.isArray(body.contents) ? body.contents : [];

    if (!prompt) {
      return res.status(400).json({ error: "Veuillez envoyer un message." });
    }

    const messages = [
      { role: "system", content: "Tu es ASSTRA AI, un assistant intelligent, naturel et ultra rapide." }
    ];

    for (const item of incomingContents.slice(-6)) {
      if (item && ["user", "assistant"].includes(item.role) && Array.isArray(item.parts)) {
        const text = item.parts.map(p => p.text).join(" ");
        if (text) messages.push({ role: item.role, content: text });
      }
    }

    messages.push({ role: "user", content: prompt });

    // Active 100% Free models on OpenRouter
    const modelsToTry = [
      "deepseek/deepseek-r1:free",
      "deepseek/deepseek-chat:free",
      "meta-llama/llama-3.1-8b-instruct:free",
      "mistralai/mistral-7b-instruct:free"
    ];

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://asstra-ai.vercel.app",
            "X-Title": "ASSTRA AI",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 2048
          })
        });

        const data = await response.json();

        if (response.ok) {
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            return res.status(200).json({ reply, model });
          }
        } else {
          lastError = data.error?.message || response.statusText;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    return res.status(500).json({
      error: "Erreur OpenRouter: " + lastError
    });

  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur: " + error.message });
  }
};
