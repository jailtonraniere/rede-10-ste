import type { Member, Role } from "../types";

export type LeadershipOrder = "mais" | "progresso" | "nome";
export type ResponsibleOrder = "mais" | "menos" | "nome";
export type ResponsibleScope = "todos" | "equipe" | "historicos" | "sem_acesso";
export type AccessState = "ativo" | "inativo" | "sem_acesso" | "historico";

export type AccessUserSummary = {
  id: string;
  memberId: string;
  name: string;
  role: Role;
  memberRole: Role;
  status: string;
  isTeamMember: boolean;
};

export type LeadershipPerformance = {
  member: Member;
  name: string;
  total: number;
  estimatedCapacity?: number;
  agreedGoal?: number;
  target: number;
  progress: number;
};

export type ResponsiblePerformance = {
  key: string;
  profileId?: string;
  memberId?: string;
  name: string;
  total: number;
  operationalRole: Role;
  accessRole?: Role;
  accessState: AccessState;
  isCurrentTeam: boolean;
  hasAccess: boolean;
};

export type ResponsiblePerformanceResult = {
  rows: ResponsiblePerformance[];
  attributedTotal: number;
  unattributedTotal: number;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR");

export function buildLeadershipPerformance(
  data: Member[],
  order: LeadershipOrder = "mais",
): LeadershipPerformance[] {
  const directCounts = data.reduce<Map<string, number>>((counts, member) => {
    if (member.parentId) counts.set(member.parentId, (counts.get(member.parentId) ?? 0) + 1);
    return counts;
  }, new Map());

  return data
    .filter((member) => member.role === "lideranca" || member.role === "mobilizador")
    .map((member) => {
      const total = directCounts.get(member.id) ?? 0;
      const target = member.agreedGoal ?? member.estimatedCapacity ?? 0;
      return {
        member,
        name: member.nome,
        total,
        estimatedCapacity: member.estimatedCapacity,
        agreedGoal: member.agreedGoal,
        target,
        progress: target > 0 ? Math.round((total / target) * 100) : 0,
      };
    })
    .sort((a, b) => {
      if (order === "nome") return byName(a, b);
      if (order === "progresso") {
        const progressOrder = b.progress - a.progress;
        return progressOrder || b.total - a.total || byName(a, b);
      }
      return b.total - a.total || byName(a, b);
    });
}

export function buildResponsiblePerformance(
  data: Member[],
  accessUsers: AccessUserSummary[] = [],
): ResponsiblePerformanceResult {
  const membersById = new Map(data.map((member) => [member.id, member]));
  const rows = new Map<string, ResponsiblePerformance>();

  accessUsers.forEach((accessUser) => {
    const member = membersById.get(accessUser.memberId);
    const isCurrentTeam = member?.isTeamMember ?? accessUser.isTeamMember;
    const active = accessUser.status !== "bloqueado" && accessUser.status !== "inativo";
    rows.set(accessUser.id, {
      key: `profile:${accessUser.id}`,
      profileId: accessUser.id,
      memberId: accessUser.memberId,
      name: member?.nome ?? accessUser.name,
      total: 0,
      operationalRole: member?.role ?? accessUser.memberRole,
      accessRole: accessUser.role,
      accessState: active ? "ativo" : "inativo",
      isCurrentTeam,
      hasAccess: active,
    });
  });

  data.filter((member) => member.isTeamMember).forEach((member) => {
    const accessUser = accessUsers.find((item) => item.memberId === member.id);
    if (accessUser) return;
    rows.set(`member:${member.id}`, {
      key: `member:${member.id}`,
      memberId: member.id,
      name: member.nome,
      total: 0,
      operationalRole: member.role,
      accessRole: member.accessRole,
      accessState: "sem_acesso",
      isCurrentTeam: true,
      hasAccess: false,
    });
  });

  const attributedCounts = new Map<string, number>();
  let unattributedTotal = 0;
  data.forEach((member) => {
    if (!member.createdByProfileId) {
      unattributedTotal += 1;
      return;
    }
    attributedCounts.set(
      member.createdByProfileId,
      (attributedCounts.get(member.createdByProfileId) ?? 0) + 1,
    );
    if (!rows.has(member.createdByProfileId)) {
      rows.set(member.createdByProfileId, {
        key: `profile:${member.createdByProfileId}`,
        profileId: member.createdByProfileId,
        name: member.createdByName ?? "Responsável não identificado",
        total: 0,
        operationalRole: member.createdByRole ?? "cadastrador",
        accessState: "historico",
        isCurrentTeam: false,
        hasAccess: false,
      });
    }
  });

  const result = [...rows.values()].map((row) => ({
    ...row,
    total: row.profileId ? attributedCounts.get(row.profileId) ?? 0 : 0,
  }));

  return {
    rows: result,
    attributedTotal: data.length - unattributedTotal,
    unattributedTotal,
  };
}

export function filterResponsiblePerformance(
  rows: ResponsiblePerformance[],
  scope: ResponsibleScope,
  order: ResponsibleOrder,
): ResponsiblePerformance[] {
  return rows
    .filter((row) => {
      if (scope === "equipe") return row.isCurrentTeam;
      if (scope === "historicos") return !row.isCurrentTeam && row.total > 0;
      if (scope === "sem_acesso") return !row.hasAccess;
      return true;
    })
    .sort((a, b) => {
      if (order === "nome") return byName(a, b);
      const quantityOrder = order === "menos" ? a.total - b.total : b.total - a.total;
      return quantityOrder || byName(a, b);
    });
}
