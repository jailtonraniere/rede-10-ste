import { describe, expect, it } from "vitest";
import type { Member } from "../types";
import { newPersonTeamFields, resolveTeamManagedFields } from "./teamAdministration";

const existing: Member = {
  id: "member-1",
  nome: "Pessoa existente",
  telefone: "81999999999",
  bairro: "Centro",
  municipio: "Recife",
  status: "cadastrado",
  role: "lideranca",
  isTeamMember: true,
  parentId: "leader-1",
  needsCandidateMeeting: true,
  estimatedCapacity: 30,
  agreedGoal: 20,
  joinedAt: "2026-08-01",
  lastActivity: "2026-08-01",
  inviteCode: "TESTE",
};

const requested = {
  role: "cadastrador" as const,
  isTeamMember: false,
  parentId: undefined,
  needsCandidateMeeting: false,
  estimatedCapacity: undefined,
  agreedGoal: undefined,
};

describe("teamAdministration", () => {
  it("sempre inicia o cadastro geral como pessoa fora da equipe", () => {
    expect(newPersonTeamFields).toEqual({ role: "participante", isTeamMember: false });
  });

  it.each(["cadastrador", "lideranca", "mobilizador"] as const)(
    "preserva classificação e função quando %s edita os dados pessoais",
    (requesterRole) => {
      expect(resolveTeamManagedFields(existing, requesterRole, requested)).toEqual({
        role: "lideranca",
        isTeamMember: true,
        parentId: "leader-1",
        needsCandidateMeeting: true,
        estimatedCapacity: 30,
        agreedGoal: 20,
      });
    },
  );

  it("aceita classificação e função solicitadas por administrador", () => {
    expect(resolveTeamManagedFields(existing, "administrador", requested)).toEqual(requested);
  });
});
