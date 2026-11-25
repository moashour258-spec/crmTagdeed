import { LoginForm } from "@/components/auth/login-form";
import { hasPublicEnv } from "@/lib/env";

export default function LoginPage() {
  return <LoginForm configured={hasPublicEnv()} />;
}
