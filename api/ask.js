import OpenAI from "openai";
import fs from "fs";
import path from "path";

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 15;

  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (now - entry.windowStart > windowMs) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

function loadKnowledgeFiles() {
  try {
    const knowledgeDir = path.join(process.cwd(), "knowledge");
    const files = fs.readdirSync(knowledgeDir);

    let content = "";

    for (const file of files) {
      if (file.endsWith(".txt")) {
        const filePath = path.join(knowledgeDir, file);
        const text = fs.readFileSync(filePath, "utf8");

        content += "\n\n" + text;
      }
    }

    return content;
  } catch (err) {
    console.log("Knowledge load error:", err.message);
    return "";
  }
}

function extractRelevantKnowledge(question, knowledgeText) {
  const q = question.toLowerCase();
  const paragraphs = knowledgeText.split("\n");

  const matches = [];

  for (const p of paragraphs) {
    const line = p.toLowerCase();

    if (line.includes("protocol") && q.includes("protocol")) matches.push(p);
    if (line.includes("seat") && q.includes("seat")) matches.push(p);
    if (line.includes("visit") && q.includes("visit")) matches.push(p);
    if (line.includes("flag") && q.includes("flag")) matches.push(p);
    if (line.includes("title") && q.includes("title")) matches.push(p);
  }

  return matches.slice(0, 10).join("\n");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const forwarded = req.headers["x-forwarded-for"];
    const ip = (forwarded || req.socket.remoteAddress || "unknown")
      .split(",")[0]
      .trim();

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Too many requests" });
    }

    const question = req.body?.question;
    const mode = req.body?.mode || "advice";
    const language = req.body?.language || "English";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!question) {
      return res.status(400).json({ error: "Question required" });
    }

    let languageInstruction = "Respond in English.";

    if (language === "Azərbaycan dili") {
      languageInstruction =
        "Respond in Azerbaijani language using professional diplomatic tone.";
    }

    if (language === "Русский") {
      languageInstruction =
        "Respond in Russian using professional diplomatic tone.";
    }

    if (language === "Türkçe") {
      languageInstruction =
        "Respond in Turkish using professional diplomatic tone.";
    }

    let modeInstruction = "";

    if (mode === "seating") {
      modeInstruction = `
Provide seating guidance.
Include seating logic and delegation placement.
`;
    }

    if (mode === "checklist") {
      modeInstruction = `
Provide a practical diplomatic protocol checklist.
Use bullet points.
`;
    }

    const knowledgeText = loadKnowledgeFiles();
    const relevantKnowledge = extractRelevantKnowledge(question, knowledgeText);

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content: `
You are ProtocolMind — an AI diplomatic protocol advisor.

Your expertise includes:

diplomatic protocol
state visits
precedence
seating arrangements
flag protocol
diplomatic titles
official ceremonies
parliamentary protocol

Use the following protocol documents as knowledge:

${relevantKnowledge}

Always provide professional, practical diplomatic guidance.

${modeInstruction}

${languageInstruction}
`,
        },

        ...history,

        {
          role: "user",
          content: question,
        },
      ],
    });

    const answer =
      completion.choices?.[0]?.message?.content || "No answer returned.";

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("API ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
}
