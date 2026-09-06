import { auth } from "@/auth";
import { HomeContent } from "@/components/home/home-content";

export default async function Home() {
  const session = await auth();

  return <HomeContent isLoggedIn={!!session?.user} />;
}
