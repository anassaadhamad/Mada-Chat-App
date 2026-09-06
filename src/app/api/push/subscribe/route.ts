import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { locales, type Locale } from "@/i18n/config";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

export async function POST(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const subscription = (body as { subscription?: unknown }).subscription;
  const localeRaw = (body as { locale?: unknown }).locale;
  const locale: Locale = isLocale(localeRaw) ? localeRaw : "en";

  if (!subscription || typeof subscription !== "object") {
    return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
  }

  const endpoint = String((subscription as { endpoint?: unknown }).endpoint ?? "").trim();
  const keys = (subscription as { keys?: unknown }).keys;
  if (!endpoint || !keys || typeof keys !== "object") {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const p256dh = String((keys as { p256dh?: unknown }).p256dh ?? "").trim();
  const authKey = String((keys as { auth?: unknown }).auth ?? "").trim();
  if (!p256dh || !authKey) {
    return NextResponse.json({ error: "Invalid subscription keys" }, { status: 400 });
  }

  try {
    await connectDB();
    await User.updateOne(
      { _id: userId },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    await User.updateOne(
      { _id: userId },
      {
        $push: {
          pushSubscriptions: {
            endpoint,
            p256dh,
            auth: authKey,
            locale,
          },
        },
      }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
