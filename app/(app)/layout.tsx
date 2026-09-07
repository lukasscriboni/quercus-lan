import { ProtectedAppShell } from "@/components/protected-app-shell";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
