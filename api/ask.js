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

  entry.count += 1;
  return true;
}

function loadKnowledgeFiles() {
  try {
    const knowledgeDir = path.join(process.cwd(), "knowledge");

    if (!fs.existsSync(knowledgeDir)) {
      return "";
    }

    const files = fs.readdirSync(knowledgeDir);
    let content = "";

    for (const file of files) {
      if (file.endsWith(".txt")) {
        const filePath = path.join(knowledgeDir, file);
        const text = fs.readFileSync(filePath, "utf8");
        content += `\n\nFILE: ${file}\n${text}`;
      }
    }

    return content;
  } catch (err) {
    console.log("Knowledge load error:", err.message);
    return "";
  }
}

function splitIntoChunks(text, chunkSize = 700) {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\s*\n/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > chunkSize) {
      if (current.trim()) chunks.push(current.trim());
      current = paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function scoreChunk(question, chunk) {
  const q = question.toLowerCase();
  const c = chunk.toLowerCase();

  const qWords = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length > 2);

  let score = 0;

  for (const word of qWords) {
    if (c.includes(word)) {
      score += 2;
    }
  }

  if (q.includes("seat") && c.includes("seat")) score += 5;
  if (q.includes("seating") && c.includes("seating")) score += 5;
  if (q.includes("flag") && c.includes("flag")) score += 5;
  if (q.includes("visit") && c.includes("visit")) score += 5;
  if (q.includes("title") && c.includes("title")) score += 5;
  if (q.includes("precedence") && c.includes("precedence")) score += 5;
  if (q.includes("delegation") && c.includes("delegation")) score += 3;
  if (q.includes("parliament") && c.includes("parliament")) score += 4;
  if (q.includes("speaker") && c.includes("speaker")) score += 4;
  if (q.includes("protocol") && c.includes("protocol")) score += 2;
  if (q.includes("letter") && c.includes("letter")) score += 3;
  if (q.includes("program") && c.includes("program")) score += 3;

  return score;
}

function getRelevantKnowledge(question, knowledgeText) {
  const chunks = splitIntoChunks(knowledgeText);

  const ranked = chunks
    .map(chunk => ({
      chunk,
      score: scoreChunk(question, chunk)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => item.chunk);

  return ranked.join("\n\n---\n\n");
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

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question required" });
    }

    let languageInstruction = "Respond in English.";

    if (language === "Azərbaycan dili") {
      languageInstruction =
        "Respond in Azerbaijani using a professional and natural diplomatic tone.";
    } else if (language === "Русский") {
      languageInstruction =
        "Respond in Russian using a professional and natural diplomatic tone.";
    } else if (language === "Türkçe") {
      languageInstruction =
        "Respond in Turkish using a professional and natural diplomatic tone.";
    }

    let modeInstruction = "";

    if (mode === "seating") {
      modeInstruction = `
Provide:
1. Seating logic
2. Practical placement guidance
3. A simple seating structure if relevant
`;
    } else if (mode === "checklist") {
      modeInstruction = `
Provide the answer as a practical checklist.
Use short bullet points.
`;
    } else if (mode === "visit_program") {
      modeInstruction = `
Provide a professional official visit program.

Structure it clearly with:
1. Title
2. Date / format if inferable
3. Sequence of events by time blocks
4. Protocol notes
5. Media / gift / escort considerations if relevant

If exact times are not given, use a realistic sample official schedule.
`;
    } else if (mode === "official_letter") {
      modeInstruction = `
Draft a formal official letter or diplomatic-style note.

Structure it with:
1. Formal opening
2. Main purpose
3. Polite and official wording
4. Formal closing

If details are missing, produce a clean professional draft with placeholders implied naturally.
`;
    } else {
      modeInstruction = `
Provide clear protocol advice with practical recommendations.
`;
    }

    const knowledgeText = loadKnowledgeFiles();
    const relevantKnowledge = getRelevantKnowledge(question, knowledgeText);

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
- diplomatic protocol
- precedence
- seating arrangements
- official visits
- flag protocol
- diplomatic titles
- parliamentary protocol
- official ceremonies
- protocol drafting
- official correspondence

Use the knowledge snippets below when relevant.
If the snippets are insufficient, answer carefully and say when protocol may vary by country or institution.
Do not invent formal rules.

Knowledge snippets:
${relevantKnowledge || "No relevant knowledge snippets found."}

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
