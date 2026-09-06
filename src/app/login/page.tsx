import { LoginView } from "./login-view";

export default function LoginPage() {
  const oAuth = {
    github: !!(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  };

  return <LoginView oAuth={oAuth} />;
}
