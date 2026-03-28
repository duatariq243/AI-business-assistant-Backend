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

        let user = await pool.query(
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

        if (user.rows.length === 0) {
          user = await pool.query(
            "INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING *",
            [name, email, null]
          );
        }

        return done(null, user.rows[0]);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;