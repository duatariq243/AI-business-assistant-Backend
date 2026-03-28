const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const pool = require("../db");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        // 1. check user
        let user = await pool.query(
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

        // 2. if NOT exists → create user
        if (user.rows.length === 0) {
          const newUser = await pool.query(
            `INSERT INTO users (name, email, provider, is_verified)
             VALUES ($1, $2, 'google', true)
             RETURNING *`,
            [name, email]
          );

          return done(null, newUser.rows[0]);
        }

        // 3. if exists → FORCE update Google settings
        const updatedUser = await pool.query(
          `UPDATE users 
           SET provider = 'google', is_verified = true 
           WHERE email = $1
           RETURNING *`,
          [email]
        );

        return done(null, updatedUser.rows[0]);

      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;