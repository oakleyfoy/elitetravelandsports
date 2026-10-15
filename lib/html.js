const SITE_URL = "https://elitetravelsportsusa.com";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(src) {
  return src.startsWith("https://") ? src : `${SITE_URL}${src}`;
}

function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => (key in values ? values[key] : ""));
}

function indent(html, spaces) {
  const pad = " ".repeat(spaces);
  return html
    .trim()
    .split("\n")
    .map((line, index) => (index === 0 || !line ? line : pad + line))
    .join("\n");
}

// Trip pages change with the calendar, so browsers and CDNs must revalidate instead of reusing yesterday's copy.
function sendHtml(req, res, statusCode, html) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(req.method === "HEAD" ? undefined : html);
}

function sendText(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

const SERVER_ERROR_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Temporarily unavailable | Elite Travel &amp; Sports Tours USA</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="interior-page">
    <main>
      <section class="interior-hero">
        <div class="interior-hero-inner">
          <div>
            <p class="eyebrow">Elite Travel &amp; Sports Tours USA</p>
            <h1>This page is temporarily unavailable.</h1>
            <p>
              Please try again shortly, or email
              <a href="mailto:info@elitetravelsportsusa.com">info@elitetravelsportsusa.com</a> and our team will help.
            </p>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>
`;

// Visitors get a generic page; the details go to the server log only.
function sendServerError(req, res, label, error) {
  if (error && error.name === "TripDataError") {
    console.error(`${label}: returned 500 because the trip data is invalid. Fix it and run npm test.\n${error.message}`);
  } else {
    console.error(`${label}: page render failed`);
    console.error(error);
  }
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  }
  res.end(req.method === "HEAD" ? undefined : SERVER_ERROR_PAGE);
}

function redirect(res, location) {
  res.writeHead(301, { Location: location });
  res.end();
}

function allowReadOnly(req, res) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  sendText(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  return false;
}

module.exports = {
  SITE_URL,
  escapeHtml,
  absoluteUrl,
  fillTemplate,
  indent,
  sendHtml,
  sendText,
  sendServerError,
  redirect,
  allowReadOnly,
};
