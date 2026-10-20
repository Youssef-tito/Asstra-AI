export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  // 1. GET: Fetch Conversations from Supabase
  if (req.method === 'GET') {
    if (!supabaseUrl || !supabaseKey) {
      return res.status(200).json({ conversations: [] });
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/conversations?select=*&order=updated_at.desc`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (!response.ok) return res.status(200).json({ conversations: [] });

      const data = await response.json();
      return res.status(200).json({ conversations: data });
    } catch (err) {
      return res.status(200).json({ conversations: [] });
    }
  }

  // 2. POST: Chat & Smart Title Generation
  if (req.method === 'POST') {
    try {
      const { messages, conversationId, title } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages format" });
      }

      if (!openRouterKey) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY missing" });
      }

      const models = [
        "openrouter/free",
        "deepseek/deepseek-r1:free",
        "google/gemini-2.0-flash-exp:free"
      ];

      let replyContent = null;
      let lastError = null;

      for (const model of models) {
        try {
          const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://asstra-ai.vercel.app",
              "X-Title": "ASSTRA AI"
            },
            body: JSON.stringify({
              model: model,
              messages: messages.map(m => ({
                role: m.role === 'model' ? 'assistant' : m.role,
                content: m.content || m.text || ''
              }))
            })
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (aiData.choices && aiData.choices.length > 0) {
              replyContent = aiData.choices[0].message.content;
              break;
            }
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!replyContent) {
        return res.status(502).json({ error: "Failed to get AI response" });
      }

      // Generate a Smart Title using AI if it's a new conversation
      let generatedTitle = title;
      if (!conversationId || conversationId.length < 20 || title === "Nouvelle discussion") {
        try {
          const titleRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "openrouter/free",
              messages: [
                { role: "system", content: "Génère un titre très court (3 à 6 mots maximum) en français qui résume parfaitement la question de l'utilisateur. Réponds uniquement par le titre sans guillemets ni ponctuation." },
                { role: "user", content: messages[0]?.content || messages[0]?.text || "" }
              ]
            })
          });

          if (titleRes.ok) {
            const titleData = await titleRes.json();
            if (titleData.choices && titleData.choices[0]) {
              generatedTitle = titleData.choices[0].message.content.trim();
            }
          }
        } catch (e) {
          generatedTitle = messages[0]?.content?.slice(0, 30) || "Discussion";
        }
      }

      // Save or Update Supabase
      let updatedId = conversationId;
      if (supabaseUrl && supabaseKey) {
        const updatedMessages = [...messages, { role: "assistant", content: replyContent }];

        if (conversationId && conversationId.length > 20) {
          await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              title: generatedTitle,
              messages: updatedMessages,
              updated_at: new Date().toISOString()
            })
          });
        } else {
          const insertRes = await fetch(`${supabaseUrl}/rest/v1/conversations`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              title: generatedTitle,
              messages: updatedMessages
            })
          });

          if (insertRes.ok) {
            const insertedData = await insertRes.json();
            if (insertedData && insertedData[0]) {
              updatedId = insertedData[0].id;
            }
          }
        }
      }

      return res.status(200).json({
        choices: [{ message: { role: "assistant", content: replyContent } }],
        conversationId: updatedId,
        title: generatedTitle
      });

    } catch (error) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
