import type { Member } from "../types";

const excludedStatuses = new Set<Member["status"]>(["inativo", "desligado", "bloqueado"]);

export function parseEstimatedVotes(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function summarizeVoteEstimates(data: Member[]) {
  const eligible = data.filter((member) =>
    member.registrationStatus !== "duplicado" && !excludedStatuses.has(member.status)
  );
  const withEstimate = eligible.filter((member) =>
    member.estimatedVotes != null
    && Number.isInteger(member.estimatedVotes)
    && member.estimatedVotes > 0
  );
  return {
    total: withEstimate.reduce((sum, member) => sum + Number(member.estimatedVotes), 0),
    withEstimate: withEstimate.length,
    withoutEstimate: eligible.length - withEstimate.length,
  };
}
