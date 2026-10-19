module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Configuration serveur manquante : GEMINI_API_KEY introuvable sur Vercel."
      });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const image = typeof body.image === "string" ? body.image : null;
    const incomingContents = Array.isArray(body.contents) ? body.contents : [];

    if (prompt.length > 20000) {
      return res.status(400).json({ error: "Le message est trop long." });
    }

    let imagePart = null;
    if (image) {
      const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match) {
        return res.status(400).json({ error: "Format d'image invalide." });
      }
      const mimeType = match[1];
      const base64 = match[2].replace(/\s/g, "");
      imagePart = { inline_data: { mime_type: mimeType, data: base64 } };
    }

    if (!prompt && !imagePart) {
      return res.status(400).json({ error: "Veuillez envoyer un message ou une image." });
    }

    const contents = [];
    for (const item of incomingContents.slice(-20)) {
      if (!item || !["user", "model"].includes(item.role) || !Array.isArray(item.parts)) continue;
      const safeParts = [];
      for (const part of item.parts.slice(0, 4)) {
        if (part && typeof part.text === "string" && part.text.length <= 20000) {
          safeParts.push({ text: part.text });
        }
      }
      if (safeParts.length > 0) contents.push({ role: item.role, parts: safeParts });
    }

    const currentParts = [];
    if (prompt) currentParts.push({ text: prompt });
    if (imagePart) currentParts.push(imagePart);
    contents.push({ role: "user", parts: currentParts });

    // الاعتماد حصراً على الموديلات الحديثة المتاحة
    const modelsToTry = ["gemini-2.5-flash", "gemini-3.8-flash"];
    let lastErrorMsg = "";

    for (const model of modelsToTry) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "Tu es ASSTRA AI, un assistant intelligent, naturel et sympathique. Utilise uniquement 1 ou 2 emojis pertinents par réponse pour garder un ton dynamique mais professionnel et propre. Évite l'excès d'emojis." }]
            },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
          })
        });

        clearTimeout(timeout);
        const data = await response.json();

        if (response.ok) {
          const reply = data.candidates?.[0]?.content?.parts
            ?.filter(part => typeof part.text === "string")
            .map(part => part.text)
            .join("\n")
            .trim();

          if (reply) {
            return res.status(200).json({ reply, model });
          }
        }

        lastErrorMsg = data.error?.message || `Erreur ${response.status}`;
        console.warn(`Model ${model} failed (${response.status}), trying next model...`);

      } catch (err) {
        clearTimeout(timeout);
        lastErrorMsg = err.message;
      }
    }

    return res.status(503).json({
      error: `⚠️ **Service temporairement indisponible :** (${lastErrorMsg})`
    });

  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: "Le délai de réponse a expiré." });
    }
    return res.status(500).json({ error: "Erreur serveur: " + error.message });
  }
};
