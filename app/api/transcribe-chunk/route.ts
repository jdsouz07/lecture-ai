import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  return NextResponse.json({
    ok: true,
    gotFile: Boolean(file),
    type: file instanceof Blob ? file.type : typeof file,
  });
}