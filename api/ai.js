import { createClient } from '@supabase/supabase-js';

// Init Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

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

  // 1. Fetch Conversations from Supabase
  if (req.method === 'GET') {
    if (!supabase) {
      return res.status(200).json({ conversations: [] });
    }
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ conversations: data });
  }

  // 2. Chat with AI & Save to Supabase
  if (req.method === 'POST') {
    try {
      const { messages, conversationId, title } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages format" });
      }

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
      }

      // Models list with fallback logic
      const models = [
        "openrouter/auto",
        "deepseek/deepseek-r1:free",
        "google/gemini-2.0-flash-exp:free"
      ];

      let replyContent = null;
      let lastError = null;

      for (const model of models) {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://asstra-ai.vercel.app",
              "X-Title": "ASSTRA AI"
            },
            body: JSON.stringify({
              model: model,
              messages: messages
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
              replyContent = data.choices[0].message.content;
              break; // Success!
            }
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!replyContent) {
        return res.status(502).json({ error: "Failed to get AI response", details: lastError?.message });
      }

      // Save updated conversation to Supabase
      let updatedId = conversationId;
      if (supabase) {
        const updatedMessages = [...messages, { role: "assistant", content: replyContent }];
        const convTitle = title || messages[0]?.content?.slice(0, 30) || "Nouvelle discussion";

        if (conversationId) {
          await supabase
            .from('conversations')
            .update({ messages: updatedMessages, updated_at: new Date() })
            .eq('id', conversationId);
        } else {
          const { data } = await supabase
            .from('conversations')
            .insert([{ title: convTitle, messages: updatedMessages }])
            .select();
          if (data && data.length > 0) {
            updatedId = data[0].id;
          }
        }
      }

      return res.status(200).json({
        choices: [{ message: { role: "assistant", content: replyContent } }],
        conversationId: updatedId
      });

    } catch (error) {
      return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
  }
}
