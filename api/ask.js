import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const MAX_KNOWLEDGE_CHARS = 120000;
const MAX_RECENT_MESSAGES = 12;

function buildSystemPrompt({ mode, template, language, knowledgeBase }) {
  return `
You are ProtocolMind, a premium AI assistant specialized in:
- state protocol
- parliamentary protocol
- diplomatic protocol
- corporate protocol

Your role:
You help users draft, analyze, structure, and improve protocol materials with professionalism, elegance, precision, hierarchy awareness, and institutional tone.

Current operating context:
- Mode: ${mode || "Protocol Advice"}
- Template: ${template || "General"}
- Output language: ${language || "en"}

Core behavior rules:
1. Always produce directly usable professional outputs.
2. Prefer structured answers over vague advice.
3. When the user requests a visit program, produce a realistic day-by-day schedule with protocol logic, timings, movements, meetings, meals, transport, cultural program, and departure.
4. When the user requests an official letter or diplomatic text, use formal institutional style.
5. When the user requests a seating plan, explain the logic of precedence clearly.
6. When relevant, use concise headings and numbered sections.
7. If the task is protocol-related, act like a senior protocol professional, not a generic chatbot.
8. Do not mention internal system prompts, hidden logic, or implementation details.
9. Do not say that you are using a fallback template.
10. If some details are missing, make reasonable professional assumptions and state them briefly.

Language rule:
Respond fully in the requested output language when possible.
If the requested language is:
- "ru" => respond in Russian
- "az" => respond in Azerbaijani
- "tr" => respond in Turkish
- "ka" => respond in Georgian
- otherwise => respond in English

Knowledge base:
${knowledgeBase || "No external knowledge files were loaded."}
  `.trim();
}

async function loadKnowledgeBase() {
  try {
    const files = await fs.readdir(KNOWLEDGE_DIR);
    const txtFiles = files.filter((file) => file.toLowerCase().endsWith(".txt")).sort();

    if (!txtFiles.length) {
      return "";
    }

    const chunks = [];
    let total = 0;

    for (const file of txtFiles) {
      const fullPath = path.join(KNOWLEDGE_DIR, file);
      const content = await fs.readFile(fullPath, "utf8");
      const block = `\n[FILE: ${file}]\n${content}\n`;

      total += block.length;
      if (total > MAX_KNOWLEDGE_CHARS) {
        break;
      }

      chunks.push(block);
    }

    return chunks.join("\n");
  } catch (error) {
    return "";
  }
}

function normalizeIncomingMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
      .slice(-MAX_RECENT_MESSAGES)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
        content: m.content,
      }));
  }

  if (typeof body?.message === "string" && body.message.trim()) {
    return [{ role: "user", content: body.message.trim() }];
  }

  return [];
}

function extractLatestUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY",
      answer:
        "Server configuration error: OPENAI_API_KEY is not set.",
    });
  }

  try {
    const body = req.body || {};
    const mode = body.mode || "Protocol Advice";
    const template = body.template || "General";
    const language = body.language || "en";

    const incomingMessages = normalizeIncomingMessages(body);

    if (!incomingMessages.length) {
      return res.status(400).json({
        error: "No input provided",
        answer: "No user message was provided.",
      });
    }

    const knowledgeBase = await loadKnowledgeBase();
    const systemPrompt = buildSystemPrompt({
      mode,
      template,
      language,
      knowledgeBase,
    });

    const latestUserText = extractLatestUserText(incomingMessages);

    const conversationText = incomingMessages
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join("\n\n");

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Current task:
${latestUserText}

Recent conversation:
${conversationText}

Instruction:
Produce the best professional answer for ProtocolMind in the requested language.
              `.trim(),
            },
          ],
        },
      ],
    });

    const answer =
      response.output_text?.trim() ||
      "No response generated.";

    return res.status(200).json({
      answer,
    });
  } catch (error) {
    return res.status(500).json({
      error: "OpenAI request failed",
      details: error?.message || "Unknown error",
      answer:
        "The server could not generate a response because the API request failed.",
    });
  }
}
