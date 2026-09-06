import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      suspended?: boolean;
      bio?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "USER" | "ADMIN";
    bio?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
    suspended?: boolean;
    sessionRevision?: number;
    revisionCheckedAt?: number;
    bio?: string;
  }
}
