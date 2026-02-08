import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file) {
    return NextResponse.json(
      { error: "No file uploaded" },
      { status: 400 }
    );
  }

  // TEMP: just confirm we received it
  console.log("Received file:", (file as File).name);

  return NextResponse.json({ success: true });
}