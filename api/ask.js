import OpenAI from "openai";

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;

  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, {
      count: 1,
      windowStart: now,
    });
    return true;
  }

  if (now - entry.windowStart > windowMs) {
    rateLimitMap.set(ip, {
      count: 1,
      windowStart: now,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  rateLimitMap.set(ip, entry);
  return true;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim();

    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: "Too many requests. Please wait a minute and try again.",
      });
    }

    const question = req.body?.question;
    const mode = req.body?.mode || "advice";

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    if (question.length > 2000) {
      return res.status(400).json({
        error: "Question is too long. Please keep it under 2000 characters.",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    let modeInstruction = "";

    if (mode === "seating") {
      modeInstruction = `
Answer as a diplomatic seating and room-layout advisor.

Provide:
1. Recommended seating logic
2. Practical placement structure
3. Key protocol risks to avoid

Prefer a structured layout.
`;
    } else if (mode === "checklist") {
      modeInstruction = `
Answer as a diplomatic protocol operations advisor.

Provide the answer as a practical checklist.
Use short action points.
Focus on sequence, protocol control, and execution details.
`;
    } else {
      modeInstruction = `
Answer as an elite diplomatic protocol advisor.

Provide:
1. A formal answer
2. Practical protocol guidance
3. A warning if protocol may vary by country
`;
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
- diplomatic protocol
- precedence rules
- seating arrangements
- bilateral and multilateral meetings
- state visits
- order of flags
- diplomatic titles
- protocol for parliaments
- international delegations

Always answer:
1. Formally
2. Clearly
3. Concisely
4. With practical recommendations

If relevant, structure answers with bullet points.

Never invent rules. If unsure, say that protocol may vary by country.

${modeInstruction}
`,
        },
        {
          role: "user",
          content: question,
        },
      ],
    });

    const answer =
      completion?.choices?.[0]?.message?.content || "No answer returned.";

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("API ERROR FULL:", error);

    return res.status(500).json({
      error: "Server error",
      details: error?.message || String(error),
    });
  }
}
