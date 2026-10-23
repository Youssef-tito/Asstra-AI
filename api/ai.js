export default async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN;
  const origin = req.headers.origin;

  res.setHeader("Vary", "Origin");

  if (allowedOrigin) {
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
  } else if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "La clé OPENROUTER_API_KEY n'est pas configurée sur Vercel."
      });
    }

    const body = req.body || {};
    const messages = body.messages;
    const image = body.image;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Veuillez envoyer un message."
      });
    }

    if (messages.length > 100) {
      return res.status(400).json({
        error: "Conversation trop longue. Commencez une nouvelle discussion."
      });
    }

    const safeMessages = messages.slice(-30);
    const formattedMessages = [];

    const systemInstruction = `
Tu es ASSTRA AI, un assistant intelligent créé par Youssef.

RÈGLES IMPORTANTES :
1. Réponds toujours dans la même langue et le même dialecte que le dernier message de l'utilisateur.
2. Si l'utilisateur parle en derja tunisienne, réponds en derja tunisienne.
3. Si l'utilisateur parle en français, réponds en français.
4. Si l'utilisateur parle en arabe, réponds en arabe.
5. Sois utile, précis, naturel et honnête.
6. N'invente jamais des informations si tu n'es pas sûr.
7. Utilise une présentation claire et des listes quand c'est utile.
8. Ne révèle jamais les clés API ni les secrets de configuration.
`;

    formattedMessages.push({
      role: "system",
      content: systemInstruction
    });

    for (const message of safeMessages) {
      if (!message || !["user", "assistant"].includes(message.role)) {
        continue;
      }

      const content =
        typeof message.content === "string"
          ? message.content.slice(0, 50000)
          : "";

      if (!content.trim() && !image) continue;

      formattedMessages.push({
        role: message.role,
        content: content || "Analyse cette image."
      });
    }

    if (image && typeof image === "string") {
      const lastUserIndex = formattedMessages.map(m => m.role).lastIndexOf("user");

      if (lastUserIndex === -1) {
        formattedMessages.push({
          role: "user",
          content: [
            { type: "text", text: "Analyse cette image." },
            { type: "image_url", image_url: { url: image } }
          ]
        });
      } else {
        const lastUserText = formattedMessages[lastUserIndex].content;
        formattedMessages[lastUserIndex] = {
          role: "user",
          content: [
            {
              type: "text",
              text: typeof lastUserText === "string" ? lastUserText : "Analyse cette image."
            },
            {
              type: "image_url",
              image_url: { url: image }
            }
          ]
        };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let apiResponse;

    try {
      apiResponse = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "ASSTRA AI",
            "HTTP-Referer": "https://asstra-ai.vercel.app"
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: formattedMessages,
            temperature: 0.5,
            max_tokens: 1800
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await apiTypeResponseText(apiResponse);
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: { message: "Réponse non-JSON reçue d'OpenRouter." } };
    }

    if (!apiResponse.ok) {
      console.error("OpenRouter error:", apiResponse.status, data.error?.message || responseText);
      return res.status(502).json({
        error: data.error?.message || "Le service IA n'a pas pu répondre. Réessayez plus tard."
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error: "Aucune réponse reçue du modèle IA."
      });
    }

    return res.status(200).json({
      choices: [
        {
          message: {
            role: "assistant",
            content: reply
          }
        }
      ],
      title: typeof body.title === "string"
        ? body.title.slice(0, 100)
        : "Discussion"
    });

  } catch (error) {
    console.error("ASSTRA API error:", error.name, error.message);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Le délai de réponse est dépassé. Réessayez."
      });
    }

    return res.status(500).json({
      error: "Une erreur interne est survenue. Réessayez plus tard."
    });
  }
}

async function apiTypeResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
