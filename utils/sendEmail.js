const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendOTPEmail = async (email, otp) => {
  const msg = {
    to: email,
    from: "duag2435@gmail.com",
    subject: "OTP Verification Code",
    text: `Your OTP is ${otp}`,
    html: `<h1>Your OTP is ${otp}</h1>`,
  };

  return await sgMail.send(msg);
};

module.exports = sendOTPEmail;