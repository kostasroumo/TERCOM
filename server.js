import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler as adminUsersHandler } from './netlify/functions/admin-users.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleFunctionRoute(req, requestUrl) {
  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "GET")
    ? await readRequestBody(req)
    : "";

  const event = {
    httpMethod: req.method || "GET",
    headers: req.headers,
    body,
    rawUrl: requestUrl.toString(),
    path: requestUrl.pathname,
    queryStringParameters: Object.fromEntries(requestUrl.searchParams.entries())
  };

  if (requestUrl.pathname === "/.netlify/functions/admin-users") {
    return adminUsersHandler(event);
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/.netlify/functions/public-config") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(
      JSON.stringify({
        supabaseUrl: process.env.SUPABASE_URL || "",
        supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || ""
      })
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/.netlify/functions/")) {
    const functionResponse = await handleFunctionRoute(req, requestUrl);

    if (functionResponse) {
      res.writeHead(functionResponse.statusCode || 200, functionResponse.headers || {
        "Content-Type": "application/json; charset=utf-8"
      });
      res.end(functionResponse.body || "");
      return;
    }
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rootDir, normalizedPath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    filePath = path.join(rootDir, "index.html");
  }

  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log(`Field Operations prototype running at http://${host}:${port}`);
});
