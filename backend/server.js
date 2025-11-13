import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FINANCIAL_SYSTEM_PROMPT = `You are a helpful financial advisor chatbot specializing in Indian finance. You provide clear, simple explanations about:

1. TAXATION: Income tax, GST, tax-saving investments, deductions under 80C, 80D, etc.
2. MUTUAL FUNDS: Types (equity, debt, hybrid), SIP, NAV, expense ratio, risk profiles
3. INSURANCE: Life insurance, health insurance, term plans, ULIP, claim processes
4. GOVERNMENT SCHEMES: PPF, EPF, Sukanya Samriddhi, Atal Pension Yojana, PM Kisan, etc.
5. REAL-TIME DATA: Gold rates, stock prices, fuel prices, currency rates, crypto prices

You have access to these tools:
- search_web: For general queries, news, tax slabs, fuel prices
- get_gold_rate: For accurate gold rates in India (22K and 24K) - searches live Indian sources
- get_stock_price: For Indian stock prices (NSE/BSE)
- get_crypto_price: For cryptocurrency prices
- get_mutual_fund_nav: For mutual fund NAV

Guidelines:
- Keep explanations simple and jargon-free
- Use examples when helpful
- Always cite sources when using searched information
- For live data, use the specific tools for accuracy
- If search results are unavailable, provide general guidance

Always be helpful, accurate, and responsible with financial information.`;

const conversations = new Map();

// DuckDuckGo Search (No API key needed)
async function searchWeb(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.log("DuckDuckGo search failed:", response.status);
      return null;
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    const results = [];
    const resultElements = doc.querySelectorAll('.result');
    
    for (let i = 0; i < Math.min(5, resultElements.length); i++) {
      const elem = resultElements[i];
      const titleElem = elem.querySelector('.result__a');
      const snippetElem = elem.querySelector('.result__snippet');
      
      if (titleElem && snippetElem) {
        results.push({
          title: titleElem.textContent.trim(),
          snippet: snippetElem.textContent.trim(),
          url: titleElem.getAttribute('href')
        });
      }
    }
    
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error("DuckDuckGo search error:", error.message);
    return null;
  }
}

// Enhanced Gold Rate - Uses Indian-specific sources
async function getGoldRate() {
  console.log("🔍 Fetching gold rates from Indian sources...");
  
  // Method 1: Search Indian gold rate websites (Most Accurate for India)
  try {
    // Search specifically for Indian gold rates with today's date
    const searchQuery = "gold rate today india 22k 24k per 10 gram goodreturns bankbazaar";
    const searchResults = await searchWeb(searchQuery);
    
    if (searchResults && searchResults.length > 0) {
      console.log("✅ Found gold rates from Indian sources");
      
      // Build response from search results
      let goldInfo = "💰 Current Gold Rates in India:\n\n";
      
      // Filter for reliable Indian sources
      const reliableSources = searchResults.filter(result => {
        const url = result.url?.toLowerCase() || '';
        const title = result.title.toLowerCase();
        return (
          url.includes('goodreturns') || 
          url.includes('bankbazaar') || 
          url.includes('moneycontrol') ||
          url.includes('livemint') ||
          url.includes('hindustantimes') ||
          title.includes('gold rate') ||
          title.includes('gold price')
        );
      });
      
      const resultsToShow = reliableSources.length > 0 ? reliableSources : searchResults;
      
      resultsToShow.slice(0, 3).forEach((result, idx) => {
        goldInfo += `${idx + 1}. ${result.title}\n`;
        goldInfo += `   ${result.snippet}\n\n`;
      });
      
      goldInfo += "📍 Note:\n";
      goldInfo += "• Rates vary by city (Mumbai, Delhi, Chennai, Kolkata, etc.)\n";
      goldInfo += "• Jeweler making charges are additional (₹300-₹600 per gram)\n";
      goldInfo += "• Check with your local jeweler for exact rates\n\n";
      goldInfo += "🔗 Reliable sources:\n";
      goldInfo += "• GoodReturns.in - Daily updated rates\n";
      goldInfo += "• BankBazaar.com - City-wise rates\n";
      goldInfo += "• MoneyControl.com - Real-time updates";
      
      return {
        info: goldInfo,
        source: "Indian Web Sources",
        method: "search",
        accurate: true
      };
    }
  } catch (error) {
    console.warn("⚠️  Indian web search failed:", error.message);
  }
  
  // Method 2: Fallback to general search
  try {
    console.log("🔄 Trying general gold rate search...");
    const fallbackResults = await searchWeb("gold rate india today");
    
    if (fallbackResults && fallbackResults.length > 0) {
      let fallbackInfo = "💰 Gold Rate Information:\n\n";
      
      fallbackResults.slice(0, 2).forEach((result, idx) => {
        fallbackInfo += `${idx + 1}. ${result.title}\n${result.snippet}\n\n`;
      });
      
      fallbackInfo += "For the most accurate rates, please visit:\n";
      fallbackInfo += "• GoodReturns.in\n";
      fallbackInfo += "• BankBazaar.com\n";
      fallbackInfo += "• Your local jeweler's website";
      
      return {
        info: fallbackInfo,
        source: "Web Search",
        method: "fallback"
      };
    }
  } catch (error) {
    console.error("⚠️  Fallback search failed:", error.message);
  }
  
  // All methods failed
  return null;
}

// Stock Price - Yahoo Finance (Free, no key needed)
async function getStockPrice(symbol) {
  try {
    // Add .NS for NSE or .BO for BSE if not present
    if (!symbol.includes('.')) {
      symbol = `${symbol}.NS`;
    }
    
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    );
    
    if (!response.ok) {
      console.log(`Yahoo Finance failed for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    const quote = data.chart?.result?.[0];
    
    if (!quote || !quote.meta) {
      return null;
    }
    
    const meta = quote.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    return {
      symbol: meta.symbol,
      name: meta.longName || meta.shortName || symbol,
      price: currentPrice.toFixed(2),
      change: change.toFixed(2),
      change_percent: changePercent.toFixed(2),
      currency: meta.currency || "INR"
    };
  } catch (error) {
    console.error("Stock price error:", error.message);
    return null;
  }
}

// Crypto Price - CoinGecko (Free, no key needed)
async function getCryptoPrice(cryptoId = "bitcoin") {
  try {
    // Map common names to CoinGecko IDs
    const idMap = {
      'btc': 'bitcoin',
      'bitcoin': 'bitcoin',
      'eth': 'ethereum',
      'ethereum': 'ethereum',
      'doge': 'dogecoin',
      'dogecoin': 'dogecoin',
      'usdt': 'tether',
      'tether': 'tether',
      'bnb': 'binancecoin',
      'xrp': 'ripple',
      'ripple': 'ripple',
      'ada': 'cardano',
      'cardano': 'cardano',
      'sol': 'solana',
      'solana': 'solana',
      'matic': 'matic-network',
      'polygon': 'matic-network'
    };
    
    const id = idMap[cryptoId.toLowerCase()] || cryptoId.toLowerCase();
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=inr,usd&include_24hr_change=true`
    );
    
    if (!response.ok) {
      console.log(`CoinGecko failed for ${id}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    const crypto = data[id];
    
    if (!crypto) {
      return null;
    }
    
    return {
      name: id.charAt(0).toUpperCase() + id.slice(1),
      price_inr: crypto.inr?.toLocaleString('en-IN', {maximumFractionDigits: 2}),
      price_usd: crypto.usd?.toLocaleString('en-US', {maximumFractionDigits: 2}),
      change_24h: crypto.inr_24h_change?.toFixed(2)
    };
  } catch (error) {
    console.error("Crypto price error:", error.message);
    return null;
  }
}

// Mutual Fund NAV - MFAPI (Free, no key needed)
async function getMutualFundNAV(schemeCode) {
  try {
    const response = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    
    if (!response.ok) {
      console.log(`MFAPI failed for scheme ${schemeCode}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    const latest = data.data?.[0];
    
    if (!latest) {
      return null;
    }
    
    return {
      scheme_name: data.meta?.scheme_name || "Unknown Scheme",
      nav: latest.nav,
      date: latest.date
    };
  } catch (error) {
    console.error("Mutual fund NAV error:", error.message);
    return null;
  }
}

// Function definitions for OpenAI
const tools = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for current information like tax slabs, fuel prices, news, government schemes, etc. Use this for general queries that need recent information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. Be specific. Examples: 'income tax slab 2024-25 india', 'petrol price mumbai today', 'EPF interest rate 2024'"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_gold_rate",
      description: "Get the current and accurate gold rate in India (22K and 24K per gram and per 10 grams) from reliable Indian sources like GoodReturns, BankBazaar, MoneyControl",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_stock_price",
      description: "Get real-time stock price for Indian stocks traded on NSE or BSE",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock symbol. Examples: 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TATAMOTORS'. Will automatically add .NS for NSE."
          }
        },
        required: ["symbol"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_crypto_price",
      description: "Get current cryptocurrency price in INR and USD with 24-hour change",
      parameters: {
        type: "object",
        properties: {
          crypto_id: {
            type: "string",
            description: "Cryptocurrency name or symbol. Examples: 'bitcoin', 'btc', 'ethereum', 'eth', 'dogecoin', 'solana'"
          }
        },
        required: ["crypto_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_mutual_fund_nav",
      description: "Get the latest NAV (Net Asset Value) for an Indian mutual fund scheme using its scheme code",
      parameters: {
        type: "object",
        properties: {
          scheme_code: {
            type: "string",
            description: "The mutual fund scheme code. Examples: '119551' for SBI Bluechip Fund, '118989' for HDFC Mid-Cap Opportunities Fund"
          }
        },
        required: ["scheme_code"]
      }
    }
  }
];

// Process tool calls
async function processToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const params = JSON.parse(args);
  
  console.log(`🔧 Tool called: ${name}`, params);
  
  switch(name) {
    case "search_web":
      const searchResults = await searchWeb(params.query);
      
      if (!searchResults) {
        return `I couldn't fetch search results at the moment. However, I can provide general information about "${params.query}" based on my knowledge. Would you like me to explain what I know about this topic?`;
      }
      
      let resultText = `Here's what I found about "${params.query}":\n\n`;
      searchResults.forEach((result, idx) => {
        resultText += `${idx + 1}. ${result.title}\n${result.snippet}\n\n`;
      });
      return resultText;
      
    case "get_gold_rate":
      const goldData = await getGoldRate();
      
      if (!goldData) {
        return "I couldn't fetch gold rates right now. For the most accurate and current gold rates in India, please visit:\n\n🔗 Recommended websites:\n• GoodReturns.in - Daily city-wise rates\n• BankBazaar.com - Compare rates across cities\n• MoneyControl.com - Real-time updates\n• LiveMint.com - Market analysis\n\n📍 Or check with:\n• Your local jeweler\n• Bank websites (HDFC, SBI, ICICI)\n• India Bullion & Jewellers Association (IBJA)\n\nNote: Gold rates vary by city, and jewelers charge additional making charges (₹300-₹600 per gram).";
      }
      
      return goldData.info;
      
    case "get_stock_price":
      const stockData = await getStockPrice(params.symbol);
      
      if (!stockData) {
        return `I couldn't fetch the stock price for "${params.symbol}". Please ensure:\n1. The symbol is correct (e.g., RELIANCE, TCS, INFY)\n2. Try adding .NS for NSE stocks (e.g., RELIANCE.NS)\n3. The stock is listed on NSE or BSE\n\nFor accurate real-time prices, please check:\n- NSE India website (nseindia.com)\n- BSE India website (bseindia.com)\n- Your trading app`;
      }
      
      const changeSymbol = stockData.change >= 0 ? '📈' : '📉';
      const changePrefix = stockData.change >= 0 ? '+' : '';
      
      return `${changeSymbol} ${stockData.name} (${stockData.symbol})\n\nCurrent Price: ${stockData.currency} ${stockData.price}\nChange: ${changePrefix}${stockData.change} (${changePrefix}${stockData.change_percent}%)\n\nNote: This is real-time data from Yahoo Finance. For trading, always verify with your broker.`;
      
    case "get_crypto_price":
      const cryptoData = await getCryptoPrice(params.crypto_id);
      
      if (!cryptoData) {
        return `I couldn't fetch the price for "${params.crypto_id}". Please check:\n1. The cryptocurrency name is correct\n2. Try using full names (bitcoin, ethereum) or common symbols (btc, eth)\n\nFor live crypto prices, visit:\n- CoinGecko.com\n- CoinMarketCap.com\n- Your crypto exchange app`;
      }
      
      const cryptoSymbol = cryptoData.change_24h >= 0 ? '📈' : '📉';
      const cryptoPrefix = cryptoData.change_24h >= 0 ? '+' : '';
      
      return `${cryptoSymbol} ${cryptoData.name}\n\nCurrent Price:\n• ₹${cryptoData.price_inr} INR\n• $${cryptoData.price_usd} USD\n\n24h Change: ${cryptoPrefix}${cryptoData.change_24h}%\n\nSource: CoinGecko\nNote: Crypto prices are highly volatile. This is for informational purposes only.`;
      
    case "get_mutual_fund_nav":
      const mfData = await getMutualFundNAV(params.scheme_code);
      
      if (!mfData) {
        return `I couldn't fetch NAV for scheme code "${params.scheme_code}". Please:\n1. Verify the scheme code is correct\n2. Check if the fund is an Indian mutual fund\n3. Try searching for the fund name on the AMC website\n\nYou can find scheme codes on:\n- AMFI website (amfiindia.com)\n- Your AMC's website\n- Your mutual fund statement`;
      }
      
      return `📊 ${mfData.scheme_name}\n\nLatest NAV: ₹${mfData.nav}\nDate: ${mfData.date}\n\nSource: MFAPI (India)\nNote: NAV is updated daily by fund houses.`;
      
    default:
      return "Unknown function called.";
  }
}

// Main chat handler with function calling
async function generateAnswer(userMessage, history = []) {
  const messages = [
    { role: "system", content: FINANCIAL_SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: "user", content: userMessage }
  ];

  let response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.3
  });

  let assistantMessage = response.choices[0].message;
  
  // Handle tool calls (can be multiple)
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);
    
    for (const toolCall of assistantMessage.tool_calls) {
      const functionResponse = await processToolCall(toolCall);
      
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: functionResponse
      });
    }
    
    response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3
    });
    
    assistantMessage = response.choices[0].message;
  }

  return assistantMessage.content;
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
    const assistantMessage = await generateAnswer(message, history);

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: assistantMessage });

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

app.post("/api/clear", (req, res) => {
  const { conversationId = "default" } = req.body;
  conversations.delete(conversationId);
  res.json({ message: "Conversation cleared" });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    apis: {
      openai: !!process.env.OPENAI_API_KEY,
      goldSource: "Indian Web Search (GoodReturns, BankBazaar, etc.)"
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Financial Chatbot running at http://localhost:${PORT}\n`);
  console.log("📋 API Status:");
  console.log(`   ✅ OpenAI: ${process.env.OPENAI_API_KEY ? 'Connected' : '❌ Missing'}`);
  console.log(`   ✅ Gold Rates: Indian web sources (GoodReturns, BankBazaar, MoneyControl)`);
  console.log(`   ✅ Yahoo Finance: No key needed`);
  console.log(`   ✅ CoinGecko: No key needed`);
  console.log(`   ✅ MFAPI India: No key needed`);
  console.log(`   ✅ DuckDuckGo Search: No key needed\n`);
  console.log("💡 Gold rates are fetched from Indian sources for accuracy!");
  console.log("   Sources include: GoodReturns.in, BankBazaar.com, MoneyControl.com\n");
});