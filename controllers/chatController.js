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
    // 1️ Ensure chat belongs to user
    const chatCheck = await pool.query(
      "SELECT id, title FROM chats WHERE id = $1 AND user_id = $2",
      [chatId, userId]
    );
    if (chatCheck.rows.length === 0) {
      return res.status(403).json({ message: "Unauthorized chat access" });
    }
    const chat = chatCheck.rows[0];

    // 2️ Save user message
    const userMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "users", message]
    );

    // 3️ Count messages for first message & summary logic
    const messageCountResult = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE chat_id = $1",
      [chatId]
    );
    const isFirstMessage = Number(messageCountResult.rows[0].count) === 1;
    // 4️ AI prompt for marketing assistant
    const marketingPrompt = [
      {
        role: "system",
        content: `
You are a highly intelligent AI marketing assistant.
Your tasks:
- Ask clarifying questions to understand the user's marketing goals.
- Suggest marketing copy for email campaigns, social media posts, and ads.
- Generate SEO keywords and recommend adjustments for better traffic.
- Provide real-time suggestions to optimize content or campaigns.
- Keep your answers concise, professional, and actionable.
- Avoid unrelated topics.
- Prefer step-by-step instructions and examples.
`
      },
      {
        role: "user",
        content: message
      }
    ];

    const aiReply = await askGrok(marketingPrompt);

    // 5 Save AI message
    const aiMessage = await pool.query(
      "INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING *",
      [chatId, "ai", aiReply]
    );

    // 6️Auto-generate chat title if first message
    let generatedTitle = null;
    if (isFirstMessage && !chat.title) {
      const titlePrompt = [
        {
          role: "system",
          content: "Generate a short, 6-word max, marketing-focused chat title. No emojis or quotes."
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

    // 7 Generate business summary every 5 messages
    let businessSummary = null;
    if (Number(messageCountResult.rows[0].count) % 5 === 0) {
      const summaryPrompt = [
        {
          role: "system",
          content: `
You are a marketing analyst.
Create a short structured marketing insight summary.
Include:
- Core marketing challenge
- Key insights and opportunities
- Recommended next actions
Keep it concise and actionable.
`
        },
        {
          role: "user",
          content: `Conversation so far:\nUser: ${message}\nAI: ${aiReply}`
        }
      ];
      businessSummary = await askGrok(summaryPrompt);
    }

    // 8️ Respond
    res.json({
      userMessage: userMessage.rows[0],
      aiMessage: aiMessage.rows[0],
      chatTitle: generatedTitle,
      businessSummary
    });
  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err.message, err.stack);
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

    // 6️ Growth metric
    const growth = totalMessages > 5 ? "Increasing engagement" : "No data yet";

    // 7️Generate AI insights based on chat content
    const lastFewMessages = messages
      .slice(-10) // last 10 messages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    // Generate insights
    const insightsPrompt = [
      { role: "system", content: "You are a marketing analyst. Provide 3 concise actionable insights from this conversation." },
      { role: "user", content: lastFewMessages },
    ];

    const recentInsightsRaw = await askGrok(insightsPrompt);
    const recentInsights = recentInsightsRaw.split("\n").filter(i => i.trim() !== "");

    // Generate top keywords
    const keywordsPrompt = [
      { role: "system", content: "Analyze this conversation and return 5 top marketing-related keywords separated by commas." },
      { role: "user", content: lastFewMessages },
    ];

    const topKeywordsRaw = await askGrok(keywordsPrompt);
    const topKeywords = topKeywordsRaw.split(",").map(k => k.trim());

    // 8️Return analytics
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
    });
  } catch (err) {
    console.error("GET CHAT ANALYTICS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
