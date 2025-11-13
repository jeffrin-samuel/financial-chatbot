import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Get current file and directory paths (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// IMPORTANT: Serve static files (HTML, CSS, JS) from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize Google Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Financial knowledge base for system prompt
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

// Store conversation history
const conversations = new Map();

// Query Google Gemini API using the SDK
async function queryGemini(userMessage, history = []) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in .env file");
  }

  // Build conversation context
  let fullPrompt = FINANCIAL_SYSTEM_PROMPT + "\n\n";
  
  if (history.length > 0) {
    fullPrompt += "Previous conversation:\n";
    history.forEach((msg) => {
      fullPrompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`;
    });
    fullPrompt += "\n";
  }
  
  fullPrompt += `User: ${userMessage}\n\nAssistant:`;

  try {
    const response = await ai.models.generateContent({
      model: "models/gemini-1.5-flash-002",
      contents: fullPrompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId = "default" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: "API key not configured. Please add GEMINI_API_KEY to your .env file",
        instructions: "Get your free key at: https://aistudio.google.com/app/apikey"
      });
    }

    let history = conversations.get(conversationId) || [];
    console.log("Sending request to Gemini...");

    const recentHistory = history.slice(-6);
    const assistantMessage = await queryGemini(message, recentHistory);

    console.log("Received response from Gemini");

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: assistantMessage });

    if (history.length > 10) {
      history = history.slice(-10);
    }

    conversations.set(conversationId, history);

    res.json({
      response: assistantMessage,
      conversationId: conversationId,
    });
  } catch (error) {
    console.error("Error:", error);
    
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("invalid")) {
      return res.status(401).json({
        error: "Invalid API key. Please check your GEMINI_API_KEY in .env file",
        instructions: "Get your free key at: https://aistudio.google.com/app/apikey"
      });
    }
    
    if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({
        error: "Rate limit reached. Please wait a moment and try again.",
        details: "Free tier has usage limits."
      });
    }
    
    res.status(500).json({
      error: "Failed to process message. Please try again.",
      details: error.message,
    });
  }
});

// Clear conversation endpoint
app.post("/api/clear", (req, res) => {
  const { conversationId = "default" } = req.body;
  conversations.delete(conversationId);
  res.json({ message: "Conversation cleared" });
});

// Serve index.html for all other routes (IMPORTANT for serving your frontend)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Financial Chatbot running on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log(`⚠️  WARNING: GEMINI_API_KEY not found in .env file`);
  } else {
    console.log(`✅ API key configured successfully`);
  }
});