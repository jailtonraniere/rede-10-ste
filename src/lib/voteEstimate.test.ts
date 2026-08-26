import { describe, expect, it } from "vitest";
import type { Member } from "../types";
import { parseEstimatedVotes, summarizeVoteEstimates } from "./voteEstimate";

const member = (input: Partial<Member> & Pick<Member, "id">): Member => {
  const { id, ...overrides } = input;
  return {
    id,
    nome: "Pessoa",
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

describe("voteEstimate", () => {
  it("aceita inteiro positivo e mantém o campo opcional", () => {
    expect(parseEstimatedVotes("12")).toBe(12);
    expect(parseEstimatedVotes("")).toBeUndefined();
    expect(parseEstimatedVotes("0")).toBeUndefined();
    expect(parseEstimatedVotes("1.5")).toBeUndefined();
  });

  it("resume somente cadastros válidos sem alterar os registros", () => {
    const data = [
      member({ id: "one", estimatedVotes: 8 }),
      member({ id: "two" }),
      member({ id: "duplicate", estimatedVotes: 20, registrationStatus: "duplicado" }),
      member({ id: "inactive", estimatedVotes: 10, status: "inativo" }),
    ];

    expect(summarizeVoteEstimates(data)).toEqual({
      total: 8,
      withEstimate: 1,
      withoutEstimate: 1,
    });
    expect(data[0].estimatedVotes).toBe(8);
  });
});
