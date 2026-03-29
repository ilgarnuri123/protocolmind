import OpenAI from "openai";
import fs from "fs";
import path from "path";

const rateLimitMap = new Map();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    if (c.includes(word)) score += 2;
  }

  if (q.includes("seat") && c.includes("seat")) score += 5;
  if (q.includes("seating") && c.includes("seating")) score += 5;
  if (q.includes("flag") && c.includes("flag")) score += 5;
  if (q.includes("visit") && c.includes("visit")) score += 5;
  if (q.includes("title") && c.includes("title")) score += 5;
  if (q.includes("precedence") && c.includes("precedence")) score += 5;
  if (q.includes("delegation") && c.includes("delegation")) score += 4;
  if (q.includes("parliament") && c.includes("parliament")) score += 4;
  if (q.includes("speaker") && c.includes("speaker")) score += 4;
  if (q.includes("protocol") && c.includes("protocol")) score += 2;
  if (q.includes("letter") && c.includes("letter")) score += 3;
  if (q.includes("program") && c.includes("program")) score += 3;
  if (q.includes("official") && c.includes("official")) score += 2;
  if (q.includes("briefing") && c.includes("briefing")) score += 3;
  if (q.includes("scenario") && c.includes("scenario")) score += 3;
  if (q.includes("pack") && c.includes("protocol")) score += 2;
  if (q.includes("interpreter") && c.includes("interpreter")) score += 4;
  if (q.includes("host") && c.includes("host")) score += 2;
  if (q.includes("guest") && c.includes("guest")) score += 2;
  if (q.includes("bilateral") && c.includes("bilateral")) score += 4;
  if (q.includes("multilateral") && c.includes("multilateral")) score += 4;
  if (q.includes("rectangular") && c.includes("rectangular")) score += 3;
  if (q.includes("round") && c.includes("round")) score += 3;

  return score;
}

function getRelevantKnowledge(question, knowledgeText) {
  const chunks = splitIntoChunks(knowledgeText);

  const ranked = chunks
    .map(chunk => ({ chunk, score: scoreChunk(question, chunk) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(item => item.chunk);

  return ranked.join("\n\n---\n\n");
}

function isCapabilitiesQuestion(question) {
  const q = question.toLowerCase().trim();

  const patterns = [
    "what can you do",
    "what do you do",
    "what are your functions",
    "what are your capabilities",
    "how can you help",
    "что ты умеешь",
    "что ты можешь",
    "что ты делаешь",
    "чем ты можешь помочь",
    "nə bacarırsan",
    "nə edə bilirsən",
    "nə edirsən",
    "sən nə bacarırsan",
    "ne yapabilirsin",
    "neler yapabilirsin",
    "ne yapıyorsun",
    "nasıl yardımcı olabilirsin"
  ];

  return patterns.some(pattern => q.includes(pattern));
}

function getCapabilitiesAnswer(language) {
  if (language === "Azərbaycan dili") {
    return `PROTOCOLMIND CAPABILITIES

1. Diplomatik protokol üzrə məsləhət
2. Seating Plan və seating guidance
3. Protokol checklist hazırlanması
4. Rəsmi səfər proqramı
5. Rəsmi məktub layihələri
6. Sənəd şablonları
7. Protocol Pack
8. 4 dildə cavab
9. Knowledge bazası ilə cavab
10. Copy / TXT / DOC export
11. Chat memory

Xüsusilə faydalıdır:
- parlament protokolu
- rəsmi səfərlər
- nümayəndə heyətlərinin qəbulu
- rəsmi yazışmalar
- diplomatik tədbirlər`;
  }

  if (language === "Русский") {
    return `ВОЗМОЖНОСТИ PROTOCOLMIND

1. Консультации по дипломатическому протоколу
2. Seating Plan и рекомендации по рассадке
3. Подготовка checklist
4. Программа официального визита
5. Проекты официальных писем
6. Шаблоны документов
7. Protocol Pack
8. Ответы на 4 языках
9. Ответы на основе базы знаний
10. Export: Copy / TXT / DOC
11. Память диалога

Особенно полезен для:
- парламентского протокола
- официальных визитов
- приёма делегаций
- официальной переписки
- дипломатических мероприятий`;
  }

  if (language === "Türkçe") {
    return `PROTOCOLMIND YETENEKLERİ

1. Diplomatik protokol danışmanlığı
2. Seating Plan ve oturma düzeni rehberliği
3. Checklist hazırlama
4. Resmî ziyaret programı
5. Resmî mektup taslakları
6. Belge şablonları
7. Protocol Pack
8. 4 dilde yanıt
9. Bilgi tabanına dayalı yanıtlar
10. Copy / TXT / DOC export
11. Sohbet hafızası

Özellikle şunlar için uygundur:
- parlamento protokolü
- resmî ziyaretler
- heyet kabulü
- resmî yazışmalar
- diplomatik etkinlikler`;
  }

  return `PROTOCOLMIND CAPABILITIES

1. Diplomatic protocol advice
2. Seating Plan and seating guidance
3. Protocol checklist generation
4. Official visit programs
5. Official letter drafting
6. Document templates
7. Protocol Pack
8. Multilingual support
9. Knowledge-based answers
10. Copy / TXT / DOC export
11. Chat memory

Especially useful for:
- parliamentary protocol
- official visits
- receiving delegations
- official correspondence
- diplomatic and institutional events`;
}

async function getUserProfileByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Supabase profile lookup error: " + errText);
  }

  const rows = await response.json();
  return rows && rows.length ? rows[0] : null;
}

async function getUsageRow(userId, date) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/usage?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(date)}&select=*`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Supabase usage lookup error: " + errText);
  }

  const rows = await response.json();
  return rows && rows.length ? rows[0] : null;
}

async function incrementUsage(userId, date) {
  const existing = await getUsageRow(userId, date);

  if (!existing) {
    const createResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/usage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: userId,
          date,
          count: 1,
        }),
      }
    );

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      throw new Error("Supabase usage create error: " + errText);
    }

    const created = await createResponse.json();
    return created?.[0]?.count || 1;
  }

  const updateResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/usage?id=eq.${existing.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        count: Number(existing.count || 0) + 1,
      }),
    }
  );

  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error("Supabase usage update error: " + errText);
  }

  const updated = await updateResponse.json();
  return updated?.[0]?.count || Number(existing.count || 0) + 1;
}

async function getUsageCount(userId, date) {
  const row = await getUsageRow(userId, date);
  return row ? Number(row.count || 0) : 0;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    const template = req.body?.template || "none";
    const language = req.body?.language || "English";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const userEmail = String(req.body?.userEmail || "").trim().toLowerCase();

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question required" });
    }

    let profile = null;
    let isPro = false;

    if (userEmail) {
      profile = await getUserProfileByEmail(userEmail);
      isPro = profile?.plan === "pro" && profile?.status === "active";
    }

    if (!isPro) {
      if (!profile && userEmail) {
        return res.status(403).json({
          error: "User profile not found. Please sign in again."
        });
      }

      const userId = profile?.id || "guest";
      const today = getTodayDateString();
      const usedCount = await getUsageCount(userId, today);

      if (usedCount >= 5) {
        return res.status(403).json({
          error: "Daily free limit reached (5 requests). Upgrade to ProtocolMind Pro for unlimited access."
        });
      }

      await incrementUsage(userId, today);
    }

    if (isCapabilitiesQuestion(question)) {
      return res.status(200).json({
        answer: getCapabilitiesAnswer(language),
        plan: isPro ? "pro" : "free"
      });
    }

    let languageInstruction = "Respond in English.";

    if (language === "Azərbaycan dili") {
      languageInstruction =
        "Respond in Azerbaijani using a professional, official, and natural diplomatic tone.";
    } else if (language === "Русский") {
      languageInstruction =
        "Respond in Russian using a professional, official, and natural diplomatic tone.";
    } else if (language === "Türkçe") {
      languageInstruction =
        "Respond in Turkish using a professional, official, and natural diplomatic tone.";
    }

    let modeInstruction = "";

    if (mode === "seating") {
      modeInstruction = `
Create a strong diplomatic seating solution.

Required structure:

SEATING PLAN

1. SEATING LOGIC
- explain the protocol logic briefly

2. PRINCIPAL PLACEMENT
- identify host principal and guest principal positions

3. RECOMMENDED LAYOUT
- describe the recommended arrangement clearly

4. SUPPORTING DELEGATION PLACEMENT
- explain where advisers and interpreters should sit

5. PROTOCOL NOTES
- identify risks, uncertainties, or country-variation issues

If exact ranks are missing, create a professional recommended model.
Prefer parity, symmetry, and equivalent-rank facing equivalent-rank.
Keep the answer operational and protocol-focused.
`;
    } else if (mode === "checklist") {
      modeInstruction = `
Provide the answer as a practical checklist.
Use short bullet points.
Keep it concise and operational.
`;
    } else if (mode === "visit_program") {
      modeInstruction = `
Create a polished official visit program.

Format requirements:
- Use a clean professional title
- Structure the answer like a real official program
- Use clearly separated sections
- Use time blocks if possible
- If exact times are missing, create a realistic diplomatic sample schedule
- Include protocol notes where relevant
- Do not add casual commentary before or after the program
`;
    } else if (mode === "official_letter") {
      modeInstruction = `
Draft a polished official letter or diplomatic-style formal note.

Format requirements:
- Use formal institutional tone
- Use a clean subject line if relevant
- Write as a ready-to-use document
- Do not add casual commentary
- Keep it polished, courteous, and official
`;
    } else if (mode === "protocol_pack") {
      modeInstruction = `
Create a full Protocol Pack.

Required structure:

PROTOCOL PACK

1. BRIEFING NOTE
- Purpose
- Participants
- Core protocol considerations
- Risks / sensitivities

2. VISIT PROGRAM
- Title
- Schedule with time blocks
- Key ceremonial points

3. SEATING GUIDANCE
- Seating logic
- Placement principles

4. PROTOCOL CHECKLIST
- Short bullet list of actions

The output must look like a structured professional working pack.
Do not add casual commentary.
`;
    } else {
      modeInstruction = `
Provide clear protocol advice with practical recommendations.
Prefer professional structure over casual chat style.
`;
    }

    let templateInstruction = "";

    if (template === "invitation_letter") {
      templateInstruction = `
Output as a formal invitation letter.

Required structure:
Subject:
Dear ...
Opening courtesy line
Invitation purpose
Core details of event/visit/meeting
Polite closing
Signature block placeholder

The result must look ready for official use.
`;
    } else if (template === "thank_you_letter") {
      templateInstruction = `
Output as a formal thank you letter.

Required structure:
Subject:
Dear ...
Expression of appreciation
Reference to the meeting/visit/event
Polite concluding line
Signature block placeholder

The result must look ready for official use.
`;
    } else if (template === "note_verbale") {
      templateInstruction = `
Output as a diplomatic-style note verbale.

Required style:
- third-person institutional tone
- no personal casual expressions
- formal diplomatic wording
- concise, polished, official

The result must look like a clean diplomatic draft.
`;
    } else if (template === "briefing_note") {
      templateInstruction = `
Output as a professional briefing note.

Required structure:
BRIEFING NOTE
Purpose
Participants
Protocol considerations
Key risks / sensitivities
Recommended actions

The result must be concise and operational.
`;
    } else if (template === "meeting_scenario") {
      templateInstruction = `
Output as a meeting scenario.

Required structure:
MEETING SCENARIO
Arrival
Greeting sequence
Seating
Discussion flow
Media moment if relevant
Departure

The result must be practical and operational.
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
- briefing formats
- meeting scenarios
- protocol working packs

Use the knowledge snippets below when relevant.
If the snippets are insufficient, answer carefully and note when protocol may vary by country or institution.
Do not invent formal rules.
Do not use casual tone.
Prefer polished professional formatting.

Knowledge snippets:
${relevantKnowledge || "No relevant knowledge snippets found."}

${modeInstruction}

${templateInstruction}

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

    return res.status(200).json({
      answer,
      plan: isPro ? "pro" : "free"
    });
  } catch (error) {
    console.error("API ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
}
