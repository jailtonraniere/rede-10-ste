# Rede 10 — critérios de produção em massa

## Premissas operacionais

- Arquitetura mantida em React/Vite, Vercel e Supabase.
- O banco é a única fonte de verdade; dados de demonstração nunca são carregados quando o Supabase está configurado.
- Perfis: administrador geral, coordenador territorial, liderança, mobilizador e participante.
- Administradores operam toda a base; coordenadores ficam limitados ao território; lideranças veem apenas a própria rede.
- Exportação em massa, exclusão definitiva, mudança de território e unificação de pessoas exigem autorização administrativa e auditoria.
- Nenhum dado real entra antes do gate de piloto, da política de privacidade aprovada e da indicação dos responsáveis operacional e de privacidade.

## Responsáveis designados

| Frente | Responsável | Canal |
|---|---|---|
| Técnica | Jailton Raniere | jailtonmjc@gmail.com |
| Operacional | Ste Vilela | Coordenação interna |
| Privacidade | Gisele Meneses | jailtonmjc@gmail.com |

O canal oficial para solicitações de privacidade é `jailtonmjc@gmail.com`.

## Capacidade inicial de referência

- 20 usuários administrativos/coordenadores simultâneos.
- 2.000 lideranças com acesso.
- 100.000 pessoas cadastradas.
- Importações limitadas a 10.000 linhas por lote.
- Links públicos com validade máxima de 30 dias e revogação imediata.

Esses números são limites de projeto para testes; devem ser revistos contra o plano contratado antes do go-live.

## Gate de go-live

- Persistência, sessão, recuperação de senha e RLS aprovadas.
- Backup e restauração ensaiados.
- Testes E2E dos três perfis operacionais aprovados.
- Zero vulnerabilidade crítica conhecida.
- Política de privacidade e canal do titular publicados.
- Piloto controlado concluído sem perda, duplicação silenciosa ou acesso cruzado.

## Ações sensíveis

| Ação | Autorização mínima | Auditoria |
|---|---|---|
| Criar ou regenerar login | Administrador | Obrigatória |
| Importar base | Administrador ou coordenador autorizado | Obrigatória |
| Transferir vínculo | Administrador/coordenador do território | Obrigatória |
| Unificar duplicidade | Administrador | Obrigatória |
| Bloquear acesso | Administrador | Obrigatória |
| Exportar base | Administrador geral e justificativa | Obrigatória |
| Excluir definitivamente | Processo LGPD aprovado | Obrigatória |
