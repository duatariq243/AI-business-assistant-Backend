const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passport = require("passport");

// normal auth
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOTP);


router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  authController.googleLoginSuccess
);

module.exports = router;