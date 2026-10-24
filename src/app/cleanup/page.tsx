import { redirect } from "next/navigation";
import { canAccess, wantsSimulation } from "./access";
import { CleanupView } from "./cleanup-view";

export const dynamic = "force-dynamic";

export default async function CleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ sim?: string }>;
}) {
  const { sim } = await searchParams;
  const simulate = wantsSimulation(sim);
  if (!(await canAccess(simulate))) redirect("/?error=expired");
  return <CleanupView simulate={simulate} />;
}
