const axios = require("axios");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const systemPrompt = {
  role: "system",
  content:
    "You are an experienced product manager helping small business owners. Give clear, simple, practical advice."
};
exports.askGrok = async (messages) =>{
    const response = await axios.post(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    model: "openai/gpt-3.5-turbo",
    messages: [systemPrompt, ...messages],
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
  }
);

    return response.data.choices[0].message.content;
}