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

    const systemInstruction = `Tu es ASSTRA AI, un assistant intelligent, ultra-rapide et bienveillant, créé par Youssef. Tu analyses les images avec un soin extrême, tu comprends le contexte en derja tunisienne, arabe, français ou anglais, et tu te souviens parfaitement de tous les détails des images et de la conversation précédente pour y faire référence quand l'utilisateur le demande.`;

    // N7awlou n7afzou el-history w nzidou el-images ken mawjoudin fel messages el-qdimin
    const formattedHistory = messages.slice(0, -1).map(m => {
      const parts = [{ text: m.content || m.text || "" }];
      if (m.image && typeof m.image === 'string' && m.image.startsWith('data:image')) {
        const matches = m.image.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inlineData: { mimeType: matches[1], data: matches[2] }
          });
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: parts
      };
    });

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage ? (lastMessage.content || lastMessage.text || "") : "";

    const currentParts = [];

    // Ken fama taswira jdida mabaathha tawa
    if (image && typeof image === 'string' && image.startsWith('data:image')) {
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        currentParts.push({
          inlineData: { mimeType: matches[1], data: matches[2] }
        });
      }
    }

    currentParts.push({
      text: userText || "Analyse cette image en détail s'il te plaît."
    });

    const chat = ai.chats.create({
      model: 'gemini-1.5-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
      history: formattedHistory
    });

    const result = await chat.sendMessage({
      role: 'user',
      parts: currentParts
    });

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: result.text } }],
      title: title || "Nouvelle discussion"
    });

  } catch (error) {
    console.error("Erreur API:", error);
    return res.status(500).json({ error: error.message || "Erreur serveur" });
  }
}
