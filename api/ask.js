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
    if (c.includes(word)) score += 2;
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
  if (q.includes("official") && c.includes("official")) score += 2;
  if (q.includes("briefing") && c.includes("briefing")) score += 3;
  if (q.includes("scenario") && c.includes("scenario")) score += 3;
  if (q.includes("pack") && c.includes("protocol")) score += 2;

  return score;
}

function getRelevantKnowledge(question, knowledgeText) {
  const chunks = splitIntoChunks(knowledgeText);

  const ranked = chunks
    .map(chunk => ({ chunk, score: scoreChunk(question, chunk) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
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
- rəsmi görüşlər
- ikitərəfli və çoxtərəfli formatlar
- prioritet və yerləşmə qaydaları
- bayraq protokolu
- müraciət formaları və titullar

2. Seating Plan
- nümayəndə heyətlərinin yerləşdirilməsi
- masa arxasında simmetriya və paritet
- seating guidance
- sadə seating diagram

3. Checklist hazırlığı
- rəsmi səfər üçün checklist
- görüşə hazırlıq
- protokol addımlarının siyahısı

4. Visit Program
- rəsmi səfər proqramı
- saatlarla strukturlaşdırılmış proqram
- protokol qeydləri ilə birlikdə

5. Official Letter
- rəsmi dəvət məktubu
- təşəkkür məktubu
- diplomatik üslubda məktub layihəsi

6. Sənəd şablonları
- Invitation Letter
- Thank You Letter
- Note Verbale
- Briefing Note
- Meeting Scenario

7. Protocol Pack
- bir sorğu ilə tam paket:
  • briefing note
  • visit program
  • seating guidance
  • protocol checklist

8. Çoxdilli cavab
- English
- Azərbaycan dili
- Русский
- Türkçe

9. Bilik bazası ilə cavab
- knowledge qovluğundakı mətn faylları üzrə cavab verir
- protokol sənədlərindən istifadə edir

10. Export funksiyaları
- Copy
- TXT
- DOC

11. Chat memory
- söhbət daxilində əvvəlki sualları nəzərə ala bilir

ProtocolMind xüsusilə aşağıdakılar üçün faydalıdır:
- parlament protokolu
- dövlət və rəsmi səfərlər
- nümayəndə heyətlərinin qəbulu
- rəsmi yazışmalar
- diplomatik və institusional tədbirlər`;
  }

  if (language === "Русский") {
    return `ВОЗМОЖНОСТИ PROTOCOLMIND

1. Консультации по дипломатическому протоколу
- официальные встречи
- двусторонние и многосторонние форматы
- порядок старшинства и рассадка
- флаговый протокол
- формы обращения и титулы

2. Seating Plan
- рассадка делегаций
- симметрия и паритет за столом
- рекомендации по размещению
- простая схема рассадки

3. Подготовка checklist
- checklist для официального визита
- подготовка к встрече
- список протокольных шагов

4. Visit Program
- программа официального визита
- структурированный график по времени
- с протокольными примечаниями

5. Official Letter
- официальное письмо-приглашение
- письмо-благодарность
- проект письма в дипломатическом стиле

6. Шаблоны документов
- Invitation Letter
- Thank You Letter
- Note Verbale
- Briefing Note
- Meeting Scenario

7. Protocol Pack
- полный пакет по одному запросу:
  • briefing note
  • visit program
  • seating guidance
  • protocol checklist

8. Многоязычная работа
- English
- Azərbaycan dili
- Русский
- Türkçe

9. Ответы на основе базы знаний
- использует текстовые файлы из папки knowledge
- применяет протокольные материалы и документы

10. Экспорт
- Copy
- TXT
- DOC

11. Память диалога
- учитывает предыдущие сообщения в рамках беседы

ProtocolMind особенно полезен для:
- парламентского протокола
- государственных и официальных визитов
- приёма делегаций
- официальной переписки
- дипломатических и институциональных мероприятий`;
  }

  if (language === "Türkçe") {
    return `PROTOCOLMIND YETENEKLERİ

1. Diplomatik protokol danışmanlığı
- resmî görüşmeler
- ikili ve çok taraflı formatlar
- protokol sıralaması ve oturma düzeni
- bayrak protokolü
- hitap şekilleri ve unvanlar

2. Seating Plan
- heyetlerin oturma düzeni
- masa başında simetri ve denge
- yerleşim önerileri
- basit seating diagram

3. Checklist hazırlama
- resmî ziyaret checklist
- toplantı hazırlığı
- protokol adımlarının listesi

4. Visit Program
- resmî ziyaret programı
- saat bazlı yapılandırılmış program
- protokol notlarıyla birlikte

5. Official Letter
- resmî davet mektubu
- teşekkür mektubu
- diplomatik üslupta resmî taslak

6. Belge şablonları
- Invitation Letter
- Thank You Letter
- Note Verbale
- Briefing Note
- Meeting Scenario

7. Protocol Pack
- tek soruda tam paket:
  • briefing note
  • visit program
  • seating guidance
  • protocol checklist

8. Çok dilli yanıt
- English
- Azərbaycan dili
- Русский
- Türkçe

9. Bilgi tabanına dayalı yanıt
- knowledge klasöründeki metin dosyalarını kullanır
- protokol belgelerine dayanır

10. Dışa aktarma
- Copy
- TXT
- DOC

11. Sohbet hafızası
- aynı konuşmadaki önceki mesajları dikkate alır

ProtocolMind özellikle şunlar için uygundur:
- parlamento protokolü
- devlet ve resmî ziyaretler
- heyet kabulü
- resmî yazışmalar
- diplomatik ve kurumsal etkinlikler`;
  }

  return `PROTOCOLMIND CAPABILITIES

1. Diplomatic protocol advice
- official meetings
- bilateral and multilateral formats
- order of precedence
- flag protocol
- forms of address and titles

2. Seating Plan
- delegation seating guidance
- symmetry and parity
- table placement logic
- simple seating diagrams

3. Checklist generation
- official visit checklist
- meeting preparation checklist
- protocol action lists

4. Visit Program
- structured official visit programs
- time-based schedules
- protocol notes and sequencing

5. Official Letter
- formal invitation letters
- thank you letters
- diplomatic-style official drafts

6. Document templates
- Invitation Letter
- Thank You Letter
- Note Verbale
- Briefing Note
- Meeting Scenario

7. Protocol Pack
- full package in one request:
  • briefing note
  • visit program
  • seating guidance
  • protocol checklist

8. Multilingual support
- English
- Azerbaijani
- Russian
- Turkish

9. Knowledge-based answers
- uses text files from the knowledge folder
- answers from protocol materials and internal knowledge documents

10. Export functions
- Copy
- TXT
- DOC

11. Chat memory
- can use previous messages in the same conversation

ProtocolMind is especially useful for:
- parliamentary protocol
- state and official visits
- receiving delegations
- official correspondence
- diplomatic and institutional events`;
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

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question required" });
    }

    if (isCapabilitiesQuestion(question)) {
      return res.status(200).json({
        answer: getCapabilitiesAnswer(language)
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
Provide:
1. Seating logic
2. Practical placement guidance
3. A simple seating structure if relevant

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

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("API ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
}
