import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, messages, image, title, conversationId } = req.body;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    // Action 1: Save Conversation
    if (action === "save" && supabase) {
      if (!conversationId) return res.status(400).json({ error: "conversationId required" });
      const { data, error } = await supabase.from('conversations').upsert({
        id: conversationId,
        title: title || "Discussion",
        messages: messages || [],
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // Action 2: List Conversations
    if (action === "list" && supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ conversations: data || [] });
    }

    // Action 3: Load Conversation
    if (action === "load" && supabase) {
      if (!conversationId) return res.status(400).json({ error: "conversationId required" });
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      if (error) throw error;
      return res.status(200).json({ conversation: data });
    }

    // Action Normal: Chat AI
    if (!openRouterApiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY n'est pas configurée dans Vercel." });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const systemInstruction = "Tu es ASSTRA AI, une intelligence artificielle dotée d'un génie extraordinaire créée par Youssef. Tu maîtrises la derja tunisienne, l'arabe, le français et l'anglais.";
    const formattedMessages = [{ role: "system", content: systemInstruction }];

    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      formattedMessages.push({ role: role, content: m.content || m.text || "" });
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
      formattedMessages.push({ role: "user", content: userText || "Analyse cette demande." });
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
        model: "openrouter/auto",
        messages: formattedMessages,
        temperature: 0.4
      })
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.error?.message || "Erreur OpenRouter");

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
