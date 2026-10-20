export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, image, title } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY n'est pas configurée dans Vercel." });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const systemInstruction = "Tu es ASSTRA AI, une intelligence artificielle dotée d'un génie extraordinaire et d'une capacité d'analyse fulgurante et ultra-précise, créée par Youssef. Tu excelles dans l'analyse détaillée des images et tu te souviens parfaitement de tout le contexte. Tu maîtrises la derja tunisienne, l'arabe, le français et l'anglais.";

    // Préparation des contenus pour l'API Gemini REST
    const contents = [];

    // Ajout de l'historique
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'model' : 'user';
      const text = m.content || m.text || "";
      
      const parts = [{ text: text }];
      if (m.image && typeof m.image === 'string' && m.image.startsWith('data:image')) {
        const matches = m.image.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inline_data: { mime_type: matches[1], data: matches[2] }
          });
        }
      }
      contents.push({ role, parts });
    }

    // Message actuel et image éventuelle
    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage ? (lastMessage.content || lastMessage.text || "") : "";
    const currentParts = [];

    if (image && typeof image === 'string' && image.startsWith('data:image')) {
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        currentParts.push({
          inline_data: { mime_type: matches[1], data: matches[2] }
        });
      }
    }

    currentParts.push({
      text: userText || "Analyse cette image avec un génie absolu et réponds avec précision."
    });

    contents.push({ role: 'user', parts: currentParts });

    // Appel direct via l'API REST de Gemini 1.5 Flash
    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: contents,
          generationConfig: { temperature: 0.4 }
        })
      }
    );

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.error?.message || "Erreur de l'API Gemini");
    }

    const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Je n'ai pas pu générer de réponse.";

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: aiReply } }],
      title: title || "Discussion Intelligente"
    });

  } catch (error) {
    console.error("Erreur API Details:", error);
    return res.status(500).json({ error: error.message || "Erreur interne du serveur." });
  }
}
