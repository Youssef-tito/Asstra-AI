export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; // A3mel configuration lel clef mte3ek fel Vercel Environment Variables

    if (!apiKey) {
      return res.status(500).json({ error: "API Key manquante sur le serveur." });
    }

    const latestMessage = messages[messages.length - 1]?.content || "";

    // Nabaathou el request lel Gemini API m3a tlab el a5bar w el real-time search
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Tu es ASSTRA AI, un assistant intelligent, rapide et professionnel. Tu peux répondre aux actualités, aux actualités tunisiennes et mondiales (style Al Jazeera) en cherchant les informations exactes. Réponds toujours dans la langue de l'utilisateur (français ou tunisien/arabe selon sa demande). Question : ${latestMessage}` }]
          }
        ]
      })
    });

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu récupérer l'information.";

    return res.status(200).json({
      choices: [{ message: { content: reply } }]
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
