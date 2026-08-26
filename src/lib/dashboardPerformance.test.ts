import { describe, expect, it } from "vitest";
import type { Member } from "../types";
import {
  buildResponsiblePerformance,
  filterResponsiblePerformance,
  type AccessUserSummary,
} from "./dashboardPerformance";

const member = (input: Partial<Member> & Pick<Member, "id" | "nome">): Member => {
  const { id, nome, ...overrides } = input;
  return {
    id,
    nome,
    telefone: "81999999999",
    bairro: "Centro",
    municipio: "Recife",
    status: "cadastrado",
    role: "participante",
    joinedAt: "2026-08-01",
    lastActivity: "2026-08-01",
    inviteCode: "TESTE",
    ...overrides,
  };
};

describe("dashboardPerformance", () => {
  it("mantém equipe sem acesso, autoria histórica e registros sem autoria separados", () => {
    const data = [
      member({ id: "team-1", nome: "Líder atual", role: "lideranca", isTeamMember: true }),
      member({ id: "team-2", nome: "Equipe sem acesso", role: "cadastrador", isTeamMember: true }),
      member({ id: "record-1", nome: "Cadastro 1", createdByProfileId: "profile-1", createdByName: "Líder atual", createdByRole: "administrador" }),
      member({ id: "record-2", nome: "Cadastro 2", createdByProfileId: "profile-old", createdByName: "Responsável histórico", createdByRole: "cadastrador" }),
      member({ id: "record-3", nome: "Importado sem autoria" }),
    ];
    const accessUsers: AccessUserSummary[] = [{
      id: "profile-1",
      memberId: "team-1",
      name: "Líder atual",
      role: "administrador",
      memberRole: "lideranca",
      status: "cadastrado",
      isTeamMember: true,
    }];

    const result = buildResponsiblePerformance(data, accessUsers);
    const current = result.rows.find((row) => row.profileId === "profile-1");
    const withoutAccess = result.rows.find((row) => row.memberId === "team-2");
    const historical = result.rows.find((row) => row.profileId === "profile-old");

    expect(current).toMatchObject({ total: 1, operationalRole: "lideranca", accessRole: "administrador", accessState: "ativo" });
    expect(withoutAccess).toMatchObject({ total: 0, accessState: "sem_acesso", isCurrentTeam: true });
    expect(historical).toMatchObject({ total: 1, accessState: "historico", isCurrentTeam: false });
    expect(result).toMatchObject({ attributedTotal: 2, unattributedTotal: 3 });
  });

  it("não mescla responsáveis diferentes apenas porque possuem o mesmo nome", () => {
    const data = [
      member({ id: "one", nome: "Um", createdByProfileId: "profile-a", createdByName: "Mesmo Nome" }),
      member({ id: "two", nome: "Dois", createdByProfileId: "profile-b", createdByName: "Mesmo Nome" }),
    ];

    const result = buildResponsiblePerformance(data);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.profileId)).toEqual(expect.arrayContaining(["profile-a", "profile-b"]));
  });

  it("aplica filtros independentes para equipe, histórico e ausência de acesso", () => {
    const rows = buildResponsiblePerformance([
      member({ id: "team", nome: "Equipe", isTeamMember: true }),
      member({ id: "old-record", nome: "Antigo", createdByProfileId: "old", createdByName: "Histórico" }),
    ]).rows;

    expect(filterResponsiblePerformance(rows, "equipe", "nome").map((row) => row.name)).toEqual(["Equipe"]);
    expect(filterResponsiblePerformance(rows, "historicos", "nome").map((row) => row.name)).toEqual(["Histórico"]);
    expect(filterResponsiblePerformance(rows, "sem_acesso", "nome")).toHaveLength(2);
  });
});
