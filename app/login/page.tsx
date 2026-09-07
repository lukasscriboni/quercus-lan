import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <LoginScreen />;
}
