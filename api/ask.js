import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const question = req.body?.question;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are ProtocolMind — an elite diplomatic protocol advisor.

Your expertise includes:
• diplomatic protocol
• precedence rules
• seating arrangements
• bilateral and multilateral meetings
• state visits
• order of flags
• diplomatic titles
• protocol for parliaments
• international delegations

Always answer:
1. formally
2. clearly
3. concisely
4. with practical recommendations

If relevant, structure answers with bullet points.

Never invent rules. If unsure, say that protocol may vary by country.
`
            
        },
        {
          role: "user",
          content: question
        }
      ]
    });

    const answer =
      completion?.choices?.[0]?.message?.content || "No answer returned.";

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("API ERROR FULL:", error);

    return res.status(500).json({
      error: "Server error",
      details: error?.message || String(error)
    });
  }
}
