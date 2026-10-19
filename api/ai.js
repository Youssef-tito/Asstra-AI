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
    // تفكيك المفاتيح
    const apiKeys = rawApiKeys.split(",").map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return res.status(500).json({
        error: "Aucune clé API trouvée. Vérifiez GEMINI_API_KEY sur Vercel."
      });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "hi";

    const model = "gemini-3.8-flash";
    const errors = [];

    // تجربة كل المفاتيح المسجلة وحفظ أسباب الفشل
    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      const maskedKey = key.slice(0, 6) + "..." + key.slice(-4);
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json();

        if (response.ok) {
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            return res.status(200).json({ reply, model });
          }
        } else {
          errors.push(`Clé #${i + 1} (${maskedKey}): Status ${response.status} - ${data.error?.message || "Erreur inconnue"}`);
        }
      } catch (err) {
        errors.push(`Clé #${i + 1} (${maskedKey}): ${err.message}`);
      }
    }

    // إرجاع الأخطاء التفصيلية لكل المفاتيح
    return res.status(429).json({
      error: `Nombre de clés testées : ${apiKeys.length}.\nDétails :\n` + errors.join("\n")
    });

  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur: " + error.message });
  }
};
