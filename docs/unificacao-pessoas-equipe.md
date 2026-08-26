# Unificação de pessoas e equipe

## Diagnóstico da estrutura anterior

`public.network_members` já é o cadastro de pessoa usado pela Base de cadastros. Ele concentra dados pessoais, liderança (`parent_member_id`), autoria (`created_by_profile_id`), metas, estimativas, origem, importação e status operacionais.

`public.profiles` é o perfil de autorização ligado a `auth.users`. Ele concentra a permissão (`role`), o status de acesso, o login e a proteção do administrador geral. A ligação correta já existia como `network_members.profile_id -> profiles.id`.

O desvio estava em `manage-team-users`: o fluxo “Criar usuário” criava `auth.users` e `profiles` sem criar ou ligar obrigatoriamente um `network_members`. Já o acesso de lideranças usava o modelo correto e ligava o perfil a uma pessoa existente.

Relações históricas preservadas:

- `activities.member_id` mantém atividades da pessoa; `responsible_profile_id` mantém a autoria pelo usuário;
- `network_members.created_by_profile_id` mantém a autoria dos cadastros;
- `parent_member_id`, `coordinator_id` e `territory_id` mantêm vínculos e escopo;
- metas e estimativas permanecem em `network_members`;
- `invitations`, `collection_links`, `consent_records`, `privacy_requests`, `import_batches`, `duplicate_reviews` e `audit_logs` não são recriados nem removidos;
- `profiles` e `auth.users` existentes não são substituídos.

O schema atual não possui CPF nem outro documento oficial. Por isso o backfill não tenta deduzir identidade por nome: usa somente e-mail exato normalizado ou telefone válido normalizado, e apenas em correspondência 1:1.

## Plano de migração

1. Adicionar `network_members.is_team_member` e `record_origin`, índices e auditoria da execução.
2. Marcar registros já ligados a `profiles` e funções operacionais como equipe.
3. Ligar automaticamente `profiles` sem pessoa somente quando houver uma correspondência inequívoca 1:1 por e-mail ou telefone.
4. Para perfis sem correspondência ou com correspondência duvidosa, criar uma única pessoa canônica ligada ao perfil original. Contatos que conflitam permanecem integralmente no `profile` e são lidos pela aplicação pela relação; não são usados para forçar mescla.
5. Inserir cada caso duvidoso em `person_identity_conflicts` e no relatório existente `duplicate_reviews`.
6. Conferir totais antes/depois e abortar a transação se qualquer tabela histórica perder linhas ou se algum perfil ficar sem pessoa canônica.
7. Substituir o cadastro isolado de usuário por concessão de acesso a um `network_member` existente.

Por compatibilidade de implantação, a ação antiga da Edge Function continua aceita temporariamente, mas ela também cria ou reutiliza uma pessoa canônica e reserva o login em `access_username`; portanto não volta a produzir `profiles` isolados nem duplica a pessoa em uma repetição da mesma requisição.

A sentinela `person_unification_runs.run_key = 'unify_people_team_v1'` impede a repetição do backfill após a primeira conclusão. Reaplicar o arquivo mantém alterações manuais posteriores e não cria novas pessoas ou conflitos.

## Arquivos e tabelas alterados

Arquivos:

- `supabase/migrations/20260826034356_self_registration_consent_compat.sql`;
- `supabase/migrations/20260826034423_unify_people_and_team.sql`;
- `supabase/functions/manage-team-users/index.ts`;
- `src/types.ts`;
- `src/services/data.ts`;
- `src/Mapping.tsx`;
- `src/App.tsx`;
- `src/styles.css`;
- `src/services/data.test.ts`;
- `supabase/tests/person_unification_integrity.sql`.

Tabelas modificadas de forma aditiva/compatível:

- `network_members`: dois campos e dois índices novos; telefone passa a aceitar `NULL` somente para preservar perfis legados sem telefone válido; a constraint de função passa a aceitar todos os papéis já existentes no enum;
- `person_unification_runs`: nova trilha de contagem e execução;
- `person_identity_conflicts`: novo relatório auditável de correspondências duvidosas;
- `duplicate_reviews`: recebe somente novas pendências, sem resolver ou mesclar registros;
- `audit_logs`: recebe um resumo da migração.

Nenhuma tabela, coluna, chave estrangeira ou registro existente é removido.

## Riscos e controles

- Perfil legado com telefone “Não informado”: preservado no `profile`; a pessoa canônica aceita telefone nulo, enquanto novos cadastros continuam exigindo telefone na interface.
- E-mail e telefone apontando para pessoas diferentes: nenhuma ligação automática; os dois candidatos entram em revisão.
- Mais de um perfil apontando para a mesma pessoa: nenhuma ligação automática.
- Contato duplicado: o contato não é copiado para a nova linha, evitando violar índices; continua disponível no perfil original.
- Falha ao criar acesso depois de cadastrar a pessoa: a pessoa permanece salva e a interface informa que somente o acesso falhou.
- Remoção de acesso: é lógica em `profiles`; não altera nem exclui `network_members`, atividades ou autoria.
- Permissão e função: passam a ser independentes; editar a função da pessoa não troca silenciosamente a permissão do login.

## Rollback

Não há rollback destrutivo automático. Antes da validação completa, o fluxo e as estruturas legadas permanecem disponíveis no histórico de migrações.

Rollback recomendado da aplicação:

1. republicar a versão anterior do frontend e das Edge Functions;
2. manter as colunas e tabelas novas no banco, pois são compatíveis e não interferem no código anterior;
3. se necessário, restaurar apenas as policies e a função `private.sync_network_member_profile` da migração anterior;
4. não desfazer os vínculos `profile_id` nem excluir as pessoas geradas pelo backfill sem revisão manual e backup validado;
5. usar `person_unification_runs`, `person_identity_conflicts` e `audit_logs` para reconciliar qualquer caso antes de uma reversão de dados.

Essa estratégia evita um “down migration” que pudesse apagar classificações, pessoas canônicas ou evidências de auditoria.
