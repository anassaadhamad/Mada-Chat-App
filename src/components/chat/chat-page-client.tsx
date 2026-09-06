"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";

function ChatRouteLoading() {
  const { t } = useI18n();
  return (
    <div className="bg-background text-muted-foreground flex min-h-[100dvh] items-center justify-center text-sm">
      {t("common.loading")}
    </div>
  );
}

const ChatShell = dynamic(
  () => import("@/components/chat/chat-shell").then((m) => ({ default: m.ChatShell })),
  {
    ssr: false,
    loading: () => <ChatRouteLoading />,
  }
);

type ChatPageClientProps = {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userImage?: string | null;
  zegoCallsEnabled?: boolean;
};

function ChatPageWithSearchParams(props: ChatPageClientProps) {
  const searchParams = useSearchParams();
  const raw = searchParams.get("c")?.trim();
  const initialConversationId =
    raw && /^[a-f\d]{24}$/i.test(raw) ? raw : null;

  return (
    <ChatShell
      userId={props.userId}
      userName={props.userName}
      userEmail={props.userEmail}
      userImage={props.userImage ?? null}
      initialConversationId={initialConversationId}
      zegoCallsEnabled={props.zegoCallsEnabled ?? false}
    />
  );
}

export function ChatPageClient(props: ChatPageClientProps) {
  return (
    <Suspense fallback={<ChatRouteLoading />}>
      <ChatPageWithSearchParams key={props.userId} {...props} />
    </Suspense>
  );
}
