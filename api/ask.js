import OpenAI from "openai";

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

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
  rateLimitMap.set(ip, entry);
  return true;
}

const protocolKnowledge = [
  {
    topic: "seating",
    keywords: ["seating", "seat", "table", "placement", "delegate", "delegation", "rectangular", "round table", "bilateral", "multilateral"],
    content: `
Seating and precedence guidance:
- Bilateral meetings should generally follow parity and symmetry.
- Principals should occupy central or mirror positions depending on room format.
- Equivalent rank should face equivalent rank.
- Advisers should be placed by seniority and function.
- Interpreters should be positioned for audibility, visibility, and minimal disruption.
- Room geometry, camera angle, nameplates, and flag visibility must be checked before final approval.
- In multilateral formats, precedence may depend on host-country protocol, institutional rules, or alphabetical order.
`
  },
  {
    topic: "flags",
    keywords: ["flag", "flags", "order of flags", "national flag", "backdrop", "symbol"],
    content: `
Flag protocol guidance:
- Bilateral events should preserve visual parity and political neutrality.
- Multilateral flag order often follows host-country protocol, institutional order, or alphabetical order in an agreed language.
- Flags should be of equal size, equal height, good condition, and properly lit if indoors.
- Never improvise flag sequence without checking the governing rule for the event.
`
  },
  {
    topic: "titles",
    keywords: ["title", "titles", "address", "form of address", "eminence", "holiness", "patriarch", "excellency"],
    content: `
Forms of address guidance:
- Official titles must be verified before publication, speaking notes, and nameplates.
- Use the full formal title on first reference unless a shorter style is protocol-approved.
- Clergy, parliamentary leaders, ministers, and diplomatic figures may require institution-specific forms.
- When uncertain, verify directly with the counterpart side or competent protocol office.
`
  },
  {
    topic: "visits",
    keywords: ["visit", "official visit", "arrival", "greeting line", "motorcade", "escort", "delegation visit", "vip arrival"],
    content: `
Official visit guidance:
- Every official visit should have a written sequence for arrival, greeting, movement, photo point, seating, speeches, and departure.
- First greeter, greeting order, escort logic, media position, and fallback weather plan should be defined in advance.
- Protocol and security should coordinate without visible friction.
- Timing gaps and title accuracy matter.
`
  },
  {
    topic: "checklists",
    keywords: ["checklist", "steps", "prepare", "organize", "planning", "protocol checklist"],
    content: `
Protocol checklist guidance:
- Confirm event purpose and format.
- Confirm participants, rank, titles, and speaking order.
- Approve seating, flags, nameplates, gifts, press line, movement line, and escort order.
- Check venue access, security, timing, interpretation, and contingency plan.
- Confirm final brief for principal and protocol team.
`
  },
  {
    topic: "gifts",
    keywords: ["gift", "gifts", "presentation gift", "official gift", "exchange gift"],
    content: `
Official gift guidance:
- Gifts should match rank, tone, and cultural context.
- Presentation timing and press visibility should be decided in advance.
- Avoid politically sensitive, culturally ambiguous, oversized, or impractical items.
- Packaging and handling should reflect official dignity.
`
  }
];

function getRelevantKnowledge(question) {
  const q = question.toLowerCase();
  const matches = [];

  for (const item of protocolKnowledge) {
    let score = 0;

    for (const keyword of item.keywords) {
      if (q.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      matches.push({ ...item, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, 3).map(item => `Topic: ${item.topic}\n${item.content}`).join("\n\n");
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
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

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

    const relevantKnowledge = getRelevantKnowledge(question);

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

Use the following protocol knowledge whenever relevant:
${relevantKnowledge || "No direct knowledge match found. Answer cautiously."}

${modeInstruction}
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
