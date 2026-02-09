const { WebSocketServer } = require("ws");
const { createClient } = require("@deepgram/sdk");
require("dotenv").config();

const wss = new WebSocketServer({ port: 3001 });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

wss.on("connection", (ws) => {
  console.log("--- BROWSER CONNECTED ---");

  const dgConnection = deepgram.listen.live({
    model: "nova-2",
    smart_format: true,
    interim_results: true,
    language: "en-US",
    encoding: "opus",      // Matches MediaRecorder default
    sample_rate: 48000,    // Standard browser sample rate
  });

  // Add this log to see if the "Brain" actually connects
  dgConnection.on("open", () => {
    console.log("✅ Deepgram is connected and listening!");
  });

  dgConnection.on("error", (err) => {
    console.error("❌ Deepgram Error:", err);
  });

  dgConnection.on("open", () => {
    console.log("✅ DEEPGRAM IS READY");
  });

  dgConnection.on("transcript", (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript) {
      console.log("Deepgram sent:", transcript);
      ws.send(JSON.stringify({ type: "transcript", text: transcript }));
    }
  });

  dgConnection.on("error", (err) => console.error("❌ DEEPGRAM ERROR:", err));

  ws.on("message", (message) => {
    // Convert the incoming browser blob to a Node-friendly Buffer
    const data = Buffer.from(message);
    if (dgConnection.getReadyState() === 1) {
      dgConnection.send(data);
    }
  });

  ws.on("close", () => {
    dgConnection.finish();
    console.log("--- BROWSER DISCONNECTED ---");
  });
});

console.log("WebSocket server running on ws://localhost:3001");