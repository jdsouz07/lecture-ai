const { WebSocketServer } = require("ws");
const { createClient } = require("@deepgram/sdk");
const fs = require("fs");
require("dotenv").config();

const wss = new WebSocketServer({ port: 3001 });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

wss.on("connection", (ws) => {
  console.log("Student connected to recorder");
  
  // 1. Open a "Live" connection to Deepgram
  const dgConnection = deepgram.listen.live({
    model: "nova-2",
    smart_format: true,
    interim_results: true, // This is the secret to 0.5s speed
    language: "en-US",
  });

  // 2. When Deepgram sends text back, push it to your frontend
  dgConnection.on("transcript", (data) => {
    // Log EVERYTHING from Deepgram to see if it's even talking
    console.log("DG Raw Data:", JSON.stringify(data));

    const transcript = data.channel.alternatives[0].transcript;
    
    // REMOVE 'data.is_final' for a second just to see if ANY words come through
    if (transcript) {
      console.log("Deepgram sent words:", transcript);
      ws.send(JSON.stringify({ type: "transcript", text: transcript }));
    }
  });

  ws.on("message", (data) => {
    // 3. Stream the raw audio data directly to Deepgram
    if (dgConnection.getReadyState() === 1) {
      dgConnection.send(data);
    }
  });

  ws.on("close", () => {
    dgConnection.finish();
    console.log("Session ended");
  });

  dgConnection.on("error", (err) => console.error("Deepgram Error:", err));
});

console.log("WebSocket server running on ws://localhost:3001");