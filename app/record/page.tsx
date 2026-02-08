"use client";

import React, { useRef, useState } from "react";

export default function RecordPage() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const [liveText, setLiveText] = useState<string>("");
  const [chunkStatus, setChunkStatus] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Rolling buffer of recent audio blobs (for near-real-time chunk transcription)
  const rollingBlobsRef = useRef<Blob[]>([]);
  const transcribeTimerRef = useRef<number | null>(null);

  const TIMESLICE_MS = 500; // must match mr.start(...)
  const TRANSCRIBE_EVERY_MS = 15000; // 15s updates feel "live"
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

    mr.start(TIMESLICE_MS); // every 500ms we get a blob

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
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Near-real-time Recording</h1>
      <p>Status: {status}</p>
      <p style={{ opacity: 0.8 }}>{chunkStatus}</p>

      {!recording ? (
        <button onClick={start}>Start</button>
      ) : (
        <button onClick={stop}>Stop</button>
      )}

      <hr style={{ margin: "24px 0" }} />

      <h2>Live transcript (updates ~every 15s)</h2>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#111",
          color: "#eee",
          padding: 16,
          borderRadius: 8,
          minHeight: 160,
        }}
      >
        {liveText || "(no text yet)"}
      </pre>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Tip: This is an MVP approach. After you stop, you can run a single full-file
        transcription for the best final accuracy.
      </p>
    </main>
  );
}