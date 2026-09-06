import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings · Mada",
  description: "Language, appearance, and account",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
