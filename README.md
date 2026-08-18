# Rede 10 — Modo Mapeamento

MVP responsivo para mapear internamente lideranças, mobilizadores e apoiadores antes da ativação de contas. Pessoas e vínculos existem independentemente de `auth.users`; **capacidade estimada não é resultado real e nenhuma métrica representa voto garantido**.

## Prévia local

Requisitos: Node.js 20.19+ (o projeto foi verificado com Node 24).

```powershell
npm.cmd install
npm.cmd run dev
```

Abra `http://127.0.0.1:4173`. Sem `.env`, a aplicação entra automaticamente em modo demonstração:

- liderança: `lideranca@rede10.demo` / `rede10demo`
- administração: troque o e-mail para `admin@rede10.demo` / qualquer senha não vazia
- cadastro público: `http://127.0.0.1:4173/convite/MARINA10`

Todos os nomes, telefones e indicadores do modo demonstração são fictícios.

## O que está implementado

- Login, recuperação de senha e logout (Supabase quando configurado; simulação segura no modo demo).
- Painel de liderança com meta de 10, métricas separadas e atividade recente.
- Link individual, cópia, compartilhamento pelo WhatsApp e convite com prevenção de telefone duplicado.
- Cadastro público voluntário com consentimentos separados.
- Rede direta filtrável e árvore com expansão progressiva.
- Painel de coordenação, alertas administrativos, área de administração e minuta de privacidade.
- Esquema PostgreSQL versionado, índices, unicidade parcial de telefone/e-mail, prevenção de ciclos e RLS.
- Perfis bloqueados deixam de satisfazer as funções auxiliares de autorização.
- Testes unitários das regras centrais, lint, tipos, build e auditoria de dependências.

## Configurar o Supabase

1. Crie um projeto no Supabase e copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca use `service_role` no frontend.
3. Instale e autentique a CLI do Supabase, vincule o projeto e aplique as migrações:

```powershell
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

4. No painel de Auth, defina a URL do site e os redirects de recuperação de senha.
5. Verifique em **API Settings** se o schema `public` está exposto. A migração concede acesso de tabela explicitamente e o RLS limita as linhas.
6. Antes de produção, rode os advisors de segurança/desempenho e os testes RLS com usuários reais de teste.

A aplicação usa somente a chave publicável no cliente. Funções de autorização consultam tabelas protegidas; não usam `user_metadata`. Os helpers `SECURITY DEFINER` ficam no schema privado, validam `auth.uid()`, usam `search_path` vazio e têm execução revogada de `PUBLIC`/`anon`.

## Criar o primeiro administrador

1. Crie o usuário em **Authentication → Users** no painel Supabase.
2. Copie o UUID do usuário e execute no SQL Editor, ajustando dados fictícios/operacionais:

```sql
insert into public.profiles
  (auth_user_id, nome, email, telefone, municipio, bairro, role, status)
values
  ('UUID_DO_AUTH_USER', 'Nome do administrador', 'admin@exemplo.org', '71999999999',
   'Salvador', 'Centro', 'administrador', 'cadastrado');
```

O primeiro administrador deve ser criado por um operador autorizado no painel/SQL Editor; nunca por uma rota pública.

## Verificações executadas

```text
npm run lint   → aprovado
npm test       → 1 arquivo, 3 testes aprovados
npm run build  → aprovado (1866 módulos)
npm audit      → 0 vulnerabilidades
```

Os testes cobrem normalização de telefone, contagem de descendentes em vários níveis, autorreferência e ciclo. O arquivo `supabase/tests/rls_smoke.sql` faz verificações estruturais; testes completos de isolamento precisam ser executados depois que houver um projeto Supabase de homologação conectado.

## Publicação

Gere `dist/` com `npm run build` e publique em Vercel, Netlify ou hospedagem estática equivalente. Configure as três variáveis do `.env.example`, HTTPS, domínio oficial e URLs de redirecionamento no Supabase. Não publique o modo demonstração como ambiente oficial.

## Segunda versão / pendências técnicas

- Fluxo transacional completo de aceite de convite ligado ao Auth em um ambiente Supabase real.
- Exportação CSV no servidor com autorização, escopo e registro de auditoria.
- CRUD administrativo completo, correção de vínculos e resolução assistida de duplicidades.
- Login por telefone/WhatsApp, PWA, notificações, paginação e testes E2E.
- Testes automatizados de cada política RLS contra uma instância de homologação.

## Validações da coordenação e jurídica

Antes de usar dados reais, validar: controlador e encarregado; finalidade e base legal de cada tratamento; texto/versão dos consentimentos; retenção e descarte; canal de direitos; regras para pré-cadastro e contato por WhatsApp; transferência/operadores; resposta a incidentes; conteúdo de propaganda e uso eleitoral; e se algum dado pode revelar opinião política (dado pessoal sensível).

Fontes oficiais de referência: [segurança da API e RLS no Supabase](https://supabase.com/docs/guides/api/securing-your-api), [autenticação por senha no Supabase](https://supabase.com/docs/guides/auth/passwords), [LGPD — Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [ANPD](https://www.gov.br/anpd/pt-br) e [legislação eleitoral compilada pelo TSE](https://www.tse.jus.br/legislacao/compilada). A política final deve ser revisada por assessoria jurídica eleitoral e de proteção de dados.

## Modo Mapeamento

Entre com `admin@rede10.demo` / `rede10demo`. A aplicação abre em `/mapeamento`, restrita à administração e coordenação. Lideranças e apoiadores cadastrados não recebem login; links `/convite/...` ficam bloqueados até a liberação futura do Modo Mobilização.

O painel separa capacidade estimada, meta acordada, pessoas informadas, cadastradas, confirmadas e percentual de realização. O cadastro rápido abre capacidade e meta apenas para lideranças/mobilizadores. A ficha individual preserva vínculos, origem, validação, histórico e preparação de ativação sem disparar convite.

### Importar a primeira base

1. Abra **Importar base**.
2. Selecione `examples/importacao-modelo.csv` ou um CSV UTF-8 com cabeçalhos `nome,telefone,municipio,bairro,lideranca,observacao`.
3. Escolha uma liderança de referência, confira a prévia e confirme.
4. Telefones inválidos são rejeitados; possíveis duplicidades seguem para revisão sem exclusão automática.

XLSX e o desfazer lote pela interface ficam para a próxima versão. O banco já registra lotes, origem, responsável e estado; o convite futuro vinculará o cadastro existente ao Auth sem recriar a pessoa ou seus vínculos.
