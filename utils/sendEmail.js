const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendOTPEmail = async (email, otp) => {
  const msg = {
    to: email,
    from: "AI Assistant <duag2435@gmail.com>",
    subject: "Your verification code for AI Business Assistant",

text: `Hello ${email}, your verification code is ${otp}. It expires in 10 minutes.`,

html: `
<div style="font-family: Arial; padding:20px;">
  <h2>AI Business Assistant</h2>
  <p>Hello,</p>
  <p>Your verification code is:</p>
  <h1>${otp}</h1>
  <p>This code expires in 10 minutes.</p>
</div>
`,
  };

  return await sgMail.send(msg);
};

module.exports = sendOTPEmail;