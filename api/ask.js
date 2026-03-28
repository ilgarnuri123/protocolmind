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

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert diplomatic protocol advisor. Answer formally, clearly, and briefly. If unsure, say the rule should be verified."
        },
        {
          role: "user",
          content: question
        }
      ]
    });

    return res.status(200).json({
      answer: completion.choices[0]?.message?.content || "No answer returned."
    });
  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({
      error: "Server error",
      details: String(error)
    });
  }
}
