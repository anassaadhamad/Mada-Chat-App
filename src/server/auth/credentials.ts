import { compare } from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

function asCredentialString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value == null) return undefined;
  return String(value);
}

export async function authorizeCredentials(
  email: unknown,
  password: unknown
): Promise<{
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  bio: string;
  role: "USER" | "ADMIN";
} | null> {
  const e = asCredentialString(email)?.trim().toLowerCase();
  const p = asCredentialString(password);
  if (!e || !p) {
    return null;
  }

  try {
    await connectDB();
  } catch (err) {
    console.error("[auth] MongoDB unavailable during credentials login:", err);
    return null;
  }

  try {
    const user = await User.findOne({ email: e }).select("+passwordHash suspendedAt deletedAt bio name image");

    if (!user) {
      return null;
    }

    if (!user.passwordHash) {
      console.warn(
        "[auth] User has no password (likely OAuth-only). Email:",
        e.slice(0, 3) + "…"
      );
      return null;
    }

    const hash = user.passwordHash;
    if (typeof hash !== "string" || hash.length !== 60) {
      console.error("[auth] Stored password hash has unexpected length:", hash?.length);
      return null;
    }

    const ok = await compare(p, hash);
    if (!ok) {
      return null;
    }

    if (user.suspendedAt) {
      return null;
    }

    if (user.deletedAt) {
      return null;
    }

    const role = user.role === "ADMIN" ? "ADMIN" : "USER";

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      bio: typeof user.bio === "string" ? user.bio : "",
      role,
    };
  } catch (err) {
    console.error("[auth] credentials authorize error:", err);
    return null;
  }
}
