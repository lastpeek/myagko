import http from "node:http";

const port = 3210;
const requests = [];
let failSend = false;

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/fail-send")) {
    failSend = request.url.includes("value=1");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, failSend }));
    return;
  }

  if (request.method === "GET" && request.url === "/requests") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(requests));
    return;
  }

  if (request.method === "DELETE" && request.url === "/requests") {
    requests.length = 0;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/bot")) {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      let parsed = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        parsed = body;
      }
      requests.push({ url: request.url, body: parsed });
      const isSend = request.url.includes("/sendMessage");
      if (isSend && failSend) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, description: "forced error" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: true }));
    });
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`telegram mock on http://127.0.0.1:${port}`);
});
