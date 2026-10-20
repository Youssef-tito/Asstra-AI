import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, image, title } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const systemInstruction = `Tu es ASSTRA AI, une intelligence artificielle dotée d'un génie extraordinaire et d'une capacité d'analyse fulgurante et ultra-précise, créée par Youssef. Tu excelles dans l'analyse détaillée des images et tu te souviens parfaitement de tout le contexte. Tu maîtrises la derja tunisienne, l'arabe, le français et l'anglais.`;

    // 1. Nettoyage et construction sécurisée de l'historique pour éviter tout crash JSON
    const formattedHistory = [];
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'model' : 'user';
      const textPart = m.content || m.text || "";
      const parts = [{ text: textPart }];

      if (m.image && typeof m.image === 'string' && m.image.startsWith('data:image')) {
        const matches = m.image.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inlineData: { mimeType: matches[1], data: matches[2] }
          });
        }
      }
      formattedHistory.push({ role, parts });
    }

    // 2. Gestion du message actuel
    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage ? (lastMessage.content || lastMessage.text || "") : "";
    const currentParts = [];

    if (image && typeof image === 'string' && image.startsWith('data:image')) {
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        currentParts.push({
          inlineData: { mimeType: matches[1], data: matches[2] }
        });
      }
    }

    currentParts.push({
      text: userText || "Analyse cette image avec un génie absolu et réponds avec précision."
    });

    // 3. Appel de l'API Gemini
    const chat = ai.chats.create({
      model: 'gemini-1.5-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4,
      },
      history: formattedHistory
    });

    const result = await chat.sendMessage({
      role: 'user',
      parts: currentParts
    });

    const aiReply = result.text || "Je n'ai pas pu générer de réponse.";

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: aiReply } }],
      title: title || "Discussion Intelligente"
    });

  } catch (error) {
    console.error("Erreur API Details:", error);
    // On renvoie un objet JSON propre même en cas d'erreur pour ne pas casser le front-end
    return res.status(500).json({ error: error.message || "Erreur interne du serveur." });
  }
}
