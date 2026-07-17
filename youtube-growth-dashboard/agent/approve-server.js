const http = require("http");
const url = require("url");
const { loadConfig, log } = require("./lib");
const { approveAndPublish } = require("./publish");

const PORT = process.env.PORT || 8934;

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const match = parsed.pathname.match(/^\/approve\/([^/]+)$/);

  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found.");
    return;
  }

  const videoId = match[1];
  const token = parsed.query.token;

  if (!token) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing token.");
    return;
  }

  try {
    const { entry, results } = await approveAndPublish(videoId, { expectedToken: token });
    log("Approved via web:", videoId);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html><body style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center;">
        <h2>Published</h2>
        <p>"${escapeHtml(entry.title)}" is now public.</p>
        <p><a href="${entry.watchUrl}">${entry.watchUrl}</a></p>
        <p>Facebook: ${results.facebook || "not configured"}</p>
        <p>Instagram: ${results.instagram || "not configured"}</p>
      </body></html>
    `);
  } catch (err) {
    log("Approve request failed:", err.message || err);
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end(`
      <html><body style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center;">
        <h2>Could not approve</h2>
        <p>${escapeHtml(err.message || String(err))}</p>
      </body></html>
    `);
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (require.main === module) {
  loadConfig(); // fail fast if config.json is missing/invalid
  server.listen(PORT, () => {
    log(`Approve server listening on port ${PORT}. Each pending video's email link points here.`);
  });
}

module.exports = { server };
