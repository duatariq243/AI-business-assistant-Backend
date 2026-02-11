const { askGrok } = require("./grokService");

exports.generateLandingPage = async (landingDescription) => {
  // Prompt AI to generate landing page with marketing style
  const prompt = [
    {
      role: "system",
      content: `
You are an AI marketing landing page designer.
- Generate HTML and CSS for a landing page.
- Style it beautifully for marketing.
- Include: Hero section, Features, Testimonials, CTA, Footer.
- Suggest SEO keywords, CTA improvements, and performance tips.
- Provide JSON metadata for analytics.
- Respond ONLY with HTML/CSS and JSON metadata.
`
    },
    {
      role: "user",
      content: landingDescription
    }
  ];

  const response = await askGrok(prompt);

  // Assume AI responds with { html: "...", analytics: {...} }
  // You may need to parse JSON if AI returns as string
  let htmlContent = response.html || response; 
  let analytics = response.analytics || {};

  return { htmlContent, analytics };
};
