const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly";
const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_PATH = path.join(__dirname, "config.example.json");

function readArgs() {
  const clientId = process.argv[2];
  const clientSecret = process.argv[3];
  if (!clientId || !clientSecret) {
    console.error("Usage: node auth.js <clientId> <clientSecret>");
    console.error("Create an OAuth 2.0 Client ID of type 'Desktop app' in the Google Cloud Console first.");
    process.exit(1);
  }
  return { clientId, clientSecret };
}

async function main() {
  const { clientId, clientSecret } = readArgs();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("\nOpen this URL in a browser on this machine and sign in with the Google account for your channel:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for you to complete sign-in...\n");

  const code = await waitForAuthCode();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("Token exchange failed:", tokenData);
    process.exit(1);
  }
  if (!tokenData.refresh_token) {
    console.error(
      "Google didn't return a refresh token. This usually means you've already authorized this app before — " +
        "revoke access at https://myaccount.google.com/permissions and run this again."
    );
    process.exit(1);
  }

  const config = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
    : JSON.parse(fs.readFileSync(EXAMPLE_PATH, "utf8"));

  config.youtube = {
    clientId,
    clientSecret,
    refreshToken: tokenData.refresh_token,
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Saved refresh token to ${CONFIG_PATH}. You can now run agent.js.`);
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.setHeader("Content-Type", "text/html");
      if (error) {
        res.end(`<p>Authorization failed: ${error}. You can close this tab.</p>`);
        server.close();
        reject(new Error(`Google returned an error: ${error}`));
        return;
      }
      if (!code) {
        res.end("<p>No code received.</p>");
        return;
      }
      res.end("<p>Signed in. You can close this tab and go back to the terminal.</p>");
      server.close();
      resolve(code);
    });
    server.listen(PORT);
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
