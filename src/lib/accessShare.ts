export type TemporaryAccess = {
  username: string;
  password: string;
};

export type AccessAudience = "equipe" | "lideranca";

export const officialAccessUrl = "https://www.rede10.org/";

export function temporaryAccessMessage(
  access: TemporaryAccess,
  audience: AccessAudience,
) {
  const introduction = audience === "lideranca"
    ? "Olá! Seu acesso de liderança à Rede 10 foi criado."
    : "Olá! Seu acesso à equipe da Rede 10 foi criado.";

  return [
    introduction,
    "",
    "A Rede 10 é o sistema de cadastro e organização da rede de mobilização de Ste Vilela.",
    "",
    `Endereço: ${officialAccessUrl}`,
    `Login: ${access.username}`,
    `Senha temporária: ${access.password}`,
    "",
    "No primeiro acesso, entre e altere sua senha.",
  ].join("\n");
}

export function temporaryAccessWhatsAppUrl(
  access: TemporaryAccess,
  audience: AccessAudience,
) {
  return `https://wa.me/?text=${encodeURIComponent(temporaryAccessMessage(access, audience))}`;
}
