import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
async function syncOAuthUser(
  email: string,
  name: string | null | undefined,
  image: string | null | undefined
): Promise<string> {
  const { connectDB } = await import("@/lib/mongodb");
  const { User } = await import("@/server/models/User");
  await connectDB();

  const doc = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        name: name ?? undefined,
        image: image ?? undefined,
      },
      $setOnInsert: { email: email.toLowerCase(), role: "USER" },
    },
    { upsert: true, new: true }
  );

  return doc._id.toString();
}

const config = {
  ...authConfig,
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { authorizeCredentials } = await import("@/server/auth/credentials");
        return authorizeCredentials(credentials?.email, credentials?.password);
      },
    }),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
          }),
        ]
      : []),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, trigger, session }) {
      const { connectDB } = await import("@/lib/mongodb");
      const { User } = await import("@/server/models/User");
      const REVISION_CHECK_MS = 60_000;

      if (trigger === "update" && session?.user) {
        const su = session.user as {
          name?: string | null;
          email?: string | null;
          image?: string | null;
          bio?: string | null;
        };
        if (su.name !== undefined) token.name = su.name ?? undefined;
        if (su.email !== undefined) token.email = (su.email ?? undefined) as string | undefined;
        if (su.image !== undefined) {
          const im = su.image;
          token.picture = im == null || im === "" ? undefined : String(im);
        }
        if (su.bio !== undefined) token.bio = typeof su.bio === "string" ? su.bio : "";
      }

      if (user) {
        if (account?.provider === "credentials") {
          token.id = user.id ?? token.sub;
          token.role = (user as { role?: "USER" | "ADMIN" }).role ?? "USER";
          token.suspended = false;
          const cred = user as { bio?: string | null; image?: string | null; name?: string | null };
          token.bio = typeof cred.bio === "string" ? cred.bio : "";
          token.picture = cred.image ? String(cred.image) : undefined;
          if (cred.name !== undefined && cred.name !== null) token.name = cred.name ?? undefined;
        } else if (account && user.email) {
          token.id = await syncOAuthUser(user.email, user.name, user.image ?? null);
          await connectDB();
          const u = await User.findById(token.id).select("role suspendedAt bio name image").lean();
          token.role = u?.role === "ADMIN" ? "ADMIN" : "USER";
          token.suspended = !!u?.suspendedAt;
          token.bio = typeof u?.bio === "string" ? u.bio : "";
          token.name = (u?.name ?? user.name) ?? undefined;
          const img = u?.image ?? user.image ?? null;
          token.picture = img && String(img).trim() !== "" ? String(img) : undefined;
        } else if (user.id) {
          token.id = user.id;
        }
      }

      if (token.id && !token.role) {
        await connectDB();
        const u = await User.findById(token.id as string).select("role suspendedAt bio name image").lean();
        token.role = u?.role === "ADMIN" ? "ADMIN" : "USER";
        token.suspended = !!u?.suspendedAt;
        token.bio = typeof u?.bio === "string" ? u.bio : "";
        if (u?.name !== undefined) token.name = u.name ?? undefined;
        const img = u?.image;
        if (img !== undefined) {
          token.picture = img && String(img).trim() !== "" ? String(img) : undefined;
        }
      }

      if (token.id) {
        const now = Date.now();
        const last = (token.revisionCheckedAt as number) ?? 0;
        const shouldCheck =
          Boolean(user) ||
          trigger === "update" ||
          now - last > REVISION_CHECK_MS ||
          token.sessionRevision === undefined;
        if (shouldCheck) {
          await connectDB();
          const u = await User.findById(token.id as string)
            .select("sessionRevision deletedAt suspendedAt role bio name image")
            .lean();
          token.revisionCheckedAt = now;
          if (!u || u.deletedAt) {
            return null;
          }
          if ((u.sessionRevision ?? 0) !== (token.sessionRevision ?? 0)) {
            return null;
          }
          token.sessionRevision = u.sessionRevision ?? 0;
          token.suspended = !!u.suspendedAt;
          token.role = u?.role === "ADMIN" ? "ADMIN" : "USER";
          token.bio = typeof u.bio === "string" ? u.bio : "";
          token.name = u.name ?? undefined;
          const im = u.image;
          token.picture = im && String(im).trim() !== "" ? String(im) : undefined;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
        session.user.suspended = !!token.suspended;
        session.user.bio = typeof token.bio === "string" ? token.bio : "";
        const pic = token.picture;
        session.user.image =
          pic != null && String(pic).trim() !== "" ? String(pic) : null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
