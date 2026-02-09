"use client"; // test comment

import React, { useRef, useState } from "react";

export default function RecordPage() {
  // --- CLEANED UP STATES ---
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const [liveText, setLiveText] = useState<string>("");
  const [chunkStatus, setChunkStatus] = useState<string>("");
  const [simpleSummary, setSimpleSummary] = useState<string>(""); // For Gemini's output
  const [lastSummaryIndex, setLastSummaryIndex] = useState(0); // Tracks what Gemini has read

  // --- REFS ---
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rollingBlobsRef = useRef<Blob[]>([]);
  const transcribeTimerRef = useRef<number | null>(null);

  // --- CONSTANTS ---
  const TIMESLICE_MS = 250; // Dropped to 250 for faster feel
  const TRANSCRIBE_EVERY_MS = 10000; // Updated to 10s per your request
  const OVERLAP_MS = 2000; // keep ~2s overlap to reduce cut words at boundaries

  async function transcribeRollingChunk() {
    // Build a chunk blob from whatever is currently buffered
    const blobs = rollingBlobsRef.current;
    if (!blobs.length) return;

    // Create one blob. This matches what MediaRecorder produces (webm/opus).
    const chunkBlob = new Blob(blobs, { type: "audio/webm;codecs=opus" });

    // Keep overlap so we don’t cut words between chunks
    const keepCount = Math.max(1, Math.round(OVERLAP_MS / TIMESLICE_MS));
    rollingBlobsRef.current = blobs.slice(-keepCount);

    setChunkStatus("Transcribing chunk...");

    try {
      const form = new FormData();
      form.append("file", chunkBlob, `chunk-${Date.now()}.webm`);

      const res = await fetch("/api/transcribe-chunk", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { text?: string };
      const text = (data.text || "").trim();
      if (text) {
        // Append with a space (simple MVP). Later you can do smarter stitching.
        setLiveText((prev) => (prev ? `${prev} ${text}` : text));
      }

      setChunkStatus("✅ Chunk transcribed");
    } catch (e: any) {
      console.error(e);
      setChunkStatus("⚠️ Chunk transcription failed (see console)");
    }
  }

  async function start() {
    setStatus("Requesting mic...");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    setStatus("Connecting WS...");
    const ws = new WebSocket("ws://localhost:3001");
    ws.binaryType = "arraybuffer";

    ws.onopen = () => setStatus("Recording...");
    ws.onerror = () => setStatus("WebSocket error");
    ws.onclose = () => setStatus("WS closed");

    wsRef.current = ws;

    // Inside your start() function, right after wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // This matches the { type: "transcript", text: "..." } from your server
        if (data.type === "transcript") {
          setLiveText((prev) => (prev ? `${prev} ${data.text}` : data.text));
          
          // AUTO-SCROLL: Keep the latest text in view
          const box = document.getElementById("transcript-box");
          if (box) {
            box.scrollTop = box.scrollHeight;
          }
        }
      } catch (e) {
        console.error("Error receiving transcript:", e);
      }
    };

    // Reset transcript + buffers when starting
    setLiveText("");
    setChunkStatus("");
    rollingBlobsRef.current = [];

    const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = async (e) => {
      if (e.data.size <= 0) return;

      // 1) Feed the rolling buffer for near-real-time transcription
      rollingBlobsRef.current.push(e.data);

      // 2) Also stream to your WS server to save the full recording
      const wsNow = wsRef.current;
      if (wsNow && wsNow.readyState === WebSocket.OPEN) {
        wsNow.send(await e.data.arrayBuffer());
      }
    };

    // Look for where you call mr.start()
    // Change it from mr.start() to:
    mr.start(250); // This forces a chunk every 250ms

    // Kick off periodic chunk transcription
    if (transcribeTimerRef.current) {
      window.clearInterval(transcribeTimerRef.current);
    }
    transcribeTimerRef.current = window.setInterval(() => {
      // Only transcribe while actively recording
      if (mediaRecorderRef.current?.state === "recording") {
        void transcribeRollingChunk();
      }
    }, TRANSCRIBE_EVERY_MS);

    setRecording(true);
  }

  async function stop() {
    // Stop periodic transcription timer
    if (transcribeTimerRef.current) {
      window.clearInterval(transcribeTimerRef.current);
      transcribeTimerRef.current = null;
    }

    // Stop recorder
    mediaRecorderRef.current?.stop();

    // Stop mic
    streamRef.current?.getTracks().forEach((t) => t.stop());

    // Close WS (this finalizes the full saved file on your ws-server)
    wsRef.current?.close();

    setRecording(false);
    setStatus("Stopped");

    // Do one last chunk transcription to catch the tail end
    await transcribeRollingChunk();
  }


  return (
    <main style={{ padding: 24, maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#3b82f6" }}>Lecture AI</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>Status: <strong>{status}</strong></p>
        </div>
        
        {!recording ? (
          <button onClick={start} style={{ padding: "12px 24px", borderRadius: "8px", backgroundColor: "#2563eb", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Start Learning
          </button>
        ) : (
          <button onClick={stop} style={{ padding: "12px 24px", borderRadius: "8px", backgroundColor: "#dc2626", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Stop Session
          </button>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* LEFT COLUMN: The Fast Raw Text from Deepgram */}
        <section>
          <h3 style={{ marginBottom: 12 }}>Live Lecture Feed</h3>
          <div 
            id="transcript-box"
            style={{ 
              background: "#111", 
              color: "#aaa", 
              padding: 16, 
              borderRadius: 12, 
              height: "400px", 
              overflowY: "auto", 
              fontSize: "14px", 
              lineHeight: "1.6" 
            }}
          >
            {liveText || "Waiting for teacher to speak..."}
          </div>
        </section>

        {/* RIGHT COLUMN: The AI "Simple Mode" from Gemini */}
        <section>
          <h3 style={{ marginBottom: 12, color: "#3b82f6" }}>✨ Simple Mode (Real-Time Help)</h3>
          <div style={{ 
            background: "#eff6ff", 
            color: "#1e40af", 
            padding: 20, 
            borderRadius: 12, 
            height: "400px", 
            overflowY: "auto", 
            border: "2px solid #bfdbfe", 
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" 
          }}>
            {chunkStatus === "Transcribing chunk..." ? (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>AI is thinking...</p>
            ) : (
              <div style={{ fontSize: "16px", fontWeight: "500", whiteSpace: "pre-wrap" }}>
                {simpleSummary || "Summaries will appear here every 30 seconds..."}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ASK A QUESTION BOX */}
      <footer style={{ marginTop: 24 }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input 
            type="text" 
            placeholder="Confused? Ask a specific question here..." 
            style={{ flex: 1, padding: "16px", borderRadius: "12px", border: "1px solid #ddd", fontSize: "16px" }}
          />
          <button 
            onClick={() => setLiveText("")} 
            style={{ padding: "0 20px", borderRadius: "12px", background: "#64748b", color: "white", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      </footer>
    </main>
  );
}