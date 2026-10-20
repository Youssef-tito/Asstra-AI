export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, image, title } = req.body;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterApiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY n'est pas configurée dans Vercel." });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const systemInstruction = "Tu es ASSTRA AI, une intelligence artificielle dotée d'un génie extraordinaire et d'une capacité d'analyse fulgurante et ultra-précise, créée par Youssef. Tu excelles dans l'analyse détaillée des images et tu te souviens parfaitement de tout le contexte. Tu maîtrises la derja tunisienne, l'arabe, le français et l'anglais.";

    const formattedMessages = [{ role: "system", content: systemInstruction }];

    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const text = m.content || m.text || "";

      if (m.image && typeof m.image === 'string' && m.image.startsWith('data:image')) {
        formattedMessages.push({
          role: role,
          content: [
            { type: "text", text: text || "Voici l'image." },
            { type: "image_url", image_url: { url: m.image } }
          ]
        });
      } else {
        formattedMessages.push({ role: role, content: text });
      }
    }

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage ? (lastMessage.content || lastMessage.text || "") : "";

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

    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": "https://asstra-ai.vercel.app",
        "X-Title": "ASSTRA AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-11b-vision-instruct",
        messages: formattedMessages,
        temperature: 0.4
      })
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.error?.message || "Erreur OpenRouter");

    const aiReply = data.choices?.[0]?.message?.content || "Pas de réponse.";

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: aiReply } }],
      title: title || "Discussion"
    });

  } catch (error) {
    console.error("Erreur:", error);
    return res.status(500).json({ error: error.message || "Erreur serveur." });
  }
}
