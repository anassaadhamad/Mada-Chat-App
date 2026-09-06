import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return NextResponse.json({ publicKey: null }, { status: 200 });
  }
  return NextResponse.json({ publicKey });
}
