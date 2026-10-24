export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, image } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages invalides.' });
    }

    // تنسيق الرسائل ودعم الصور (Vision)
    const formattedMessages = messages.map((msg, index) => {
      if (index === messages.length - 1 && image) {
        return {
          role: msg.role,
          content: [
            { type: "text", text: msg.content || "Analyse cette image." },
            { type: "image_url", image_url: { url: image } }
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // Request إلى OpenRouter بموديل شغال مجاني ومحدد الـ tokens
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://asstra-ai.vercel.app',
        'X-Title': 'ASSTRA AI'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // موديل قوي جداً وشغال مع Vision
        max_tokens: 1500, // تحديد عدد التوكينز لتفادي خطأ الرصيد
        messages: [
          {
            role: 'system',
            content: 'Tu es ASSTRA AI, un assistant intelligent créé par Youssef. Tu réponds de manière claire, efficace et professionnelle. Tu peux analyser les images avec précision.'
          },
          ...formattedMessages
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erreur lors de la réponse AI');
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur.' });
  }
}
