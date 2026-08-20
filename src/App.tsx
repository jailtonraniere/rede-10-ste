/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChart3,
  Bell,
  ChevronRight,
  Clipboard,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Home,
  Link2,
  Link2Off,
  ListTree,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { appConfig } from "./config";
import { adminUser, demoUser, members, statuses } from "./data/demo";
import {
  confirmed,
  descendants,
  directMembers,
  normalizePhone,
} from "./lib/network";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Member, Role, SessionUser } from "./types";
import {
  Duplicates,
  ImportPage,
  LeaderDetail,
  MappingDashboard,
  ModeSettings,
  PeopleList,
  PublicCollection,
  QuickCreate,
} from "./Mapping";

const Status = ({ value }: { value: string }) => (
  <span className={`status ${value}`}>{statuses[value] ?? value}</span>
);
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">40180</span>
      <span>
        <b>TIME 40180</b>
        <small>Ste Vilela · {appConfig.name}</small>
      </span>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState(
      isSupabaseConfigured ? "" : "admin@rede10.demo",
    ),
    [password, setPassword] = useState(
      isSupabaseConfigured ? "" : "rede10demo",
    ),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (supabase) {
      const loginEmail = email.includes("@") ? email : `${email}@acesso.rede10.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (error) {
        setMessage("Login ou senha inválidos.");
      } else if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,nome,email,role,territory_id")
          .eq("auth_user_id", data.user.id)
          .single();
        if (profileError || !profile) {
          await supabase.auth.signOut();
          setMessage("Seu acesso ainda não foi vinculado a um perfil. Procure a administração.");
        } else {
          const [{ data: member }, { data: territory }] = await Promise.all([
            supabase
              .from("network_members")
              .select("id")
              .eq("profile_id", profile.id)
              .maybeSingle(),
            profile.territory_id
              ? supabase
                  .from("territories")
                  .select("nome")
                  .eq("id", profile.territory_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          onLogin({
            id: data.user.id,
            nome: profile.nome,
            email: profile.email ?? data.user.email ?? loginEmail,
            role: profile.role as Role,
            memberId: member?.id ?? "",
            territory: territory?.nome ?? "Todos",
          });
        }
      }
    } else {
      setTimeout(
        () => onLogin(email.startsWith("admin") ? adminUser : demoUser),
        350,
      );
    }
    setBusy(false);
  }
  async function reset() {
    if (!email) return setMessage("Informe seu e-mail primeiro.");
    if (!email.includes("@")) return setMessage("Para recuperar a senha, procure a coordenação ou informe um e-mail.");
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/nova-senha`,
      });
      setMessage(error?.message ?? "Confira sua caixa de entrada.");
    } else
      setMessage("Demonstração: link de recuperação simulado com sucesso.");
  }
  return (
    <main className="login-page">
      <section className="login-visual">
        <Logo />
        <div className="visual-copy">
          <span className="eyebrow">Ste Vilela · 40180</span>
          <h1>Uma rede feita de pessoas, vínculos e confiança.</h1>
          <p>
            Acompanhe o crescimento da sua rede sem confundir participação com
            intenção de voto.
          </p>
        </div>
        <div className="rings">
          <i />
          <i />
          <i />
        </div>
      </section>
      <section className="login-form">
        <div className="form-wrap">
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="eyebrow">Bem-vinda de volta</span>
          <h2>Acesse sua rede</h2>
          <p>Entre com o login gerado pela administração ou com seu e-mail.</p>
          {!isSupabaseConfigured && (
            <div className="demo-note">
              <b>Modo demonstração</b>
              <span>
                Use os dados já preenchidos. Para o painel administrativo,
                troque o e-mail por admin@rede10.demo.
              </span>
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Login ou e-mail
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="text"
                required
                autoComplete="username"
              />
            </label>
            <label>
              Senha
              <div className="password">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {message && (
              <div className="form-message" role="status">
                {message}
              </div>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? "Entrando…" : "Entrar na Rede 10"}
              <ChevronRight />
            </button>
            <button className="link-btn" type="button" onClick={reset}>
              Esqueci minha senha
            </button>
          </form>
          <footer>
            Ao entrar, você concorda com os{" "}
            <a href="/privacidade">termos de uso e privacidade</a>.
          </footer>
        </div>
      </section>
    </main>
  );
}

const nav = [
  ["/inicio", "Início", Home],
  ["/convidar", "Convidar", Link2],
  ["/rede", "Minha rede", Users],
  ["/arvore", "Visualizar rede", ListTree],
] as const;
function Shell({
  user,
  onLogout,
  children,
}: {
  user: SessionUser;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const loc = useLocation(),
    navTo = useNavigate(),
    [open, setOpen] = useState(false);
  const mappingItems = [
    ["/mapeamento", "Visão geral", BarChart3],
    ["/liderancas", "Lideranças", Users],
    ["/cadastro-rapido", "Cadastro rápido", UserPlus],
    ["/importar", "Importar base", FileSpreadsheet],
    ["/duplicidades", "Duplicidades", ShieldCheck],
    ["/configuracoes", "Configuração", Settings],
  ] as const;
  const items =
    user.role === "administrador" || user.role === "coordenador"
      ? mappingItems
      : nav;
  return (
    <div className="app-shell">
      <aside className={open ? "open" : ""}>
        <div className="aside-top">
          <Logo />
          <button
            className="icon mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </button>
        </div>
        {(user.role === "administrador" || user.role === "coordenador") && (
          <div className="side-mode">
            <i />
            Modo Mapeamento
          </div>
        )}
        <nav aria-label="Principal">
          {items.map(([to, label, Icon]) => (
            <button
              className={
                loc.pathname === to || loc.pathname.startsWith(to + "/")
                  ? "active"
                  : ""
              }
              key={to}
              onClick={() => {
                navTo(to);
                setOpen(false);
              }}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <ShieldCheck />
          <b>Dados protegidos</b>
          <span>Acesso restrito à equipe autorizada.</span>
        </div>
        <button className="logout" onClick={onLogout}>
          <LogOut />
          Sair
        </button>
      </aside>
      <section className="content">
        <header>
          <button
            className="icon mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <div className="page-context">
            <span>Etapa atual</span>
            <b>Organização e validação</b>
          </div>
          <div className="header-actions">
            <button className="icon" aria-label="Notificações">
              <Bell />
            </button>
            <div className="avatar">
              {user.nome
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </div>
            <span className="user-label">
              <b>{user.nome}</b>
              <small>{user.role}</small>
            </span>
          </div>
        </header>
        <main className="page">{children}</main>
      </section>
    </div>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const direct = directMembers(members, user.memberId),
    active = direct.filter(confirmed),
    total = descendants(members, user.memberId);
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Sexta-feira, 15 de agosto</span>
          <h1>Olá, {user.nome.split(" ")[0]}!</h1>
          <p>Acompanhe a sua mobilização e cuide dos próximos passos.</p>
        </div>
        <a className="primary" href="/convidar">
          <Plus />
          Novo convite
        </a>
      </div>
      <section className="hero-card">
        <div>
          <span>Seu progresso</span>
          <h2>
            {active.length} de {appConfig.goal} pessoas
          </h2>
          <p>Cadastros diretos confirmados</p>
          <div className="progress">
            <i
              style={{
                width: `${Math.min((active.length / appConfig.goal) * 100, 100)}%`,
              }}
            />
          </div>
          <small>
            Faltam {Math.max(appConfig.goal - active.length, 0)} confirmações
            para alcançar a meta.
          </small>
        </div>
        <div className="goal">
          <b>{Math.round((active.length / appConfig.goal) * 100)}%</b>
          <span>da meta</span>
        </div>
      </section>
      <section className="metric-grid">
        <Metric
          icon={<Link2 />}
          value="7"
          label="Convites enviados"
          hint="2 aguardando resposta"
        />
        <Metric
          icon={<Users />}
          value={String(active.length)}
          label="Cadastros confirmados"
          hint="+2 nesta semana"
        />
        <Metric
          icon={<ShieldCheck />}
          value="1"
          label="Mobilizador ativo"
          hint="na sua rede direta"
        />
        <Metric
          icon={<ListTree />}
          value={String(total.filter(confirmed).length)}
          label="Alcance da rede"
          hint="em até 3 níveis"
        />
      </section>
      <div className="two-col">
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Atividade recente</h2>
              <p>Movimentações da sua rede direta.</p>
            </div>
            <a href="/rede">Ver toda a rede</a>
          </div>
          <div className="activity">
            {direct.slice(0, 4).map((m, i) => (
              <div key={m.id}>
                <span className="avatar small">
                  {m.nome
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)}
                </span>
                <p>
                  <b>{m.nome}</b>
                  <span>
                    {i === 0
                      ? "Concluiu o cadastro"
                      : i === 1
                        ? "Tornou-se mobilizador"
                        : "Recebeu seu convite"}
                  </span>
                </p>
                <time>{i + 1}d</time>
              </div>
            ))}
          </div>
        </section>
        <section className="card next">
          <span className="eyebrow">Próximo passo</span>
          <h2>Convide mais uma pessoa hoje</h2>
          <p>
            Compartilhe seu link. Cada pessoa decide voluntariamente se deseja
            concluir o cadastro.
          </p>
          <a className="secondary" href="/convidar">
            <Link2 />
            Abrir meu link
          </a>
          <small>Cadastro na rede não representa comprovação de voto.</small>
        </section>
      </div>
    </>
  );
}
function Metric({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <article className="metric">
      <span>{icon}</span>
      <div>
        <b>{value}</b>
        <label>{label}</label>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function Invite() {
  const [copied, setCopied] = useState(false),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [msg, setMsg] = useState("");
  const url = `${location.origin}/convite/MARINA10`;
  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function create(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (members.some((m) => normalizePhone(m.telefone) === normalized))
      return setMsg(
        "Este telefone já possui cadastro ou convite ativo. Nenhum registro foi criado.",
      );
    setMsg(`Convite de ${name} criado com consentimento registrado.`);
    setName("");
    setPhone("");
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Cresça com responsabilidade</span>
          <h1>Convidar uma pessoa</h1>
          <p>Envie seu link ou registre um convite autorizado.</p>
        </div>
      </div>
      <div className="two-col invite">
        <section className="card invite-link">
          <span className="icon-bubble">
            <Link2 />
          </span>
          <h2>Seu link exclusivo</h2>
          <p>Quem se cadastrar por ele ficará vinculado à sua rede.</p>
          <div className="copy-box">
            <code>{url}</code>
            <button onClick={copy}>
              <Clipboard />
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <a
            className="whatsapp"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent("Olá! Convido você a conhecer a Rede 10. A participação é voluntária: " + url)}`}
          >
            Compartilhar pelo WhatsApp
          </a>
        </section>
        <section className="card">
          <h2>Criar convite individual</h2>
          <p>Registre apenas quem autorizou receber este convite.</p>
          <form onSubmit={create} className="stack">
            <label>
              Nome da pessoa
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nome completo"
              />
            </label>
            <label>
              Telefone ou WhatsApp
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="(71) 99999-9999"
              />
            </label>
            <label className="check">
              <input type="checkbox" required />
              <span>Confirmo que a pessoa autorizou este contato.</span>
            </label>
            {msg && (
              <div className="form-message" role="status">
                {msg}
              </div>
            )}
            <button className="primary">Criar convite</button>
          </form>
        </section>
      </div>
    </>
  );
}

function Network() {
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("todos");
  const list = members
    .filter((m) => m.parentId === "m1")
    .filter(
      (m) =>
        (filter === "todos" || m.status === filter) &&
        m.nome.toLowerCase().includes(q.toLowerCase()),
    );
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Pessoas diretamente vinculadas</span>
          <h1>Minha rede</h1>
          <p>Dados pessoais de outros ramos não são exibidos.</p>
        </div>
      </div>
      <section className="card">
        <div className="filters">
          <label className="search">
            <Search />
            <input
              aria-label="Buscar por nome"
              placeholder="Buscar por nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="todos">Todos os status</option>
            {Object.entries(statuses).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Status</th>
                <th>Bairro</th>
                <th>Entrada</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.nome}</b>
                    <small>{m.role}</small>
                  </td>
                  <td>
                    <Status value={m.status} />
                  </td>
                  <td>{m.bairro}</td>
                  <td>
                    {new Date(m.joinedAt + "T12:00").toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td>
                    <button className="link-btn">Acompanhar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <div className="empty">Nenhuma pessoa encontrada.</div>
        )}
      </section>
    </>
  );
}

function Tree() {
  const [expanded, setExpanded] = useState(new Set(["m1", "m3"]));
  function Node({ m, level = 0 }: { m: Member; level?: number }) {
    const kids = directMembers(members, m.id),
      open = expanded.has(m.id);
    return (
      <div
        className="tree-node"
        style={{ "--level": level } as React.CSSProperties}
      >
        <button
          onClick={() =>
            setExpanded((s) => {
              const n = new Set(s);
              if (n.has(m.id)) n.delete(m.id);
              else n.add(m.id);
              return n;
            })
          }
        >
          <span className="avatar small">
            {m.nome
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)}
          </span>
          <span>
            <b>{m.nome}</b>
            <small>{kids.length} vínculo(s) direto(s)</small>
          </span>
          {kids.length > 0 && <ChevronRight className={open ? "rotate" : ""} />}
        </button>
        {open && kids.map((k) => <Node key={k.id} m={k} level={level + 1} />)}
      </div>
    );
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Carregamento por ramo</span>
          <h1>Visualização da rede</h1>
          <p>Expanda apenas o trecho que deseja consultar.</p>
        </div>
      </div>
      <section className="card tree">
        <Node m={members[0]} />
      </section>
    </>
  );
}

function Coordination() {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Visão administrativa</span>
          <h1>Painel da coordenação</h1>
          <p>
            Indicadores agregados; participação não significa intenção de voto.
          </p>
        </div>
        <button className="secondary">Exportar CSV autorizado</button>
      </div>
      <div className="metric-grid">
        <Metric
          icon={<Users />}
          value="128"
          label="Pessoas cadastradas"
          hint="+18 nos últimos 7 dias"
        />
        <Metric
          icon={<ShieldCheck />}
          value="23"
          label="Mobilizadores ativos"
          hint="4 alcançaram a meta"
        />
        <Metric
          icon={<Link2 />}
          value="31"
          label="Convites pendentes"
          hint="8 há mais de 7 dias"
        />
        <Metric
          icon={<ListTree />}
          value="4"
          label="Níveis da rede"
          hint="profundidade máxima"
        />
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Atenções da coordenação</h2>
            <p>Itens fictícios que pedem acompanhamento.</p>
          </div>
        </div>
        <div className="attention">
          <div>
            <span className="dot amber" />
            <p>
              <b>6 redes sem atividade recente</b>
              <span>Sem movimentação há mais de 21 dias</span>
            </p>
            <button>Revisar</button>
          </div>
          <div>
            <span className="dot red" />
            <p>
              <b>1 possível duplicidade</b>
              <span>Mesmo telefone em convite e cadastro</span>
            </p>
            <button>Resolver</button>
          </div>
          <div>
            <span className="dot blue" />
            <p>
              <b>1 solicitação de saída</b>
              <span>Aguardando tratamento administrativo</span>
            </p>
            <button>Atender</button>
          </div>
        </div>
      </section>
    </>
  );
}
function Admin() {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Acesso restrito</span>
          <h1>Administração</h1>
          <p>Perfis, territórios, segurança e auditoria.</p>
        </div>
      </div>
      <section className="admin-grid">
        {[
          ["Usuários e perfis", "Gerencie funções, bloqueios e aprovações."],
          ["Territórios", "Defina áreas e coordenadores responsáveis."],
          ["Duplicidades", "Resolva registros sem contagem artificial."],
          ["Auditoria", "Consulte ações administrativas relevantes."],
        ].map(([t, d]) => (
          <article className="card" key={t}>
            <Settings />
            <h2>{t}</h2>
            <p>{d}</p>
            <button className="secondary">Abrir</button>
          </article>
        ))}
      </section>
    </>
  );
}
function Privacy() {
  return (
    <main className="legal">
      <Logo />
      <a href="/">← Voltar</a>
      <h1>Privacidade e participação voluntária</h1>
      <p className="lead">
        Esta é uma minuta funcional para demonstração. A política definitiva, a
        base legal, os prazos de retenção e os canais oficiais precisam de
        validação jurídica antes do uso real.
      </p>
      <h2>Para que usamos os dados</h2>
      <p>
        Organizar convites, cadastros voluntários, vínculos de mobilização e
        acompanhamento operacional. Participar da rede não representa
        comprovação ou promessa de voto.
      </p>
      <h2>Seus controles</h2>
      <p>
        Você pode corrigir seus dados, retirar a autorização para comunicações e
        solicitar saída ou exclusão. A autorização para tratar dados e a
        autorização para receber comunicações são registradas separadamente.
      </p>
      <h2>Dados que não coletamos no MVP</h2>
      <p>
        CPF, título de eleitor, religião, raça ou etnia, saúde, renda,
        orientação sexual, voto secreto ou preferências políticas inferidas.
      </p>
      <h2>Segurança e acesso</h2>
      <p>
        Cada função acessa somente o necessário. Lideranças não podem exportar
        listas completas nem consultar dados pessoais de outros ramos.
      </p>
      <h2>Contato</h2>
      <p>
        Canal provisório: {appConfig.supportEmail}. Substitua pelo canal oficial
        da campanha antes da publicação.
      </p>
    </main>
  );
}
function InviteRegistration() {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <main className="public-form success">
        <ShieldCheck />
        <h1>Cadastro concluído</h1>
        <p>
          Sua participação foi registrada. Isso não representa comprovação de
          voto.
        </p>
        <a className="primary" href="/">
          Acessar
        </a>
      </main>
    );
  return (
    <main className="public-form">
      <Logo />
      <span className="eyebrow">Convite de Marina Costa</span>
      <h1>Faça parte da rede</h1>
      <p>Preencha seus dados apenas se quiser participar voluntariamente.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDone(true);
        }}
        className="stack"
      >
        <label>
          Nome completo
          <input required />
        </label>
        <label>
          Telefone ou WhatsApp
          <input required />
        </label>
        <div className="form-row">
          <label>
            Município
            <input required />
          </label>
          <label>
            Bairro ou comunidade
            <input required />
          </label>
        </div>
        <label>
          E-mail
          <input type="email" required />
        </label>
        <label>
          Crie uma senha
          <input type="password" minLength={8} required />
        </label>
        <label className="check">
          <input type="checkbox" required />
          <span>
            Li a finalidade e autorizo o tratamento dos meus dados para
            participação na rede.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" />
          <span>Autorizo, separadamente, o recebimento de comunicações.</span>
        </label>
        <label className="check">
          <input type="checkbox" />
          <span>Quero solicitar atuação como mobilizador(a).</span>
        </label>
        <button className="primary">Concluir cadastro voluntário</button>
        <small>
          Seus dados serão vinculados ao convite correto e protegidos por
          controles de acesso.
        </small>
      </form>
    </main>
  );
}
function DisabledInvite() {
  return (
    <main className="public-form success">
      <Link2Off />
      <span className="eyebrow">Modo Mapeamento</span>
      <h1>Convites ainda não estão disponíveis</h1>
      <p>
        A campanha está organizando e validando sua base interna. Nenhum
        cadastro ou acesso é liberado por este link nesta etapa.
      </p>
      <a className="secondary" href="/">
        Voltar
      </a>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null),
    [mappingData, setMappingData] = useState<Member[]>(members);
  async function logout() {
    await supabase?.auth.signOut();
    setUser(null);
  }
  const mp = { data: mappingData, setData: setMappingData };
  return (
    <Routes>
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/coleta/:code" element={<PublicCollection {...mp} />} />
      <Route path="/convite/:code" element={<DisabledInvite />} />
      {!user ? (
        <Route path="*" element={<Login onLogin={setUser} />} />
      ) : (
        <Route
          path="*"
          element={
            <Shell user={user} onLogout={logout}>
              <Routes>
                <Route
                  path="/mapeamento"
                  element={<MappingDashboard {...mp} />}
                />
                <Route path="/liderancas" element={<PeopleList {...mp} />} />
                <Route
                  path="/liderancas/:id"
                  element={<LeaderDetail {...mp} />}
                />
                <Route
                  path="/cadastro-rapido"
                  element={<QuickCreate {...mp} />}
                />
                <Route path="/importar" element={<ImportPage {...mp} />} />
                <Route path="/duplicidades" element={<Duplicates {...mp} />} />
                <Route path="/configuracoes" element={<ModeSettings />} />
                <Route path="/inicio" element={<Dashboard user={user} />} />
                <Route path="/rede" element={<Network />} />
                <Route path="/arvore" element={<Tree />} />
                <Route
                  path="*"
                  element={
                    <Navigate
                      to={
                        user.role === "administrador" ||
                        user.role === "coordenador"
                          ? "/mapeamento"
                          : "/inicio"
                      }
                      replace
                    />
                  }
                />
              </Routes>
            </Shell>
          }
        />
      )}
    </Routes>
  );
}
