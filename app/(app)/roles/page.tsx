import { redirect } from "next/navigation";
import { RolesManager } from "@/components/roles-manager";
import { getCurrentUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes(PERMISSIONS.USERS_MANAGE)) redirect("/dashboard");
  return <RolesManager />;
}
