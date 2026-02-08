"use client";

export default function UploadPage() {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    console.log(data);
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Upload Lecture</h1>
      <p>Select an audio file to upload.</p>

      <form onSubmit={handleSubmit}>
        <input type="file" name="file" accept="audio/*" required />
        <br /><br />
        <button type="submit">Upload</button>
      </form>
    </main>
  );
}