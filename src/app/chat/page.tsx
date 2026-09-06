import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ChatPageClient } from "@/components/chat/chat-page-client";
import { envZegoCallsConfigured } from "@/lib/env-server";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <ChatPageClient
      userId={session.user.id}
      userName={session.user.name ?? null}
      userEmail={session.user.email ?? null}
      userImage={session.user.image ?? null}
      zegoCallsEnabled={envZegoCallsConfigured()}
    />
  );
}
