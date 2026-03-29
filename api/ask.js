import fs from "fs";
import path from "path";

function loadKnowledgeFiles() {
  try {
    const knowledgeDir = path.join(process.cwd(), "knowledge");

    if (!fs.existsSync(knowledgeDir)) {
      return "";
    }

    const files = fs
      .readdirSync(knowledgeDir)
      .filter((file) => file.endsWith(".txt"));

    let combinedKnowledge = "";

    for (const file of files) {
      const fullPath = path.join(knowledgeDir, file);
      const content = fs.readFileSync(fullPath, "utf8");
      combinedKnowledge += `\n\n===== FILE: ${file} =====\n${content}\n`;
    }

    return combinedKnowledge.trim();
  } catch (error) {
    console.error("KNOWLEDGE LOAD ERROR:", error);
    return "";
  }
}

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
      history = [],
    } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    const knowledgeBase = loadKnowledgeFiles();
    const systemPrompt = `
You are ProtocolMind, a professional AI assistant specialized in:
- diplomatic protocol
- parliamentary protocol
- official visits
- seating plans
- protocol checklists
- official letters
- note verbale
- visit programs
- protocol packs

Current language: ${language}
Current mode: ${mode}
Current template: ${template}

Your job:
- answer in the selected language
- be practical, formal, structured, and institutionally correct
- prefer protocol logic over generic advice
- when needed, produce document-style outputs
- when asked for letters, produce polished official drafts
- when asked for seating, explain hierarchy, symmetry, principal placement, and interpreter logic
- when asked for visit programs, make them realistic and operational
- when asked for checklists, separate items clearly
- when useful, rely on the knowledge base below

KNOWLEDGE BASE:
${knowledgeBase || "No knowledge files loaded."}
`.trim();

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...(Array.isArray(history)
        ? history
            .filter((item) => item && item.role && item.content)
            .slice(-10)
            .map((item) => ({
              role: item.role,
              content: String(item.content),
            }))
        : []),
      {
        role: "user",
        content: String(question),
      },
    ];

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages,
          temperature: 0.4,
        }),
      }
    );

    const data = await openaiResponse.json();
        if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data?.error?.message || "OpenAI request failed",
        details: data,
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
        details: data,
      });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("ASK API ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
}
