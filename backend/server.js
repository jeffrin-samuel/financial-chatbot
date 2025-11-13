import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Paths (ESM fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Initialize OpenAI Client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Financial system prompt
const FINANCIAL_SYSTEM_PROMPT = `You are a helpful financial advisor chatbot specializing in Indian finance. You provide clear, simple explanations about:

1. TAXATION: Income tax, GST, tax-saving investments, deductions under 80C, 80D, etc.
2. MUTUAL FUNDS: Types (equity, debt, hybrid), SIP, NAV, expense ratio, risk profiles
3. INSURANCE: Life insurance, health insurance, term plans, ULIP, claim processes
4. GOVERNMENT SCHEMES: PPF, EPF, Sukanya Samriddhi, Atal Pension Yojana, PM Kisan, etc.

Guidelines:
- Keep explanations simple and jargon-free
- Use examples when helpful
- For specific financial advice, remind users to consult a certified financial advisor
- Focus on Indian financial context
- Provide actionable information

Always be helpful, accurate, and responsible with financial information.`;

// store conversations
const conversations = new Map();

// Query OpenAI
async function queryOpenAI(userMessage, history = []) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing in .env");
  }

  const messages = [
    { role: "system", content: FINANCIAL_SYSTEM_PROMPT },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error("OpenAI Error:", err);
    throw err;
  }
}

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId = "default" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY missing in .env",
        instructions: "Create API key at https://platform.openai.com/api-keys",
      });
    }

    let history = conversations.get(conversationId) || [];

    const recentHistory = history.slice(-6);
    const assistantMessage = await queryOpenAI(message, recentHistory);

    // Add messages to history
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: assistantMessage });

    // Limit history
    if (history.length > 10) {
      history = history.slice(-10);
    }

    conversations.set(conversationId, history);

    res.json({
      response: assistantMessage,
      conversationId,
    });
  } catch (error) {
    console.error("Error:", error);

    res.status(500).json({
      error: "Failed to process request.",
      details: error.message,
    });
  }
});

// Clear conversation
app.post("/api/clear", (req, res) => {
  const { conversationId = "default" } = req.body;
  conversations.delete(conversationId);
  res.json({ message: "Conversation cleared" });
});

// Serve frontend SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Chatbot running at http://localhost:${PORT}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  OPENAI_API_KEY missing in .env");
  } else {
    console.log("✅ OpenAI API key loaded");
  }
});
