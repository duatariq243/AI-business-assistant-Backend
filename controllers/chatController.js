const pool = require("../db");
const { askGrok } = require("../services/grokService");

/* =========================
   CREATE NEW CHAT
========================= */
exports.createChat = async (req, res) => {
  const userId = req.user.id;

  try {
    const newChat = await pool.query(
      "INSERT INTO chats (user_id, created_at) VALUES ($1, NOW()) RETURNING *",
      [userId]
    );

    res.status(201).json(newChat.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   SEND MESSAGE + AI REPLY
========================= */
exports.sendMessage = async (req, res) => {
  const { chatId, message } = req.body;
  const userId = req.user.id;

  if (!chatId || !message) {
    return res.status(400).json({ message: "chatId and message are required" });
  }

  try {
    //  Ensure chat belongs to user
    const chatCheck = await pool.query(
      "SELECT id, title FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(403).json({ message: "Unauthorized chat access" });
    }

    const chat = chatCheck.rows[0];

    //  Get user email + extract name
    const userResult = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [userId]
    );

    let firstName = "there";
    if (userResult.rows.length > 0) {
      const email = userResult.rows[0].email;
      let rawName = email.split("@")[0].replace(/\d+/g, "").split(/[._-]/)[0];
      if (rawName.length > 0) {
        firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
      }
    }

    //  Save user message
    const userMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "users", message]
    );

    // Check if first message
    const messageCountResult = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE chat_id = $1",
      [chatId]
    );

    const messageCount = Number(messageCountResult.rows[0].count);
    const isFirstMessage = messageCount === 1;

    //  Build dynamic greeting
    let greetingInstruction = "";

    if (isFirstMessage) {
      greetingInstruction = `
Start your response with:
"Hi ${firstName}, how can I help you with your business?"

Place it on its own line.
Keep it warm but professional.
If user message is unrelated to business (like just a name), respond politely without assuming business intent.
`;
    }

    //  Marketing Prompt
    const marketingPrompt = [
      {
           role: "system",
    content: `
You are a senior-level AI Marketing Strategist and Growth Consultant with real-world startup and enterprise experience.

You think like a combination of:
- Growth lead at a SaaS startup
- Performance marketing strategist
- Product marketing manager
- Conversion optimization expert

${greetingInstruction}

CORE BEHAVIOR RULES:
- Always understand the user's real business intent before answering.
- Ask yourself: "What is this user actually trying to achieve in business terms?"
- Avoid generic, motivational, or vague advice.
- Never give fake, unrealistic, or surface-level marketing strategies.
- Every suggestion must be practical, executable, and grounded in real marketing logic.
- If data is missing, make reasonable assumptions and state them clearly.
- Think step-by-step internally, but present only clean structured output.

RESPONSE STYLE:
- Professional, confident, and consultant-like (not robotic, not chatbot-like)
- Clear, structured, and insight-driven
- Balanced between strategy and execution
- Slightly conversational but business-focused

RESPONSE STRUCTURE:
1.  Business Goal Interpretation
   - Restate the user's goal in simple business terms

2.  Strategic Insight
   - Explain what is actually happening in the market/user situation
   - Identify opportunity or problem clearly

3.  Growth Strategy
   - Provide 2–4 strong strategic directions
   - Focus on ROI-driven thinking

4. actical Execution Plan
   - Step-by-step actions
   - Real marketing channels (SEO, ads, funnels, email, landing pages, etc.)
   - Keep it practical and implementable

5.  Optimization Suggestions
   - How to improve results further
   - Conversion / retention / scaling ideas

6. Next Step Recommendation
   - Clear action user should take immediately

IMPORTANT:
- Never hallucinate fake tools, fake metrics, or unrealistic results
- Never give random motivational fluff
- Prioritize clarity, logic, and real-world marketing thinking
- Act like you are advising a startup founder who is about to spend money on marketing
`
      },
      {
        role: "user",
        content: message
      }
    ];

    const aiReply = await askGrok(marketingPrompt);

    // 7️⃣ Save AI message
    const aiMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "ai", aiReply]
    );
   
    const lowerMessage = message.toLowerCase();
const greetingRegex = /^(hi|hello|hey|hiya)(,?\s?[a-z]*)?$/i;
const businessKeywords = ["business", "marketing", "sales", "growth", "strategy", "product", "customer", "revenue"];

const isGreetingOnly = greetingRegex.test(lowerMessage);
const isBusinessRelated = !isGreetingOnly && businessKeywords.some(keyword => lowerMessage.includes(keyword));
    // 8️⃣ Auto-generate chat title
    
    let generatedTitle = null;
// Only generate title if chat has no meaningful title yet
if (!chat.title || chat.title === "New Chat") {
  const titlePrompt = [
    {
      role: "system",
      content: "Generate a concise professional chat title in 4-5 words based on the user message. No emojis or quotes."
    },
    { role: "user", content: message }
  ];

  const generatedTitle = await askGrok(titlePrompt);

  // Update DB
  await pool.query(
    "UPDATE chats SET title = $1 WHERE id = $2",
    [generatedTitle.trim(), chatId]
  );

  // Update local variable so response uses it
  chat.title = generatedTitle.trim();
}
    // 9️⃣ Generate summary every 5 messages
    let businessSummary = null;

// Only generate summary if message is business-related AND it's every 5th message
if (messageCount % 5 === 0 && isBusinessRelated) {
  const summaryPrompt = [
    {
      role: "system",
      content: `
You are a senior marketing analyst.

Provide:
1. Core Business Challenge
2. Key Insights
3. Strategic Opportunities
4. Recommended Actions

Be concise and executive-focused.
`
    },
    {
      role: "user",
      content: `User: ${message}\nAI: ${aiReply}`
    }
  ];

  businessSummary = await askGrok(summaryPrompt);
}
    // 🔟 Final Response
    res.json({
      userMessage: userMessage.rows[0],
      aiMessage: aiMessage.rows[0],
      chatTitle: chat.title,
      businessSummary
    });

  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({
      message: "AI error",
      error: err.message
    });
  }
};


/* =========================
   GET CHAT MESSAGES
========================= */
exports.getChatMessages = async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;

  try {
    const chatCheck = await pool.query(
      "SELECT * FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const messages = await pool.query(
      "SELECT id, role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC",
      [chatId]
    );

    res.json({
      chatId,
      messages: messages.rows // ✅ ALWAYS array
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   GET USER CHATS
========================= */
exports.getUserChats = async (req, res) => {
  const userId = req.user.id;

  try {
    const chats = await pool.query(
      "SELECT id, title, created_at FROM chats WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    res.json(chats.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.renameChat = async (req, res) => {
  const { chatId } = req.params;
  const { title } = req.body;
  const userId = req.user.id;

  if (!title) return res.status(400).json({ message: "Title is required" });

  try {
    // check chat belongs to user
    const chatCheck = await pool.query(
      "SELECT id FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // update title
    await pool.query("UPDATE chats SET title = $1 WHERE id = $2", [title, chatId]);

    res.json({ message: "Chat renamed successfully", title });
  } catch (err) {
    console.error("RENAME CHAT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.deleteChat = async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;

  try {
    //  Ensure chat belongs to user
    const chatCheck = await pool.query(
      "SELECT id FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    //  Delete messages first
    await pool.query("DELETE FROM messages WHERE chat_id = $1", [chatId]);

    //  Delete chat
    await pool.query("DELETE FROM chats WHERE id = $1", [chatId]);

    res.json({ message: "Chat deleted successfully" });
  } catch (err) {
    console.error("DELETE CHAT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getChatAnalytics = async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;

  try {
    //  Check chat belongs to user
    const chatCheck = await pool.query(
      "SELECT * FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const chatTitle = chatCheck.rows[0].title;

    //  Get all messages for this chat
    const messagesResult = await pool.query(
      "SELECT role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC",
      [chatId]
    );
    const messages = messagesResult.rows;

    //  Aggregate basic data
    const totalMessages = messages.length;
    const aiSuggestions = messages.filter(m => m.role === "ai").length;

    //  Daily messages
    const dailyMessagesMap = {};
    messages.forEach(msg => {
      const day = new Date(msg.created_at).toLocaleDateString("en-US", {
        weekday: "short",
      });
      dailyMessagesMap[day] = (dailyMessagesMap[day] || 0) + 1;
    });
    const dailyMessages = Object.keys(dailyMessagesMap).map(day => ({
      day,
      messages: dailyMessagesMap[day],
    }));

    //  User vs AI messages
    const userCount = messages.filter(m => m.role === "users").length;
    const aiCount = messages.filter(m => m.role === "ai").length;
    const userVsAi = [
      { name: "User", value: userCount },
      { name: "AI", value: aiCount },
    ];

    //  Determine if last few user messages are greetings only
    const lastUserMessages = messages
      .filter(m => m.role === "users")
      .slice(-5)
      .map(m => m.content.toLowerCase())
      .join(" ");

    const greetingRegex = /^(hi|hello|hey|hiya)(,?\s?[a-z]*)?$/i;
    const businessKeywords = ["business", "marketing", "sales", "growth", "strategy", "product", "customer", "revenue"];

    const isGreetingOnly = greetingRegex.test(lastUserMessages);
    const isBusinessRelated = !isGreetingOnly && businessKeywords.some(keyword => lastUserMessages.includes(keyword));

    //  Revenue & Customer Growth (fake data only if business-related)
    const revenueTrend = isBusinessRelated
      ? [
          { day: "Mon", revenue: 1000, expenses: 500 },
          { day: "Tue", revenue: 1200, expenses: 700 },
          { day: "Wed", revenue: 900, expenses: 400 },
          { day: "Thu", revenue: 1500, expenses: 800 },
          { day: "Fri", revenue: 1700, expenses: 600 },
        ]
      : [];

    const customerGrowth = isBusinessRelated
      ? [
          { day: "Mon", newCustomers: 5, churn: 1 },
          { day: "Tue", newCustomers: 8, churn: 2 },
          { day: "Wed", newCustomers: 6, churn: 1 },
          { day: "Thu", newCustomers: 10, churn: 3 },
          { day: "Fri", newCustomers: 7, churn: 1 },
        ]
      : [];

    //  Business growth calculation
    let growth = "";
    if (isBusinessRelated && revenueTrend.length > 0) {
      const totalRevenue = revenueTrend.reduce((sum, r) => sum + r.revenue, 0);
      const totalExpenses = revenueTrend.reduce((sum, r) => sum + r.expenses, 0);
      growth = totalRevenue - totalExpenses > 0 ? "Profitable 📈" : "Loss 📉";
    }

    // Generate AI insights and keywords only if business-related
    const lastFewMessages = messages
      .slice(-10)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    let recentInsights = [];
    let topKeywords = [];

    if (isBusinessRelated) {
      try {
        const insightsPrompt = [
          { role: "system", content: "You are a marketing analyst. Provide 3 concise actionable insights from this conversation." },
          { role: "user", content: lastFewMessages },
        ];
        const recentInsightsRaw = await askGrok(insightsPrompt);
        if (recentInsightsRaw) {
          recentInsights = recentInsightsRaw
            .split(/\n|•|[0-9]\./)
            .map(i => i.trim())
            .filter(i => i.length > 0)
            .slice(0, 3);
        }
      } catch (err) {
        console.warn("AI insights generation failed:", err);
      }

      try {
        const keywordsPrompt = [
          { role: "system", content: "Analyze this conversation and return 5 top marketing-related keywords separated by commas." },
          { role: "user", content: lastFewMessages },
        ];
        const topKeywordsRaw = await askGrok(keywordsPrompt);
        if (topKeywordsRaw) {
          topKeywords = topKeywordsRaw
            .split(",")
            .map(k => k.trim())
            .filter(k => k.length > 0)
            .slice(0, 5);
        }
      } catch (err) {
        console.warn("AI keywords generation failed:", err);
      }
    }

    //  Return analytics
    res.json({
      chatId,
      chatTitle,
      totalMessages,
      aiSuggestions,
      dailyMessages,
      userVsAi,
      recentInsights,
      topKeywords,
      growth,
      revenueTrend,
      customerGrowth,
    });
  } catch (err) {
    console.error("GET CHAT ANALYTICS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};