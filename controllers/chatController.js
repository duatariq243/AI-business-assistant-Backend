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
    /* ===============================
       1️⃣  Ensure chat belongs to user
    =============================== */
    const chatCheck = await pool.query(
      "SELECT id, title FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(403).json({ message: "Unauthorized chat access" });
    }

    const chat = chatCheck.rows[0];

    /* ===============================
       2️⃣  Get user email + extract name
    =============================== */
    const userResult = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [userId]
    );
    console.log("USER ID:", userId);
console.log("USER RESULT:", userResult.rows);


    let firstName = "there";

      if (userResult.rows.length > 0) {
        const email = userResult.rows[0].email;

        let rawName = email.split("@")[0];       // "duatariq243"
        rawName = rawName.replace(/\d+/g, "");  // remove numbers -> "duatariq"
        rawName = rawName.split(/[._-]/)[0];    // keep first part -> "duatariq"

        if (rawName.length > 0) {
          firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase(); // "Duatariq"
        }
      }

console.log("FINAL FIRST NAME:", firstName);


    /* ===============================
       3️⃣  Save user message
    =============================== */
    const userMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "users", message]
    );

    /* ===============================
       4️⃣  Check if first message
    =============================== */
    const messageCountResult = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE chat_id = $1",
      [chatId]
    );

    const messageCount = Number(messageCountResult.rows[0].count);
    const isFirstMessage = messageCount === 1;

    /* ===============================
       5️⃣  Build Dynamic Greeting
    =============================== */
    let greetingInstruction = "";

    if (isFirstMessage) {
      greetingInstruction = `
Start your response with:
"Hi ${firstName},"

Place it on its own line.
Keep it warm but professional.
`;
    }

    /* ===============================
       6️⃣  AI Marketing Prompt
    =============================== */
    const marketingPrompt = [
      {
        role: "system",
        content: `
You are an advanced AI marketing strategist and growth consultant.

${greetingInstruction}

Behavior Rules:
- Think strategically before answering.
- Identify the user's real business objective.
- Avoid generic advice.
- Provide structured, executive-level insight.
- Be concise, tactical, and professional.
- Use step-by-step clarity when appropriate.
- Focus strictly on marketing and growth.

Response Structure:
1. Greeting (only if first message)
2. Understanding of goal
3. Strategy
4. Tactical examples
5. Recommended next steps
`
      },
      {
        role: "user",
        content: message
      }
    ];

    const aiReply = await askGrok(marketingPrompt);

    /* ===============================
       7️⃣  Save AI message
    =============================== */
    const aiMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "ai", aiReply]
    );

    /* ===============================
       8️⃣  Auto-generate chat title
    =============================== */
    let generatedTitle = null;

    if (isFirstMessage && !chat.title) {
      const titlePrompt = [
        {
          role: "system",
          content: `
Generate a concise professional marketing chat title.

Rules:
- Maximum 6 words
- No emojis
- No quotation marks
- Reflect core marketing intent
`
        },
        {
          role: "user",
          content: message
        }
      ];

      generatedTitle = await askGrok(titlePrompt);

      await pool.query(
        "UPDATE chats SET title = $1 WHERE id = $2",
        [generatedTitle.trim(), chatId]
      );
    }

    /* ===============================
       9️⃣  Generate summary every 5 messages
    =============================== */
    let businessSummary = null;

    if (messageCount % 5 === 0) {
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

    /* ===============================
       🔟  Final Response
    =============================== */
    res.json({
      userMessage: userMessage.rows[0],
      aiMessage: aiMessage.rows[0],
      chatTitle: generatedTitle,
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
    // 1️ Check chat belongs to user
    const chatCheck = await pool.query(
      "SELECT * FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const chatTitle = chatCheck.rows[0].title;

    // 2️ Get all messages for this chat
    const messagesResult = await pool.query(
      "SELECT role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC",
      [chatId]
    );

    const messages = messagesResult.rows;

    // 3️ Aggregate basic data
    const totalMessages = messages.length;
    const aiSuggestions = messages.filter(m => m.role === "ai").length;

    // 4️ Daily messages
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

    // 5️ User vs AI messages
    const userCount = messages.filter(m => m.role === "users").length;
    const aiCount = messages.filter(m => m.role === "ai").length;
    const userVsAi = [
      { name: "User", value: userCount },
      { name: "AI", value: aiCount },
    ];

    // 6️ Revenue & Customer Growth (fake data for demo / charts)
    const revenueTrend = messages.length
      ? [
          { day: "Mon", revenue: 1000, expenses: 500 },
          { day: "Tue", revenue: 1200, expenses: 700 },
          { day: "Wed", revenue: 900, expenses: 400 },
          { day: "Thu", revenue: 1500, expenses: 800 },
          { day: "Fri", revenue: 1700, expenses: 600 },
        ]
      : [];

    const customerGrowth = messages.length
      ? [
          { day: "Mon", newCustomers: 5, churn: 1 },
          { day: "Tue", newCustomers: 8, churn: 2 },
          { day: "Wed", newCustomers: 6, churn: 1 },
          { day: "Thu", newCustomers: 10, churn: 3 },
          { day: "Fri", newCustomers: 7, churn: 1 },
        ]
      : [];

    // 7️ Business growth calculation
    let growth = "No data yet";
    const totalRevenue = revenueTrend.reduce((sum, r) => sum + r.revenue, 0);
    const totalExpenses = revenueTrend.reduce((sum, r) => sum + r.expenses, 0);
    if (totalRevenue > 0) {
      growth =
        totalRevenue - totalExpenses > 0
          ? "Profitable 📈"
          : "Loss 📉";
    }

    // 8️ Generate AI insights
    const lastFewMessages = messages
      .slice(-10)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    let recentInsights = [];
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
      recentInsights = [];
    }

    // 9️ Generate top keywords
    let topKeywords = [];
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
      topKeywords = [];
    }

    // 10️ Return analytics
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

