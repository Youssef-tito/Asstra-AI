export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, image, title } = req.body;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterApiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY n'est pas configurée dans Vercel." });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage ? (lastMessage.content || lastMessage.text || "") : "";

    const systemInstruction = `Tu es ASSTRA AI, une intelligence artificielle créée par Youssef. 
Tu as la capacité de chercher sur Internet pour donner les actualités exactes et vérifiées.
RÈGLE TRÈS IMPORTANTE SUR LA LANGUE : Tu dois TOUJOURS répondre dans la EXACTE MÊME LANGUE ou le MÊME DIALECTE que l'utilisateur utilise dans son dernier message (derja tunisienne, français, arabe classique...).`;

    const formattedMessages = [{ role: "system", content: systemInstruction }];

    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const text = m.content || m.text || "";
      formattedMessages.push({ role: role, content: text });
    }

    if (image && typeof image === 'string' && image.startsWith('data:image')) {
      formattedMessages.push({
        role: "user",
        content: [
          { type: "text", text: userText || "Analyse cette image." },
          { type: "image_url", image_url: { url: image } }
        ]
      });
    } else {
      formattedMessages.push({
        role: "user",
        content: userText || "Analyse cette demande."
      });
    }

    // Utilisation de Perplexity Sonar pour activer le Web Search automatique
    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": "https://asstra-ai.vercel.app",
        "X-Title": "ASSTRA AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "perplexity/sonar", 
        messages: formattedMessages,
        temperature: 0.3
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.error?.message || "Erreur OpenRouter");
    }

    const aiReply = data.choices?.[0]?.message?.content || "Désolé, pas de réponse.";

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: aiReply } }],
      title: title || "Discussion"
    });

  } catch (error) {
    console.error("Erreur Backend API:", error);
    return res.status(500).json({ error: error.message || "Erreur interne du serveur." });
  }
}
