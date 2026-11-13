// Local webhook receiver for exercising HookLab end-to-end.
// Counts every request it receives so duplicate deliveries are visible.
// Deliberately standalone: no dependencies, not part of the app.
//
//   node examples/local-receiver.mjs        # listens on 127.0.0.1:4040
//   RECEIVER_PORT=5050 node examples/local-receiver.mjs

import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.RECEIVER_PORT ?? 4040);
let received = 0;

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    received += 1;
    const body = Buffer.concat(chunks);
    console.log(
      `#${received} ${req.method} ${req.url} — ${body.length} bytes, content-type=${req.headers["content-type"] ?? "-"}`,
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received }));
  });
});

server.listen(port, host, () => {
  console.log(`receiver listening on http://${host}:${port}`);
  console.log("every request is counted; point HookLab at http://127.0.0.1:4040/hook");
});
