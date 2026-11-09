import type { ReportedActivity } from "../../../contract/generated/reportedActivity";

export function activityBadge(
  activity: ReportedActivity | undefined,
  unavailable?: string | null,
): { label: string; hint: string } {
  const hint =
    activity?.reason || unavailable || "No program status has been reported.";
  if (!activity || activity.state === "unknown")
    return {
      label:
        (activity?.reported === false &&
          activity.reason === "No status was reported") ||
        (!activity && !unavailable)
          ? ""
          : "Status unavailable",
      hint,
    };
  return {
    label: activity.state[0].toUpperCase() + activity.state.slice(1),
    hint: `Program-reported ${activity.state}. This is not a verified task result.`,
  };
}
