export default async function handler(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const configuredOrigin = process.env.ALLOWED_ORIGIN;

  const sameOrigin =
    origin && host && origin === `${proto}://${host}`;

  const allowedOrigin =
    !origin || sameOrigin ||
    (configuredOrigin && origin === configuredOrigin);

  if (origin && allowedOrigin) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      sameOrigin ? origin : configuredOrigin
    );
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(allowedOrigin ? 204 : 403).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  if (!allowedOrigin) {
    return res.status(403).json({
      error: "Origine non autorisée."
    });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY n'est pas configurée dans Vercel."
      });
    }

    const body = req.body || {};
    const messages = body.messages;
    const title =
      typeof body.title === "string"
        ? body.title.slice(0, 100)
        : "Discussion";

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Écrivez un message pour commencer."
      });
    }

    if (messages.length > 100) {
      return res.status(400).json({
        error: "Cette discussion est trop longue. Commencez une nouvelle discussion."
      });
    }

    const systemInstruction = `
Tu es ASSTRA AI, une intelligence artificielle créée par Youssef.

LANGUE :
Réponds dans la même langue et le même dialecte que le dernier message
de l'utilisateur. Si l'utilisateur parle en derja tunisienne, réponds
en derja tunisienne. S'il parle en français, réponds en français.
S'il parle en arabe, réponds en arabe.

PERSONNALITÉ :
- Sois intelligent, précis, naturel et utile.
- Explique les sujets complexes simplement.
- Adapte la longueur de ta réponse à la question.
- Utilise des listes et des titres lorsque cela améliore la lisibilité.
- Pour le code, fournis des exemples complets lorsque c'est nécessaire.
- Ne prétends jamais avoir effectué une action que tu n'as pas effectuée.
- Respecte la vie privée de l'utilisateur.
- Ne révèle jamais les clés API, mots de passe ou secrets du serveur.
`;

    const recentMessages = messages.slice(-20);
    const formattedMessages = [
      {
        role: "system",
        content: systemInstruction
      }
    ];

    let lastUserText = "";
    let hasLastUserImage = false;

    for (let i = 0; i < recentMessages.length; i++) {
      const message = recentMessages[i] || {};
      const role = message.role === "assistant" ? "assistant" : "user";
      const rawText = typeof message.content === "string" ? message.content : "";
      const text = rawText.slice(0, 10000);

      if (role === "user") {
        lastUserText = text;
      }

      const messageImage =
        message.image || (i === recentMessages.length - 1 ? body.image : null);

      const validImage =
        typeof messageImage === "string" &&
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(messageImage);

      if (validImage) {
        if (i === recentMessages.length - 1 && role === "user") {
          hasLastUserImage = true;
        }
        formattedMessages.push({
          role,
          content: [
            { type: "text", text: text || "Analyse cette image." },
            { type: "image_url", image_url: { url: messageImage } }
          ]
        });
      } else if (text.trim()) {
        formattedMessages.push({ role, content: text });
      }
    }

    if (!lastUserText.trim() && !hasLastUserImage) {
      return res.status(400).json({
        error: "Écrivez un message ou ajoutez une image."
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let apiResponse;
    try {
      apiResponse = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://asstra-ai.vercel.app",
            "X-Title": "ASSTRA AI",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: formattedMessages,
            temperature: 0.4,
            max_tokens: 1500
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await apiResponse.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("OpenRouter Non-JSON Response:", responseText);
      return res.status(502).json({
        error: "Réponse invalide du service IA (non-JSON)."
      });
    }

    if (!apiResponse.ok) {
      console.error("OpenRouter error status:", apiResponse.status, data);
      return res.status(502).json({
        error: data?.error?.message || "Erreur de communication avec le service IA."
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: "Le modèle IA n'a pas renvoyé de contenu."
      });
    }

    return res.status(200).json({
      choices: [
        {
          message: {
            role: "assistant",
            content: content
          }
        }
      ],
      title
    });

  } catch (error) {
    console.error("ASSTRA AI backend catch error:", error);
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Le service IA met trop de temps à répondre."
      });
    }
    return res.status(500).json({
      error: "Erreur serveur interne."
    });
  }
}
