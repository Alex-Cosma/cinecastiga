import LoginForm from "./LoginForm";
import { localPasswordOnlyLogin } from "@/lib/local-auth";

export default function LoginPage() {
  return <LoginForm twoFactorRequired={!localPasswordOnlyLogin()} />;
}
