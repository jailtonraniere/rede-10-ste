import type { Member, Role } from "../types";

export type TeamManagedFields = Pick<
  Member,
  "role" | "isTeamMember" | "parentId" | "needsCandidateMeeting" | "estimatedCapacity" | "agreedGoal"
>;

export const newPersonTeamFields = {
  role: "participante",
  isTeamMember: false,
} as const satisfies Pick<TeamManagedFields, "role" | "isTeamMember">;

const currentTeamFields = (member: Member): TeamManagedFields => ({
  role: member.role,
  isTeamMember: member.isTeamMember,
  parentId: member.parentId,
  needsCandidateMeeting: member.needsCandidateMeeting,
  estimatedCapacity: member.estimatedCapacity,
  agreedGoal: member.agreedGoal,
});

export function resolveTeamManagedFields(
  member: Member,
  requesterRole: Role | undefined,
  requested: TeamManagedFields,
): TeamManagedFields {
  return requesterRole === "administrador" ? requested : currentTeamFields(member);
}
