const { WebSocketServer } = require("ws");
const fs = require("fs");

const wss = new WebSocketServer({ port: 3001 });
console.log("WebSocket server running on ws://localhost:3001");

wss.on("connection", (ws) => {
  const file = fs.createWriteStream(`recording-${Date.now()}.webm`);

  ws.on("message", (data) => {
    file.write(data);
  });

  ws.on("close", () => {
    file.end();
    console.log("Recording saved");
  });
});