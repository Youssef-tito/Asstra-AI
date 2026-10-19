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
    const rawApiKeys = process.env.GEMINI_API_KEY || "";
    const apiKeys = rawApiKeys.split(",").map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return res.status(500).json({
        error: "Aucune clé API trouvée sur Vercel."
      });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const image = typeof body.image === "string" ? body.image : null;
    const incomingContents = Array.isArray(body.contents) ? body.contents : [];

    if (!prompt && !image) {
      return res.status(400).json({ error: "Veuillez envoyer un message ou une image." });
    }

    const contents = [];
    for (const item of incomingContents.slice(-10)) {
      if (!item || !["user", "model"].includes(item.role) || !Array.isArray(item.parts)) continue;
      const safeParts = [];
      for (const part of item.parts.slice(0, 2)) {
        if (part && typeof part.text === "string" && part.text.length <= 10000) {
          safeParts.push({ text: part.text });
        }
      }
      if (safeParts.length > 0) contents.push({ role: item.role, parts: safeParts });
    }

    const currentParts = [];
    if (prompt) currentParts.push({ text: prompt });
    if (image) {
      const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (match) {
        currentParts.push({ inline_data: { mime_type: match[1], data: match[2].replace(/\s/g, "") } });
      }
    }
    contents.push({ role: "user", parts: currentParts });

    const model = "gemini-3.8-flash";
    let lastError = null;

    // Loop 3la كل API Keys
    for (const key of apiKeys) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      // Retry 3 مرات ki ykon fma pressure (503)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: "Tu es ASSTRA AI, un assistant intelligent, naturel et rapide." }]
              },
              contents,
              generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
            })
          });

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
          } else {
            lastError = data.error?.message || `Status ${response.status}`;

            // Ki ykon 503 (Overloaded) nestanew chwaya (1sec, 2sec) w na3mlou retry
            if (response.status === 503) {
              await new Promise(r => setTimeout(r, attempt * 1000));
            } else {
              // Ki ykon 429 (Quota), nemchiw toul lil-Key el ba3dou
              break;
            }
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }

    return res.status(503).json({
      error: `Erreur serveur Google : ${lastError}`
    });

  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur: " + error.message });
  }
};
