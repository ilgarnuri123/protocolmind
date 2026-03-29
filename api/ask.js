export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      language = "English",
      mode = "advice",
      template = "none",
      history = []
    } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    const systemPrompt = `
You are ProtocolMind, an AI assistant for diplomatic protocol, parliamentary protocol,
official visits, seating plans, protocol checklists, official letters, and protocol packs.

Current language: ${language}
Current mode: ${mode}
Current template: ${template}

Rules:
- Reply in the selected language.
- Be practical, structured, and professional.
- If the request is about seating, explain the logic clearly.
- If the request is about official letters or visit programs, produce clean document-style output.
- If the user asks something general, answer directly and clearly.
`.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      ...Array.isArray(history)
        ? history
            .filter(item => item && item.role && item.content)
            .slice(-10)
            .map(item => ({
              role: item.role,
              content: String(item.content)
            }))
        : [],
      { role: "user", content: String(question) }
    ];

    // Сначала пробуем Chat Completions — это самый совместимый вариант
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.7
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data?.error?.message || "OpenAI request failed",
        details: data
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      data?.output_text ||
      data?.response ||
      data?.result ||
      "";

    if (!answer) {
      return res.status(500).json({
        error: "Model returned no text",
        details: data
      });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("ASK API ERROR:", error);
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
