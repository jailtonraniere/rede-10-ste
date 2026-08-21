import { describe, expect, it } from "vitest";
import {
  officialAccessUrl,
  temporaryAccessMessage,
  temporaryAccessWhatsAppUrl,
} from "./accessShare";

const access = { username:"maria.silva", password:"R10-temporaria!" };

describe("temporaryAccessMessage", () => {
  it("inclui endereço oficial, login e senha temporária para a equipe", () => {
    const message = temporaryAccessMessage(access, "equipe");

    expect(message).toContain("acesso à equipe da Rede 10");
    expect(message).toContain(`Endereço: ${officialAccessUrl}`);
    expect(message).toContain("Login: maria.silva");
    expect(message).toContain("Senha temporária: R10-temporaria!");
  });

  it("identifica o acesso de liderança e gera um compartilhamento válido", () => {
    const message = temporaryAccessMessage(access, "lideranca");
    const url = temporaryAccessWhatsAppUrl(access, "lideranca");

    expect(message).toContain("acesso de liderança à Rede 10");
    expect(decodeURIComponent(url.replace("https://wa.me/?text=", ""))).toBe(message);
  });
});
