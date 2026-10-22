export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key manquante sur le serveur." });
    }

    const formattedContents = messages.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content || "" }]
    }));

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: formattedContents,
        tools: [{ google_search: {} }] // Zidna Recherche Google Real-Time
      })
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(data.error?.message || "Erreur Gemini API");

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu répondre.";

    return res.status(200).json({
      choices: [{ message: { content: reply } }]
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
