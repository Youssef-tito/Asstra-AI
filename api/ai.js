```javascript
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
        error:
          "OPENROUTER_API_KEY n'est pas configurée dans Vercel."
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
        error:
          "Cette discussion est trop longue. Commencez une nouvelle discussion."
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
- Si tu n'es pas certain d'une information, précise-le.
- Ne prétends jamais avoir effectué une action que tu n'as pas effectuée.
- Respecte la vie privée de l'utilisateur.
- Ne révèle jamais les clés API, mots de passe ou secrets du serveur.
- Ne prétends pas disposer d'une fonctionnalité qui n'est pas disponible.
`;

    const recentMessages = messages.slice(-30);

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

      const role =
        message.role === "assistant" ? "assistant" : "user";

      const rawText =
        typeof message.content === "string"
          ? message.content
          : typeof message.text === "string"
            ? message.text
            : "";

      const text = rawText.slice(0, 12000);

      if (role === "user") {
        lastUserText = text;
      }

      const messageImage =
        message.image ||
        (i === recentMessages.length - 1 ? body.image : null);

      const validImage =
        typeof messageImage === "string" &&
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(
          messageImage
        );

      if (validImage) {
        if (messageImage.length > 8_000_000) {
          return res.status(413).json({
            error:
              "L'image est trop volumineuse. Choisissez une image plus légère."
          });
        }

        if (i === recentMessages.length - 1 && role === "user") {
          hasLastUserImage = true;
        }

        formattedMessages.push({
          role,
          content: [
            {
              type: "text",
              text:
                text ||
                (role === "user"
                  ? "Analyse cette image."
                  : "")
            },
            {
              type: "image_url",
              image_url: {
                url: messageImage
              }
            }
          ]
        });
      } else if (text.trim()) {
        formattedMessages.push({
          role,
          content: text
        });
      }
    }

    if (!lastUserText.trim() && !hasLastUserImage) {
      return res.status(400).json({
        error: "Écrivez un message ou ajoutez une image."
      });
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

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
            model: "openrouter/auto",
            messages: formattedMessages,
            temperature: 0.4,
            max_tokens: 1800
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    let data;

    try {
      data = await apiResponse.json();
    } catch {
      throw new Error("Réponse invalide du service IA.");
    }

    if (!apiResponse.ok) {
      console.error(
        "OpenRouter error:",
        apiResponse.status
      );

      if (apiResponse.status === 429) {
        return res.status(429).json({
          error:
            "Le service IA est très demandé. Réessayez dans quelques instants."
        });
      }

      if (
        apiResponse.status === 401 ||
        apiResponse.status === 403
      ) {
        return res.status(502).json({
          error:
            "Le service IA a refusé la requête. Vérifiez la clé API et les crédits du compte OpenRouter."
        });
      }

      return res.status(502).json({
        error:
          "Impossible de contacter le service IA. Réessayez plus tard."
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    const aiReply =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map(part => part?.text || "")
              .join("\n")
              .trim()
          : "";

    if (!aiReply) {
      return res.status(502).json({
        error: "Le modèle IA n'a pas fourni de réponse."
      });
    }

    return res.status(200).json({
      choices: [
        {
          message: {
            role: "assistant",
            content: aiReply
          }
        }
      ],
      title
    });
  } catch (error) {
    console.error(
      "ASSTRA AI backend error:",
      error?.name || "Error"
    );

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error:
          "Le service IA prend trop de temps. Réessayez."
      });
    }

    return res.status(500).json({
      error:
        "Une erreur interne est survenue. Réessayez plus tard."
    });
  }
}
```
