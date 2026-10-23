import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Erreur: OPENROUTER_API_KEY n'est pas définie sur Vercel." });
    }

    const body = req.body || {};
    const { action, email, password, messages, title } = body;

    // --- 1. HANDLING AUTHENTICATION (SIGNUP / LOGIN) ---
    if (action === "auth") {
      if (!email || !password) {
        return res.status(400).json({ error: "Email et mot de passe requis." });
      }

      let { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (body.isSignUp) {
        if (user) {
          return res.status(400).json({ error: "Ce compte existe déjà. Veuillez vous connecter." });
        }
        const { error: insertErr } = await supabase.from('users').insert([{
          email,
          password,
          questions_count: 0
        }]);
        if (insertErr) return res.status(500).json({ error: "Erreur lors de la création du compte." });

        return res.status(200).json({ success: true, email, message: "Compte créé avec succès !" });
      } else {
        if (!user || user.password !== password) {
          return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }
        return res.status(200).json({ success: true, email, message: "Connecté avec succès !" });
      }
    }

    // --- 2. HANDLING AI CHAT & QUOTA ---
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Aucun message reçu." });
    }

    // Checking & Updating User Quota (If User is logged in)
    if (email) {
      let { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (user) {
        const now = new Date();
        const lastReset = new Date(user.last_reset_time || now);
        const hoursPassed = (now - lastReset) / (1000 * 60 * 60);

        // Reset Quota after 24 Hours
        if (hoursPassed >= 24) {
          await supabase
            .from('users')
            .update({ questions_count: 0, last_reset_time: now.toISOString() })
            .eq('email', email);
          user.questions_count = 0;
        }

        // Limit Check (30 Questions / 24h)
        if (user.questions_count >= 30) {
          return res.status(429).json({ 
            error: "⚠️ Limite atteinte (30 questions / 24h). Revenez plus tard !" 
          });
        }

        // Increment count
        await supabase
          .from('users')
          .update({ questions_count: (user.questions_count || 0) + 1 })
          .eq('email', email);
      }
    }

    const formattedMessages = [
      {
        role: "system",
        content: "Tu es ASSTRA AI, un assistant intelligent. Réponds dans la même langue que l'utilisateur."
      },
      ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }))
    ];

    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://asstra-ai.vercel.app",
        "X-Title": "ASSTRA AI"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: formattedMessages,
        temperature: 0.5
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return res.status(502).json({ 
        error: `OpenRouter Error (${apiResponse.status}): ${data.error?.message || JSON.stringify(data)}` 
      });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: "Erreur: Le modèle n'a renvoyé aucune réponse." });
    }

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: reply } }],
      title: title || "Discussion"
    });

  } catch (err) {
    return res.status(500).json({ error: `Server Exception: ${err.message}` });
  }
}
