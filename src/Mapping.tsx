import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { LinkStatus, Member, RegistrationStatus, Role, SessionUser } from "./types";
import { brazilianPhonePattern, confirmed, directMembers, formatPhone, normalizePhone } from "./lib/network";
import {
  duplicateCandidates,
  parseCsv,
  prepareActivation,
  realization,
  uniquePeople,
  type CsvRow,
} from "./lib/mapping";
import { isSupabaseConfigured } from "./lib/supabase";
import { peMunicipalities } from "./data/pe-municipalities";
import { bulkCreateMembers, changeTeamUserRole, createActivity, createCollectionLink, createLeadershipAccess, createMember, createTeamUser, deleteMember, deleteTeamUser, getCollectionContext, loadActivities, loadDuplicateReviews, loadOperatingMode, loadTeamUsers, recordExportAudit, resetTeamUserPassword, resolveDuplicateReview, saveOperatingMode, setTeamUserActive, submitCollection, updateMember, updateMemberDetails, type ActivityItem, type DuplicateReview, type MemberInput, type TeamUser } from "./services/data";

export type MappingProps = {
  data: Member[];
  setData: React.Dispatch<React.SetStateAction<Member[]>>;
  user: SessionUser | null;
  refresh: () => Promise<void>;
};
const regLabels: Record<RegistrationStatus, string> = {
  importado: "Importado",
  pendente_revisao: "Pendente de revisão",
  revisado: "Revisado",
  pronto_ativacao: "Pronto para ativação",
  ativado: "Ativado",
  inativo: "Inativo",
  duplicado: "Duplicado",
  desligado: "Desligado",
};
const linkLabels: Record<LinkStatus, string> = {
  nao_informado: "Não informado",
  informado_lideranca: "Informado pela liderança",
  em_validacao: "Em validação",
  confirmado_pessoa: "Confirmado pela pessoa",
  recusado: "Recusado",
  encerrado: "Encerrado",
};
const leaders = (all: Member[]) =>
  all.filter((m) => m.role === "lideranca" || m.role === "mobilizador");
const accountRoleLabel = (role: Role) => ({
  administrador:"Administrador",
  cadastrador:"Cadastrador",
  coordenador:"Coordenador",
  lideranca:"Liderança",
  mobilizador:"Mobilizador",
  participante:"Participante",
})[role];
const registrationCreatorLabel = (member: Member, all: Member[]) => {
  if (member.createdByName) return member.createdByName;
  const source = member.source?.toLocaleLowerCase("pt-BR") ?? "";
  if (source.includes("link")) {
    const leaderName = all.find((item) => item.id === member.parentId)?.nome;
    return leaderName ? `Link de ${leaderName}` : "Link da liderança";
  }
  if (source.includes("import")) return "Importação";
  return "Não identificado";
};
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`map-pill ${tone}`}>{children}</span>;
}
function Head({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">Modo Mapeamento</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <article className={`map-stat ${tone ?? ""}`}>
      <span>{label}</span>
      <b>{value}</b>
      {hint && <small>{hint}</small>}
    </article>
  );
}

export function MappingDashboard({ data }: MappingProps) {
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]),
    [teamLoading, setTeamLoading] = useState(isSupabaseConfigured),
    [teamError, setTeamError] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    loadTeamUsers()
      .then((users) => { if (active) setTeamUsers(users); })
      .catch(() => { if (active) setTeamError("Não foi possível carregar o resumo da equipe."); })
      .finally(() => { if (active) setTeamLoading(false); });
    return () => { active = false; };
  }, []);
  const contributors = [...new Map(data
      .filter((member) => member.createdByProfileId && member.createdByName && (member.createdByRole === "administrador" || member.createdByRole === "cadastrador"))
      .map((member) => [member.createdByProfileId as string, { id:member.createdByProfileId as string, name:member.createdByName as string, role:member.createdByRole as "administrador"|"cadastrador", status:"cadastrado", createdAt:"", isSuperAdmin:false } satisfies TeamUser])).values()],
    visibleTeam = teamUsers.length ? teamUsers : contributors,
    teamRegistrationCounts = data.reduce<Map<string,number>>((counts, member) => {
      if (member.createdByProfileId) counts.set(member.createdByProfileId, (counts.get(member.createdByProfileId) ?? 0) + 1);
      return counts;
    }, new Map()),
    teamPerformance = visibleTeam.map((teamMember) => ({
      ...teamMember,
      total:teamRegistrationCounts.get(teamMember.id) ?? 0,
    })).sort((a,b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR")),
    teamCreatedTotal = teamPerformance.reduce((total, member) => total + member.total, 0),
    unique = uniquePeople(data),
    ls = leaders(data),
    supporters = data.filter((m) => m.role === "participante"),
    confirmedCount = data.filter(confirmed).length,
    capacity = ls.reduce((a, m) => a + (m.estimatedCapacity ?? 0), 0),
    goal = ls.reduce((a, m) => a + (m.agreedGoal ?? 10), 0),
    pending = data.filter((m) => !m.registrationStatus || m.registrationStatus === "pendente_revisao").length,
    duplicateCount = data.filter((m) => m.registrationStatus === "duplicado").length,
    navigate = useNavigate();
  return (
    <>
      <Head
        title="Visão geral operacional"
        description="Acompanhe a qualidade da base sem confundir estimativas com resultados reais."
        action={
          <button
            className="primary"
            onClick={() => navigate("/cadastro-rapido?tipo=lideranca")}
          >
            <Plus />
            Cadastrar liderança
          </button>
        }
      />
      <section className="map-stats">
        <Stat
          label="Total de lideranças"
          value={ls.length}
        />
        <Stat
          label="Capacidade estimada"
          value={capacity}
          hint="não é quantidade real"
        />
        <Stat label="Meta acordada" value={goal} />
        <Stat label="Pessoas cadastradas" value={unique.length} hint={`${supporters.length} apoiadores`} tone="green" />
        <Stat label="Pessoas confirmadas" value={confirmedCount} />
        <Stat
          label="Realização da meta"
          value={`${realization(confirmedCount, goal)}%`}
          tone="lime"
        />
        <Stat label="Pendências de revisão" value={pending} tone={pending ? "warning" : "green"} />
        <Stat label="Possíveis duplicidades" value={duplicateCount} tone={duplicateCount ? "warning" : "green"} />
      </section>
      <div className="two-col mapping-cols">
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Atenções da base</h2>
              <p>Itens que precisam de tratamento pela equipe.</p>
            </div>
          </div>
          <div className="attention">
            <Attention
              tone="red"
              title={`${data.filter((m) => m.registrationStatus === "duplicado").length} possível(is) duplicidade(s)`}
              text="Telefone já encontrado em outro registro"
              onClick={() => navigate("/duplicidades")}
            />
            <Attention
              tone="amber"
              title={`${data.filter((m) => !m.registrationStatus || m.registrationStatus === "pendente_revisao").length} pendentes de revisão`}
              text="Cadastros aguardando conferência"
            />
            <Attention
              tone="blue"
              title={`${data.filter((m) => m.registrationStatus === "pronto_ativacao").length} prontos para ativação`}
              text="Sem envio de convite nesta etapa"
            />
            <Attention
              tone="amber"
              title={`${data.filter((m) => m.linkStatus === "em_validacao").length} vínculo(s) em validação`}
              text="Aguardando confirmação da pessoa"
            />
          </div>
        </section>
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Distribuição por liderança</h2>
              <p>Vínculos diretos cadastrados.</p>
            </div>
          </div>
          <div className="leader-bars">
            {ls.slice(0, 5).map((m) => {
              const total = directMembers(data, m.id).length,
                cap = m.estimatedCapacity ?? 10;
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/liderancas/${m.id}`)}
                >
                  <span>
                    <b>{m.nome}</b>
                    <small>
                      {total} de {cap} estimados
                    </small>
                  </span>
                  <i>
                    <em
                      style={{
                        width: `${Math.min((total / cap) * 100, 100)}%`,
                      }}
                    />
                  </i>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <section className="card team-registration-card">
        <div className="section-head">
          <div>
            <h2>Cadastros realizados pela equipe</h2>
            <p>Quantidade registrada por administradores e cadastradores.</p>
          </div>
          <span className="team-registration-total"><b>{teamCreatedTotal}</b> no total</span>
        </div>
        {teamLoading ? <div className="empty compact" aria-live="polite">Carregando desempenho da equipe…</div> : teamError ? <div className="form-message" role="status">{teamError}</div> : teamPerformance.length ? (
          <div className="team-registration-grid">
            {teamPerformance.map((teamMember) => (
              <button key={teamMember.id} onClick={() => navigate(`/cadastros?cadastrador=${teamMember.id}`)} aria-label={`Ver ${teamMember.total} cadastros feitos por ${teamMember.name}`}>
                <span className="team-registration-avatar" aria-hidden="true">{teamMember.name.split(" ").slice(0,2).map((part) => part[0]).join("")}</span>
                <span><b>{teamMember.name}</b><small>{accountRoleLabel(teamMember.role)}{teamMember.status === "bloqueado" ? " · Inativo" : ""}</small></span>
                <strong>{teamMember.total}<small>{teamMember.total === 1 ? "cadastro" : "cadastros"}</small></strong>
                <ChevronRight aria-hidden="true"/>
              </button>
            ))}
          </div>
        ) : <div className="empty compact">Nenhum cadastro da equipe foi identificado até o momento.</div>}
      </section>
    </>
  );
}
function Attention({
  tone,
  title,
  text,
  onClick,
}: {
  tone: string;
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <div>
      <span className={`dot ${tone}`} />
      <p>
        <b>{title}</b>
        <span>{text}</span>
      </p>
      <button onClick={onClick}>Revisar</button>
    </div>
  );
}

export function PeopleList({ data }: MappingProps) {
  const [q, setQ] = useState(""),
    [roleFilter, setRoleFilter] = useState("todos"),
    [statusFilter, setStatusFilter] = useState("todos"),
    [filtersOpen, setFiltersOpen] = useState(false),
    [page, setPage] = useState(1),
    navigate = useNavigate();
  const filtered = leaders(data).filter((m) =>
    m.nome.toLowerCase().includes(q.toLowerCase())
    && (roleFilter === "todos" || m.role === roleFilter)
    && (statusFilter === "todos" || (m.registrationStatus ?? "pendente_revisao") === statusFilter),
  ), pageSize = 25, pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages), list = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), activeFilters = Number(roleFilter !== "todos") + Number(statusFilter !== "todos");
  return (
    <>
      <Head
        title="Lideranças mapeadas"
        description="Pessoas e vínculos podem existir sem conta de acesso."
        action={
          <button
            className="primary"
            onClick={() => navigate("/cadastro-rapido?tipo=lideranca")}
          >
            <Plus />
            Cadastrar liderança
          </button>
        }
      />
      <section className="card">
        <div className="mobile-filter-toolbar">
          <button className="secondary" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}><SlidersHorizontal/>Filtros{activeFilters ? ` (${activeFilters})` : ""}</button>
          <span>{filtered.length} liderança(s)</span>
        </div>
        {filtersOpen && <button className="filter-backdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)}/>}
        <div className={`filters filter-drawer ${filtersOpen ? "open" : ""}`}>
          <div className="filter-drawer-head"><div><b>Filtrar lideranças</b><small>Refine a lista exibida.</small></div><button className="icon" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros"><X/></button></div>
          <label className="search">
            <Search />
            <input
              aria-label="Buscar liderança"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Buscar liderança"
            />
          </label>
          <label className="filter-field"><span>Tipo</span><select aria-label="Filtrar por tipo" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>
            <option value="todos">Todos os tipos</option>
            <option value="lideranca">Liderança principal</option>
            <option value="mobilizador">Mobilizador</option>
          </select></label>
          <label className="filter-field"><span>Situação</span><select aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="todos">Todas as situações</option>
            {Object.entries(regLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <div className="filter-actions"><button className="secondary" onClick={() => { setQ(""); setRoleFilter("todos"); setStatusFilter("todos"); setPage(1); }}>Limpar filtros</button><button className="primary" onClick={() => setFiltersOpen(false)}>Ver resultados</button></div>
        </div>
        <div className="table-wrap">
          <table className="responsive-table leadership-table">
            <thead>
              <tr>
                <th>Liderança</th>
                <th>Tipo</th>
                <th>Capacidade</th>
                <th>Meta</th>
                <th>Vínculos</th>
                <th>Cadastro</th>
                <th>Reunião</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/liderancas/${m.id}`)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate(`/liderancas/${m.id}`); }}
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${m.nome}`}
                  className="click-row"
                >
                  <td data-label="Liderança">
                    <b>{m.nome}</b>
                    <small>
                      {m.bairro} · {m.municipio}
                    </small>
                  </td>
                  <td data-label="Tipo">
                    {m.role === "lideranca" ? "Principal" : "Mobilizador"}
                  </td>
                  <td data-label="Capacidade">{m.estimatedCapacity ?? "—"}</td>
                  <td data-label="Meta">{m.agreedGoal ?? 10}</td>
                  <td data-label="Vínculos">{directMembers(data, m.id).length}</td>
                  <td data-label="Cadastro">
                    <Pill>
                      {regLabels[m.registrationStatus ?? "pendente_revisao"]}
                    </Pill>
                  </td>
                  <td data-label="Reunião">{m.needsCandidateMeeting ? <Pill tone="warning">Solicitada</Pill> : "—"}</td>
                  <td data-label="Acesso">
                    {m.hasLogin ? (
                      <Pill tone="green">Ativado</Pill>
                    ) : (
                      <Pill>Sem login</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <div className="empty">Nenhuma liderança corresponde aos filtros.</div>}
        <div className="pagination"><button className="secondary" disabled={currentPage===1} onClick={()=>setPage((value)=>value-1)}>Anterior</button><span>Página {currentPage} de {pages}</span><button className="secondary" disabled={currentPage===pages} onClick={()=>setPage((value)=>value+1)}>Próxima</button></div>
      </section>
    </>
  );
}

const exportCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function RegistrationsPage({ data, setData, user }: MappingProps) {
  const navigate = useNavigate(),
    [searchParams] = useSearchParams(),
    [q, setQ] = useState(""),
    [role, setRole] = useState("todos"),
    [status, setStatus] = useState("todos"),
    [municipio, setMunicipio] = useState("todos"),
    [bairro, setBairro] = useState("todos"),
    [leader, setLeader] = useState("todos"),
    [creator, setCreator] = useState(searchParams.get("cadastrador") ?? "todos"),
    [filtersOpen, setFiltersOpen] = useState(false),
    [page, setPage] = useState(1),
    [deletingId, setDeletingId] = useState(""),
    [message, setMessage] = useState("");
  const pageSize = 25,
    leaderOptions = leaders(data),
    creatorOptions = [...new Map(data.filter((member) => member.createdByProfileId && member.createdByName).map((member) => [member.createdByProfileId as string, { id:member.createdByProfileId as string, name:member.createdByName as string }])).values()].sort((a,b) => a.name.localeCompare(b.name, "pt-BR")),
    hasUnattributed = data.some((member) => !member.createdByProfileId),
    municipalities = [...new Set(data.map((m) => m.municipio))].sort(),
    neighborhoods = [...new Set(data.filter((m) => municipio === "todos" || m.municipio === municipio).map((m) => m.bairro))].sort();
  const filtered = data.filter((member) => {
    const query = q.trim().toLocaleLowerCase("pt-BR"),
      leaderName = data.find((item) => item.id === member.parentId)?.nome ?? "",
      creatorName = registrationCreatorLabel(member, data);
    return (!query || [member.nome, member.telefone, member.email, member.municipio, member.bairro, leaderName, creatorName].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)))
      && (role === "todos" || member.role === role)
      && (status === "todos" || member.registrationStatus === status)
      && (municipio === "todos" || member.municipio === municipio)
      && (bairro === "todos" || member.bairro === bairro)
      && (leader === "todos" || member.parentId === leader)
      && (creator === "todos" || (creator === "sem_usuario" ? !member.createdByProfileId : member.createdByProfileId === creator));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    activeFilters = [role,status,municipio,bairro,leader,creator].filter((value) => value !== "todos").length;
  function change(setter: (value: string) => void, value: string) {
    setter(value); setPage(1);
  }
  async function exportCsv() {
    if (user?.role !== "administrador") return;
    setMessage("");
    try {
      if (isSupabaseConfigured) await recordExportAudit(filtered.length, { busca:q, tipo:role, cadastro:status, municipio, bairro, lideranca:leader, cadastrado_por:creator });
      const header = ["Nome","Telefone","E-mail","Tipo","Precisa reunião com a candidata","Situação do cadastro","Situação do vínculo","Liderança de referência","Município","Bairro","Origem","Cadastrado por","Criado em","Última atividade"],
        rows = filtered.map((member) => [member.nome,member.telefone,member.email,member.role,member.needsCandidateMeeting ? "Sim" : "Não",member.registrationStatus,member.linkStatus,data.find((item) => item.id === member.parentId)?.nome,member.municipio,member.bairro,member.source,registrationCreatorLabel(member,data),member.joinedAt,member.lastActivity]),
        csv = `\uFEFF${[header,...rows].map((row) => row.map(exportCell).join(";")).join("\r\n")}`,
        url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })),
        anchor = document.createElement("a");
      anchor.href = url; anchor.download = `rede-10-cadastros-${new Date().toISOString().slice(0,10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
      setMessage(`${filtered.length} cadastro(s) exportado(s); ação registrada na auditoria.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível exportar a base.");
    }
  }
  async function removeRegistration(member: Member) {
    if (user?.role !== "administrador") return;
    if (member.hasLogin) {
      setMessage("Este cadastro possui login ativo. Remova ou desative o acesso antes de excluí-lo.");
      return;
    }
    if (!window.confirm(`Excluir permanentemente o cadastro de ${member.nome}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(member.id); setMessage("");
    try {
      if (isSupabaseConfigured) await deleteMember(member.id);
      setData((current) => current.filter((item) => item.id !== member.id));
      setMessage(`Cadastro de ${member.nome} excluído com sucesso.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Não foi possível excluir o cadastro.";
      setMessage(detail.includes("foreign key") || detail.includes("23503")
        ? "Este cadastro possui vínculos, links ou histórico relacionado e não pode ser excluído. Remova os vínculos primeiro."
        : detail);
    } finally {
      setDeletingId("");
    }
  }
  return <>
    <Head title="Base de cadastros" description="Relação consolidada de pessoas visíveis no seu escopo de acesso." action={<div className="page-actions"><button className="primary" onClick={() => navigate("/cadastro-rapido?tipo=lideranca")}><Plus/>Cadastrar liderança</button>{user?.role === "administrador" && <button className="secondary" onClick={exportCsv}><Download/>Exportar filtrados</button>}</div>}/>
    <section className="card">
      <div className="mobile-filter-toolbar"><button className="secondary" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}><SlidersHorizontal/>Filtros{activeFilters ? ` (${activeFilters})` : ""}</button><span>{filtered.length} resultado(s)</span></div>
      {filtersOpen && <button className="filter-backdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)}/>}
      <div className={`filters registrations-filters filter-drawer ${filtersOpen ? "open" : ""}`}>
        <div className="filter-drawer-head"><div><b>Filtrar cadastros</b><small>Escolha um ou mais critérios.</small></div><button className="icon" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros"><X/></button></div>
        <label className="search"><Search/><input aria-label="Buscar cadastros" value={q} onChange={(e)=>change(setQ,e.target.value)} placeholder="Nome, telefone, local, liderança ou cadastrador"/></label>
        <label className="filter-field"><span>Tipo</span><select aria-label="Filtrar por tipo" value={role} onChange={(e)=>change(setRole,e.target.value)}><option value="todos">Todos os tipos</option><option value="lideranca">Lideranças</option><option value="mobilizador">Mobilizadores</option><option value="participante">Apoiadores</option></select></label>
        <label className="filter-field"><span>Situação</span><select aria-label="Filtrar por cadastro" value={status} onChange={(e)=>change(setStatus,e.target.value)}><option value="todos">Todas as situações</option>{Object.entries(regLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="filter-field"><span>Município</span><select aria-label="Filtrar por município" value={municipio} onChange={(e)=>{change(setMunicipio,e.target.value);setBairro("todos")}}><option value="todos">Todos os municípios</option>{municipalities.map((value)=><option key={value}>{value}</option>)}</select></label>
        <label className="filter-field"><span>Bairro</span><select aria-label="Filtrar por bairro" value={bairro} onChange={(e)=>change(setBairro,e.target.value)}><option value="todos">Todos os bairros</option>{neighborhoods.map((value)=><option key={value}>{value}</option>)}</select></label>
        <label className="filter-field"><span>Liderança</span><select aria-label="Filtrar por liderança" value={leader} onChange={(e)=>change(setLeader,e.target.value)}><option value="todos">Todas as lideranças</option>{leaderOptions.map((value)=><option key={value.id} value={value.id}>{value.nome}</option>)}</select></label>
        <label className="filter-field"><span>Cadastrado por</span><select aria-label="Filtrar por responsável pelo cadastro" value={creator} onChange={(e)=>change(setCreator,e.target.value)}><option value="todos">Todos os responsáveis</option>{creatorOptions.map((value)=><option key={value.id} value={value.id}>{value.name}</option>)}{hasUnattributed&&<option value="sem_usuario">Sem usuário identificado</option>}</select></label>
        <div className="filter-actions"><button className="secondary" onClick={() => {setQ("");setRole("todos");setStatus("todos");setMunicipio("todos");setBairro("todos");setLeader("todos");setCreator("todos");setPage(1);}}>Limpar filtros</button><button className="primary" onClick={() => setFiltersOpen(false)}>Ver resultados</button></div>
      </div>
      <div className="base-summary"><b>{filtered.length}</b> cadastro(s) encontrado(s) de {data.length} visíveis.</div>
      {message && <div className="form-message" role="status">{message}</div>}
      <div className="table-wrap"><table className="responsive-table registrations-table"><thead><tr><th>Pessoa</th><th>Tipo</th><th>Reunião</th><th>Cadastro</th><th>Vínculo</th><th>Liderança</th><th>Local</th><th>Origem</th><th>Cadastrado por</th><th>Ações</th></tr></thead><tbody>{visible.map((member)=><tr key={member.id}><td data-label="Pessoa"><b>{member.nome}</b><small>{member.telefone}{member.email ? ` · ${member.email}` : ""}</small></td><td data-label="Tipo">{member.role}</td><td data-label="Reunião">{member.needsCandidateMeeting ? <Pill tone="warning">Solicitada</Pill> : "—"}</td><td data-label="Cadastro"><Pill>{regLabels[member.registrationStatus ?? "pendente_revisao"]}</Pill></td><td data-label="Vínculo">{linkLabels[member.linkStatus ?? "nao_informado"]}</td><td data-label="Liderança">{data.find((item)=>item.id===member.parentId)?.nome ?? "Sem referência"}</td><td data-label="Local">{member.bairro}<small>{member.municipio}</small></td><td data-label="Origem">{member.source ?? "Não informada"}</td><td data-label="Cadastrado por"><b>{registrationCreatorLabel(member,data)}</b>{member.createdByRole&&<small>{accountRoleLabel(member.createdByRole)}</small>}</td><td data-label="Ações"><div className="registration-actions"><button className="edit-registration" onClick={()=>navigate(`/cadastros/${member.id}/editar`)} aria-label={`Editar cadastro de ${member.nome}`}><Pencil/>Editar</button>{user?.role === "administrador" && <button className="delete-registration" disabled={deletingId === member.id} onClick={()=>void removeRegistration(member)} aria-label={`Excluir cadastro de ${member.nome}`} title={member.hasLogin ? "Este cadastro possui login ativo" : "Excluir cadastro"}><Trash2/>{deletingId === member.id ? "Excluindo…" : "Excluir"}</button>}</div></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty">Nenhum cadastro corresponde aos filtros.</div>}
      <div className="pagination"><button className="secondary" disabled={currentPage===1} onClick={()=>setPage((value)=>value-1)}>Anterior</button><span>Página {currentPage} de {pages}</span><button className="secondary" disabled={currentPage===pages} onClick={()=>setPage((value)=>value+1)}>Próxima</button></div>
    </section>
  </>;
}

export function QuickCreate({ data, setData, user }: MappingProps) {
  const navigate = useNavigate(),
    isOwnNetworkUser = user?.role === "lideranca" || user?.role === "mobilizador",
    ownParentId = user?.memberId ?? "",
    [searchParams] = useSearchParams(),
    draftKey = "rede10:cadastro-rapido",
    [draft] = useState<Record<string,string>>(() => { try { return JSON.parse(sessionStorage.getItem(draftKey) ?? "{}"); } catch { return {}; } }),
    requestedType = searchParams.get("tipo"),
    initialType: Role = isOwnNetworkUser ? "participante" : requestedType === "lideranca" || requestedType === "mobilizador" || requestedType === "participante" ? requestedType : "participante",
    [type, setType] = useState<Role>(isOwnNetworkUser ? "participante" : (draft.type as Role) || initialType),
    [error, setError] = useState("");
  function remember(form: HTMLFormElement) {
    const values = Object.fromEntries([...new FormData(form).entries()].map(([key,value]) => [key,String(value)]));
    const meeting = form.elements.namedItem("needsCandidateMeeting") as HTMLInputElement | null;
    if (meeting) values.needsCandidateMeeting = String(meeting.checked);
    sessionStorage.setItem(draftKey, JSON.stringify(values));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isOwnNetworkUser && !ownParentId) {
      setError("Seu acesso ainda não está vinculado à sua liderança. Solicite a correção à administração.");
      return;
    }
    const f = new FormData(e.currentTarget),
      phone = String(f.get("telefone")),
      registrationType: Role = isOwnNetworkUser ? "participante" : type;
    const isDuplicate = Boolean(
      duplicateCandidates(
        {
          nome: String(f.get("nome")),
          telefone: phone,
          email: String(f.get("email")) || undefined,
          bairro: String(f.get("bairro")),
        },
        data,
      ).length,
    );
    if (isDuplicate) {
      setError(
        "Possível duplicidade encontrada. O registro foi enviado para revisão, sem exclusão automática.",
      );
    }
    const m: Member = {
      id: crypto.randomUUID(),
      nome: String(f.get("nome")),
      telefone: phone,
      email: String(f.get("email")) || undefined,
      municipio: String(f.get("municipio")),
      bairro: String(f.get("bairro")),
      role: registrationType,
      parentId: isOwnNetworkUser ? ownParentId : String(f.get("parentId")) || undefined,
      source: isOwnNetworkUser ? "Cadastro pela liderança" : "Cadastro administrativo",
      linkStatus: "nao_informado",
      needsCandidateMeeting: registrationType === "lideranca" && Boolean(f.get("needsCandidateMeeting")),
      notes: String(f.get("notes")),
      estimatedCapacity:
        registrationType === "participante" ? undefined : Number(f.get("capacity")),
      agreedGoal:
        registrationType === "participante" ? undefined : Number(f.get("goal") || 10),
      registrationStatus: isDuplicate ? "duplicado" : "pendente_revisao",
      status: "cadastrado",
      joinedAt: new Date().toISOString().slice(0, 10),
      lastActivity: new Date().toISOString().slice(0, 10),
      inviteCode: "",
      hasLogin: false,
    };
    try {
      const saved = isSupabaseConfigured ? await createMember({ ...m, registrationStatus: isDuplicate ? "duplicado" : "pendente_revisao" }) : m;
      setData((s) => [...s, saved]);
      if (!isDuplicate) {
        sessionStorage.removeItem(draftKey);
        navigate(isOwnNetworkUser ? "/rede" : user?.role === "cadastrador" ? "/cadastros" : registrationType === "participante" ? "/mapeamento" : `/liderancas/${saved.id}`);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível salvar o cadastro.";
      setError(message.includes("network_members_active_phone") ? "Este telefone já consta na base." : message);
    }
  }
  return (
    <>
      <Head
        title={isOwnNetworkUser || type === "participante" ? "Cadastrar pessoa" : type === "lideranca" ? "Cadastrar liderança" : "Cadastrar mobilizador"}
        description={isOwnNetworkUser ? "Adicione uma pessoa diretamente à sua rede. O rascunho fica salvo neste aparelho até a conclusão." : "Preencha os dados essenciais. O rascunho fica salvo neste aparelho até a conclusão."}
      />
      <section className="card form-card">
        <form className="mapping-form sectioned-form" onSubmit={submit} onInput={(event) => remember(event.currentTarget)} onChange={(event) => remember(event.currentTarget)}>
          <fieldset className="form-section span-2"><legend>Dados da pessoa</legend><p>Informações básicas para identificar o cadastro.</p><div className="form-section-grid">
            <Field label="Nome completo" name="nome" defaultValue={draft.nome} required />
            <PhoneField defaultValue={draft.telefone} />
            <Field label="E-mail (opcional)" name="email" type="email" autoComplete="email" defaultValue={draft.email} />
            <CityField defaultValue={draft.municipio || "Recife"} />
            <Field label="Bairro ou comunidade" name="bairro" defaultValue={draft.bairro} required />
            {isOwnNetworkUser ? <input type="hidden" name="type" value="participante"/> : <label>Tipo de pessoa<select value={type} onChange={(e) => setType(e.target.value as Role)} name="type"><option value="participante">Apoiador</option><option value="lideranca">Liderança principal</option><option value="mobilizador">Mobilizador / pequena liderança</option></select></label>}
          </div></fieldset>
          <fieldset className="form-section span-2"><legend>Vínculo na rede</legend><p>{isOwnNetworkUser ? "O cadastro será vinculado automaticamente à sua base." : "Defina a referência e, quando necessário, a meta inicial."}</p><div className="form-section-grid">
            {isOwnNetworkUser ? <div className="network-owner-link"><UserCheck/><span><b>Cadastro na sua rede</b><small>A pessoa ficará diretamente vinculada a {user?.nome}.</small></span></div> : <label>Liderança de referência<select name="parentId" defaultValue={draft.parentId || ""}><option value="">Sem liderança</option>{leaders(data).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>}
            {type === "lideranca" && <label className="check"><input type="checkbox" name="needsCandidateMeeting" defaultChecked={draft.needsCandidateMeeting === "true"}/><span>Esta liderança precisa de reunião com a candidata.</span></label>}
            {type !== "participante" && <><Field label="Capacidade estimada" name="capacity" type="number" min="1" defaultValue={draft.capacity} required/><Field label="Meta inicial acordada" name="goal" type="number" min="1" defaultValue={draft.goal || "10"} required/></>}
          </div></fieldset>
          <fieldset className="form-section span-2"><legend>Observações</legend><label>Informações adicionais<textarea name="notes" rows={3} defaultValue={draft.notes}/></label></fieldset>
          {error && (
            <div className="form-message span-2" role="alert">
              {error}
            </div>
          )}
          {isOwnNetworkUser && !ownParentId && !error && <div className="form-message span-2" role="alert">Seu acesso ainda não está vinculado à sua liderança. Procure a administração antes de cadastrar.</div>}
          <div className="form-actions span-2">
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </button>
            <button className="primary register-primary" disabled={isOwnNetworkUser && !ownParentId}><UserCheck/>Salvar pessoa</button>
          </div>
        </form>
      </section>
    </>
  );
}

function isDescendantOf(all: Member[], candidateId: string, ancestorId: string) {
  const visited = new Set<string>();
  let current = all.find((item) => item.id === candidateId)?.parentId;
  while (current && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = all.find((item) => item.id === current)?.parentId;
  }
  return false;
}

export function EditRegistration({ data, setData }: MappingProps) {
  const { id } = useParams(),
    navigate = useNavigate(),
    member = data.find((item) => item.id === id),
    draftKey = `rede10:editar-cadastro:${id ?? "desconhecido"}`,
    [draft] = useState<Record<string,string>>(() => { try { return JSON.parse(sessionStorage.getItem(draftKey) ?? "{}"); } catch { return {}; } }),
    [type, setType] = useState<Role>((draft.type as Role) || member?.role || "participante"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");

  function remember(form: HTMLFormElement) {
    const values = Object.fromEntries([...new FormData(form).entries()].map(([key,value]) => [key,String(value)]));
    const meeting = form.elements.namedItem("needsCandidateMeeting") as HTMLInputElement | null;
    if (meeting) values.needsCandidateMeeting = String(meeting.checked);
    sessionStorage.setItem(draftKey, JSON.stringify(values));
  }

  if (!member) return <Head title="Cadastro não encontrado" description="O registro solicitado não está disponível no seu escopo de acesso."/>;

  const editableMember = member,
    leaderOptions = leaders(data).filter((candidate) => candidate.id !== editableMember.id && !isDescendantOf(data, candidate.id, editableMember.id));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      phone = String(form.get("telefone")),
      input: MemberInput = {
        nome: String(form.get("nome")),
        telefone: phone,
        email: String(form.get("email")) || undefined,
        municipio: String(form.get("municipio")),
        bairro: String(form.get("bairro")),
        role: type,
        parentId: String(form.get("parentId")) || undefined,
        status: editableMember.status,
        registrationStatus: editableMember.registrationStatus,
        linkStatus: editableMember.linkStatus,
        source: editableMember.source,
        contactAuthorized: editableMember.contactAuthorized,
        needsCandidateMeeting: type === "lideranca" && Boolean(form.get("needsCandidateMeeting")),
        notes: String(form.get("notes")) || undefined,
        estimatedCapacity: type === "participante" ? undefined : Number(form.get("capacity")),
        agreedGoal: type === "participante" ? undefined : Number(form.get("goal")),
        goalDeadline: editableMember.goalDeadline,
        confidence: editableMember.confidence,
        estimateMethod: editableMember.estimateMethod,
        lastReview: editableMember.lastReview,
      };
    setSaving(true); setError("");
    try {
      const saved: Member = isSupabaseConfigured ? await updateMemberDetails(editableMember.id, input) : { ...editableMember, ...input, lastActivity:new Date().toISOString().slice(0,10) };
      setData((current) => current.map((item) => item.id === editableMember.id ? saved : item));
      sessionStorage.removeItem(draftKey);
      navigate(-1);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível atualizar o cadastro.";
      setError(message.includes("network_members_active_phone") || message.includes("network_members_email_unique")
        ? "Já existe outro cadastro ativo com este telefone ou e-mail."
        : message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Head title={`Editar ${editableMember.nome}`} description="Atualize os dados do cadastro. Todas as alterações ficam registradas no histórico de auditoria."/>
    <section className="card form-card">
      <form className="mapping-form sectioned-form" onSubmit={submit} onInput={(event) => remember(event.currentTarget)} onChange={(event) => remember(event.currentTarget)}>
        <fieldset className="form-section span-2"><legend>Dados da pessoa</legend><p>Atualize as informações de identificação e contato.</p><div className="form-section-grid">
          <Field label="Nome completo" name="nome" defaultValue={draft.nome ?? editableMember.nome} required/>
          <PhoneField defaultValue={draft.telefone ?? formatPhone(editableMember.telefone)}/>
          <Field label="E-mail (opcional)" name="email" type="email" autoComplete="email" defaultValue={draft.email ?? editableMember.email ?? ""}/>
          <CityField defaultValue={draft.municipio ?? editableMember.municipio}/>
          <Field label="Bairro ou comunidade" name="bairro" defaultValue={draft.bairro ?? editableMember.bairro} required/>
          <label>Tipo de pessoa<select value={type} onChange={(event)=>setType(event.target.value as Role)} name="type"><option value="participante">Apoiador</option><option value="lideranca">Liderança principal</option><option value="mobilizador">Mobilizador / pequena liderança</option></select></label>
        </div></fieldset>
        <fieldset className="form-section span-2"><legend>Vínculo e meta</legend><p>Organize a posição deste cadastro na rede.</p><div className="form-section-grid">
          <label>Liderança de referência<select name="parentId" defaultValue={draft.parentId ?? editableMember.parentId ?? ""}><option value="">Sem liderança</option>{leaderOptions.map((leader)=><option value={leader.id} key={leader.id}>{leader.nome}</option>)}</select></label>
          {type === "lideranca" && <label className="check"><input type="checkbox" name="needsCandidateMeeting" defaultChecked={draft.needsCandidateMeeting !== undefined ? draft.needsCandidateMeeting === "true" : editableMember.needsCandidateMeeting}/><span>Esta liderança precisa de reunião com a candidata.</span></label>}
          {type !== "participante" && <><Field label="Capacidade estimada" name="capacity" type="number" min="1" defaultValue={draft.capacity ?? editableMember.estimatedCapacity ?? 1} required/><Field label="Meta inicial acordada" name="goal" type="number" min="1" defaultValue={draft.goal ?? editableMember.agreedGoal ?? 10} required/></>}
        </div></fieldset>
        <fieldset className="form-section span-2"><legend>Observações</legend><label>Informações adicionais<textarea name="notes" rows={3} defaultValue={draft.notes ?? editableMember.notes ?? ""}/></label></fieldset>
        {error && <div className="form-message span-2" role="alert">{error}</div>}
        <div className="form-actions span-2"><button type="button" className="secondary" onClick={()=>navigate(-1)} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</button></div>
      </form>
    </section>
  </>;
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...rest } = props;
  return (
    <label>
      {label}
      <input {...rest} />
    </label>
  );
}

function PhoneField({ defaultValue }: { defaultValue?: string } = {}) {
  const [error, setError] = useState("");
  function validate(input: HTMLInputElement, showError: boolean) {
    const digits = normalizePhone(input.value), valid = digits.length === 10 || digits.length === 11;
    input.setCustomValidity(valid ? "" : "Informe o DDD e um telefone com 10 ou 11 números.");
    if (showError) setError(valid ? "" : "Informe o DDD e um telefone com 10 ou 11 números.");
  }
  return <label>
    Telefone ou WhatsApp
    <input
      name="telefone"
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="(81) 99999-9999"
      maxLength={15}
      pattern={brazilianPhonePattern}
      title="Informe o DDD e um telefone com 10 ou 11 números."
      defaultValue={defaultValue}
      aria-describedby={error ? "telefone-error" : undefined}
      aria-invalid={Boolean(error)}
      onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); setError(""); validate(event.currentTarget, false); }}
      onBlur={(event) => validate(event.currentTarget, Boolean(event.currentTarget.value))}
      onInvalid={(event) => validate(event.currentTarget, true)}
      required
    />
    {error && <small id="telefone-error" className="field-error" role="alert">{error}</small>}
  </label>;
}

function CityField({ defaultValue = "Recife" }: { defaultValue?: string } = {}) {
  return <label>
    Cidade
    <input name="municipio" list="pe-municipalities" defaultValue={defaultValue} required autoComplete="address-level2" placeholder="Pesquise uma cidade de Pernambuco" />
    <datalist id="pe-municipalities">{peMunicipalities.map((city) => <option value={city} key={city}/>)}</datalist>
  </label>;
}

export function LeaderDetail({ data, setData, user }: MappingProps) {
  const { id } = useParams(),
    navigate = useNavigate(),
    m = data.find((x) => x.id === id),
    [tab, setTab] = useState("resumo"),
    [notice, setNotice] = useState(""),
    [activities, setActivities] = useState<ActivityItem[]>([]),
    [credentials, setCredentials] = useState<{username:string;password:string}|null>(null),
    [busyAction, setBusyAction] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    loadActivities(id).then(setActivities).catch(() => setNotice("Não foi possível carregar as atividades."));
  }, [id]);
  if (!m)
    return (
      <Head
        title="Pessoa não encontrada"
        description="O registro solicitado não existe."
      />
    );
  const member = m;
  const direct = directMembers(data, member.id),
    confirmedDirect = direct.filter(confirmed).length,
    goal = m.agreedGoal ?? 10;
  async function act(kind: string) {
    if (kind === "ativar") {
      if (isSupabaseConfigured) {
        const saved = await updateMember(member.id, { registration_status:"pronto_ativacao", activation_ready_at:new Date().toISOString() });
        setData((s) => s.map((x) => x.id === member.id ? saved : x));
      } else setData((s) => prepareActivation(s, member.id));
      setNotice("Registro preparado. Nenhum convite foi enviado.");
    }
    if (kind === "validar") {
      if (isSupabaseConfigured) {
        const saved = await updateMember(member.id, { link_status:"confirmado_pessoa", last_reviewed_at:new Date().toISOString() });
        setData((s) => s.map((x) => x.id === member.id ? saved : x));
      } else setData((s) => s.map((x) => x.id === member.id ? { ...x, linkStatus: "confirmado_pessoa" } : x));
      setNotice("Vínculo marcado como validado e registrado no histórico.");
    }
    if (kind === "adicionar") navigate("/cadastro-rapido");
    if (kind === "contato" && user) {
      try {
        const activity = isSupabaseConfigured
          ? await createActivity(member.id, user.profileId, "Contato registrado pela equipe.")
          : { id:crypto.randomUUID(), type:"contato", description:"Contato registrado pela equipe.", occurredAt:new Date().toISOString() };
        setActivities((current) => [activity, ...current]);
        setNotice("Contato registrado com responsável e horário.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar o contato."); }
    }
    if (kind === "gerar-link") {
      setBusyAction(kind); setNotice("Gerando link seguro…");
      try {
        const code = isSupabaseConfigured && user ? await createCollectionLink(member.id) : member.collectionCode ?? `BASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        setData((s) => s.map((x) => x.id === member.id ? { ...x, collectionCode: code } : x));
        setNotice("Novo link seguro gerado. O anterior foi revogado; copie este link agora.");
      } catch (error) {
        setNotice(error instanceof Error ? `Não foi possível gerar o link: ${error.message}` : "Não foi possível gerar o link da base.");
      } finally { setBusyAction(""); }
    }
    if (kind === "gerar-acesso") {
      setBusyAction(kind); setNotice("Gerando acesso da liderança…");
      try {
        let result: { username:string;temporaryPassword:string };
        if (isSupabaseConfigured) result = await createLeadershipAccess(member.id);
        else {
          const base = member.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
          result = { username:`${base}.${member.id.slice(0, 4)}`, temporaryPassword:`R10-${crypto.randomUUID().slice(0, 8)}!` };
        }
        setData((s) => s.map((x) => x.id === member.id ? { ...x, hasLogin:true, accessUsername:result.username, registrationStatus:"ativado" } : x));
        setCredentials({ username:result.username, password:result.temporaryPassword });
        setNotice("Acesso gerado. A senha temporária é exibida apenas agora.");
      } catch (error) {
        setNotice(error instanceof Error ? `Não foi possível gerar o acesso: ${error.message}` : "Não foi possível gerar o acesso.");
      } finally { setBusyAction(""); }
    }
  }
  const collectionUrl = member.collectionCode ? `${location.origin}/coleta/${member.collectionCode}` : "";
  return (
    <>
      <Head
        title={m.nome}
        description={`${m.role === "lideranca" ? "Liderança principal" : m.role === "mobilizador" ? "Mobilizador" : "Apoiador"} · ${m.bairro}, ${m.municipio}`}
        action={
          <button
            className="secondary"
            onClick={() => navigate(`/cadastros/${member.id}/editar`)}
          >
            <Pencil />
            Editar dados
          </button>
        }
      />
      <div className="profile-strip">
        <div className="avatar large">
          {m.nome
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)}
        </div>
        <div>
          <Pill tone={member.hasLogin ? "green" : "warning"}>{member.hasLogin ? "Acesso ativo" : "Sem conta de acesso"}</Pill>
          <span>{regLabels[member.registrationStatus ?? "pendente_revisao"]} · {member.bairro}</span>
        </div>
        <button className="secondary" onClick={() => act("ativar")}>
          <UserCheck />
          Preparar ativação futura
        </button>
        <button className="primary" onClick={() => act("gerar-acesso")} disabled={Boolean(busyAction)}>
          <KeyRound />
          {busyAction === "gerar-acesso" ? "Gerando…" : member.hasLogin ? "Gerar nova senha" : "Gerar login"}
        </button>
      </div>
      {notice && (
        <div className="form-message" role="status">
          {notice}
        </div>
      )}
      {credentials && <section className="credentials-card"><div><KeyRound/><span><b>Acesso da liderança</b><small>Copie e entregue por canal seguro.</small></span></div><label>Login<code>{credentials.username}</code></label><label>Senha temporária<code>{credentials.password}</code></label><button className="secondary" onClick={() => { navigator.clipboard?.writeText(`Login: ${credentials.username}\nSenha: ${credentials.password}`); setNotice("Credenciais copiadas."); }}><Copy/>Copiar credenciais</button></section>}
      {collectionUrl && (
        <section className="collection-link-card">
          <div><b>Link para cadastro da base</b><span>A liderança pode adicionar apoiadores vinculados a ela, sem login.</span></div>
          <code>{collectionUrl}</code>
          <button className="secondary" onClick={() => { navigator.clipboard?.writeText(collectionUrl); setNotice("Link copiado."); }}><Copy/>Copiar link</button>
        </section>
      )}
      <nav className="tabs" aria-label="Seções da liderança">
        {["resumo", "vinculos", "dados", "atividades", "historico"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "resumo" && (
        <>
          <section className="leader-indicators">
            <Stat
              label="Capacidade estimada"
              value={m.estimatedCapacity ?? 0}
              hint="estimativa, não resultado"
            />
            <Stat label="Meta acordada" value={goal} />
            <Stat label="Pessoas cadastradas" value={direct.length} />
            <Stat label="Pessoas confirmadas" value={confirmedDirect} />
            <Stat
              label="Realização da meta"
              value={`${realization(confirmedDirect, goal)}%`}
              tone="lime"
            />
          </section>
          <section className="leader-progress-card" aria-label={`Progresso da meta: ${confirmedDirect} de ${goal}`}>
            <div><b>Progresso da meta</b><span>{confirmedDirect} de {goal} pessoas confirmadas</span></div><strong>{realization(confirmedDirect, goal)}%</strong>
            <div className="progress"><i style={{width:`${Math.min(realization(confirmedDirect, goal),100)}%`}}/></div>
          </section>
          <div className="two-col">
            <section className="card">
              <h2>Ações da liderança</h2>
              <div className="action-grid">
                <button onClick={() => act("adicionar")}>
                  <Plus />
                  Adicionar apoiador
                </button>
                <button onClick={() => act("adicionar")}>
                  <Users />
                  Adicionar pequena liderança
                </button>
                <button onClick={() => navigate("/importar")}>
                  <Upload />
                  Importar lista
                </button>
                <button onClick={() => act("gerar-link")} disabled={Boolean(busyAction)}>
                  <Copy />
                  {busyAction === "gerar-link" ? "Gerando…" : member.collectionCode ? "Gerar novo link da base" : "Gerar link da base"}
                </button>
                <button onClick={() => act("validar")}>
                  <ClipboardCheck />
                  Validar vínculo
                </button>
                  <button onClick={() => act("contato")}>
                  <History />
                  Registrar contato
                </button>
                <button
                  onClick={() =>
                    setNotice(
                      "Transferência pronta para seleção da nova liderança.",
                    )
                  }
                >
                  <ArrowRightLeft />
                  Transferir pessoa
                </button>
              </div>
            </section>
            <details className="card secondary-details"><summary>Informações complementares</summary><div className="secondary-metrics"><Stat label="Pequenas lideranças" value={direct.filter((x) => x.role === "mobilizador").length}/><Stat label="Ativadas com login" value={direct.filter((x) => x.hasLogin).length}/></div><h2>Qualidade da estimativa</h2><dl className="detail-list"><div><dt>Confiança</dt><dd>{m.confidence ?? "Não revisada"}</dd></div><div><dt>Como foi obtida</dt><dd>{m.estimateMethod ?? "Não informado"}</dd></div><div><dt>Última revisão</dt><dd>{m.lastReview ?? "Pendente"}</dd></div><div><dt>Prazo da meta</dt><dd>{m.goalDeadline ?? "A combinar"}</dd></div></dl></details>
          </div>
        </>
      )}
      {tab === "vinculos" && (
        <section className="card">
          <div className="table-wrap">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Tipo</th>
                  <th>Cadastro</th>
                  <th>Vínculo</th>
                  <th>Acesso</th>
                </tr>
              </thead>
              <tbody>
                {direct.map((x) => (
                  <tr key={x.id}>
                    <td data-label="Pessoa">
                      <b>{x.nome}</b>
                      <small>{x.telefone}</small>
                    </td>
                    <td data-label="Tipo">{x.role}</td>
                    <td data-label="Cadastro">
                      {regLabels[x.registrationStatus ?? "pendente_revisao"]}
                    </td>
                    <td data-label="Vínculo">{linkLabels[x.linkStatus ?? "nao_informado"]}</td>
                    <td data-label="Acesso">{x.hasLogin ? "Com login" : "Sem login"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "dados" && (
        <section className="card">
          <dl className="detail-list">
            <div>
              <dt>Telefone</dt>
              <dd>{m.telefone}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{m.email ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Coordenador</dt>
              <dd>{m.coordinator ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{m.source ?? "Não informada"}</dd>
            </div>
            <div>
              <dt>Contato autorizado</dt>
              <dd>{m.contactAuthorized ? "Sim" : "Não presumido"}</dd>
            </div>
            <div>
              <dt>Reunião com a candidata</dt>
              <dd>{m.needsCandidateMeeting ? "Solicitada" : "Não solicitada"}</dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd>{m.notes ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      {tab === "atividades" && (
        <section className={`card ${activities.length ? "timeline" : "empty"}`}>
          {activities.length ? activities.map((activity) => <div key={activity.id}><b>{activity.description ?? activity.type}</b><span>{new Date(activity.occurredAt).toLocaleString("pt-BR")}</span></div>) : "Nenhuma atividade registrada. Use “Registrar contato” para adicionar."}
        </section>
      )}
      {tab === "historico" && (
        <section className="card timeline">
          <div>
            <b>Última atualização registrada</b>
            <span>{new Date(m.lastActivity + "T12:00").toLocaleDateString("pt-BR")}</span>
          </div>
          <div>
            <b>Cadastro criado</b>
            <span>{new Date(m.joinedAt + "T12:00").toLocaleDateString("pt-BR")} · {m.source ?? "Origem não informada"}</span>
          </div>
        </section>
      )}
    </>
  );
}

export function ImportPage({ data, setData }: MappingProps) {
  const [rows, setRows] = useState<CsvRow[]>([]),
    [name, setName] = useState(""),
    [step, setStep] = useState(1),
    [report, setReport] = useState<{
      ok: number;
      review: number;
      rejected: number;
    } | null>(null),
    [reference, setReference] = useState("");
  async function load(file?: File) {
    if (!file) return;
    setName(file.name);
    setRows(parseCsv(await file.text()));
    setStep(2);
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const analyzed = rows.map((r) => ({
    row: r,
    invalid: normalizePhone(r.telefone ?? "").length < 10,
    duplicate: data.some(
      (m) => normalizePhone(m.telefone) === normalizePhone(r.telefone ?? ""),
    ),
  }));
  async function finish() {
    const valid = analyzed.filter((r) => !r.invalid && !r.duplicate);
    const pending: Array<Omit<Member,'id'|'joinedAt'|'lastActivity'|'inviteCode'|'hasLogin'>> = valid.map((r, i) => ({
          nome: r.row.nome || `Registro ${i + 1}`,
          telefone: r.row.telefone,
          municipio: r.row.municipio || "Não informado",
          bairro: r.row.bairro || "Não informado",
          role: "participante",
          parentId: reference || undefined,
          status: "cadastrado",
          registrationStatus: "importado",
          linkStatus: "informado_lideranca",
          source: `Importação: ${name}`,
        }));
    try {
      const saved = isSupabaseConfigured ? await bulkCreateMembers(pending) : pending.map((m) => ({ ...m, id:crypto.randomUUID(), joinedAt:new Date().toISOString().slice(0,10), lastActivity:new Date().toISOString().slice(0,10), inviteCode:"", hasLogin:false } as Member));
      setData((s) => [...s, ...saved]);
    } catch {
      setReport({ ok:0, review:analyzed.filter((r)=>r.duplicate).length, rejected:analyzed.filter((r)=>r.invalid).length + valid.length });
      setStep(3);
      return;
    }
    setReport({
      ok: valid.length,
      review: analyzed.filter((r) => r.duplicate).length,
      rejected: analyzed.filter((r) => r.invalid).length,
    });
    setStep(3);
  }
  return (
    <>
      <Head
        title="Importar base existente"
        description="CSV com prévia, validação e fila de revisão. Nenhum convite será enviado."
      />
      <div className="import-steps">
        <span className={step >= 1 ? "active" : ""}>1. Arquivo</span>
        <span className={step >= 2 ? "active" : ""}>
          2. Revisar e relacionar
        </span>
        <span className={step >= 3 ? "active" : ""}>3. Relatório</span>
      </div>
      {step === 1 && (
        <section className="card upload-zone">
          <FileSpreadsheet />
          <h2>Selecione um arquivo CSV</h2>
          <p>
            Use cabeçalhos como nome, telefone, município, bairro e liderança.
          </p>
          <label className="primary">
            Escolher CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => load(e.target.files?.[0])}
            />
          </label>
          <small>
            XLSX ficará para a próxima etapa; CSV evita processamento opaco e
            permite validação linha a linha.
          </small>
        </section>
      )}
      {step === 2 && (
        <>
          <section className="card mapping-options">
            <div>
              <b>Base</b>
              <span>
                {name} · {rows.length} registros
              </span>
            </div>
            <label>
              Liderança para toda a importação
              <select
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              >
                <option value="">
                  Identificar por coluna / sem referência
                </option>
                {leaders(data).map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <b>Colunas detectadas</b>
              <span>{cols.join(", ")}</span>
            </div>
          </section>
          <section className="card">
            <div className="table-wrap">
              <table className="responsive-table import-table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Município</th>
                    <th>Bairro</th>
                    <th>Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {analyzed.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td data-label="Linha">{i + 2}</td>
                      <td data-label="Nome">{r.row.nome || <em>ausente</em>}</td>
                      <td data-label="Telefone">{r.row.telefone || <em>ausente</em>}</td>
                      <td data-label="Município">{r.row.municipio || "—"}</td>
                      <td data-label="Bairro">{r.row.bairro || "—"}</td>
                      <td data-label="Validação">
                        {r.invalid ? (
                          <Pill tone="danger">Telefone inválido</Pill>
                        ) : r.duplicate ? (
                          <Pill tone="warning">Possível duplicidade</Pill>
                        ) : (
                          <Pill tone="green">Pronto</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button className="secondary" onClick={() => setStep(1)}>
                Voltar
              </button>
              <button className="primary" onClick={finish}>
                Confirmar importação
              </button>
            </div>
          </section>
        </>
      )}
      {step === 3 && report && (
        <section className="card import-report">
          <CheckCircle2 />
          <h2>Importação processada</h2>
          <div className="map-stats">
            <Stat label="Importados" value={report.ok} tone="green" />
            <Stat
              label="Pendentes de revisão"
              value={report.review}
              tone="warning"
            />
            <Stat label="Rejeitados" value={report.rejected} />
          </div>
          <p>
            A base “{name}” foi registrada com data, responsável e origem. O
            processamento é atômico: em caso de erro, nenhum registro válido é
            gravado parcialmente.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setRows([]);
              setStep(1);
              setReport(null);
            }}
          >
            Importar outra base
          </button>
        </section>
      )}
    </>
  );
}

export function Duplicates({ data, user }: MappingProps) {
  const [reviews, setReviews] = useState<DuplicateReview[]>([]),
    [loading, setLoading] = useState(isSupabaseConfigured),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    loadDuplicateReviews().then(setReviews).catch(() => setMessage("Não foi possível carregar a fila de duplicidades.")).finally(() => setLoading(false));
  }, []);
  const review = reviews[0], base = review ? data.find((m) => m.id === review.memberAId) : undefined,
    candidate = review ? data.find((m) => m.id === review.memberBId) : undefined;
  async function resolve(status: Exclude<DuplicateReview['status'], 'pendente'>) {
    if (!review || !user?.profileId) return;
    try {
      await resolveDuplicateReview(review.id, status, user.profileId, `Resolvido como ${status} pela interface administrativa.`);
      setReviews((current) => current.filter((item) => item.id !== review.id));
      setMessage("Conflito resolvido e registrado no histórico.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível resolver o conflito."); }
  }
  return (
    <>
      <Head
        title="Revisão de duplicidades"
        description="Conflitos nunca são excluídos ou unificados automaticamente."
      />
      {message && <div className="form-message" role="status">{message}</div>}
      {loading ? (
        <section className="card"><p>Carregando fila…</p></section>
      ) : !review || !base || !candidate ? (
        <section className="card success-inline">
          <CheckCircle2 />
          <div>
            <h2>Nenhuma duplicidade pendente</h2>
            <p>A fila de revisão está em dia.</p>
          </div>
        </section>
      ) : (
        <section className="duplicate-card">
          <div className="card">
            <Pill tone="warning">Registro existente</Pill>
            <h2>{base.nome}</h2>
            <p>
              {base.telefone}
              <br />
              {base.bairro} · {base.municipio}
              <br />
              Origem: {base.source ?? "Cadastro manual"}
            </p>
          </div>
          <div className="duplicate-vs">
            <AlertTriangle />
            <span>Mesmo telefone normalizado</span>
          </div>
          <div className="card">
            <Pill tone="danger">Registro importado</Pill>
            <h2>{candidate.nome}</h2>
            <p>
              {candidate.telefone}
              <br />
              {candidate.bairro} · {candidate.municipio}
              <br />
              Origem: {candidate.source ?? "Cadastro manual"}
            </p>
          </div>
          <div className="duplicate-actions">
            <button className="primary" onClick={() => resolve("unificado")} disabled={user?.role !== "administrador"}>
              Unificar cadastros
            </button>
            <button className="secondary" onClick={() => resolve("separados")} disabled={user?.role !== "administrador"}>
              Manter separados
            </button>
            <button
              className="secondary"
              onClick={() => resolve("transferido")}
              disabled={user?.role !== "administrador"}
            >
              Transferir liderança
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function PublicCollection({ data, setData }: MappingProps) {
  const { code } = useParams();
  const localLeader = data.find((m) => m.collectionCode === code && (m.role === "lideranca" || m.role === "mobilizador"));
  const [context, setContext] = useState<{leaderId:string;leaderName:string}|null>(localLeader ? {leaderId:localLeader.id,leaderName:localLeader.nome} : null);
  const [loading, setLoading] = useState(isSupabaseConfigured), [message, setMessage] = useState(""), [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured || !code) return;
    getCollectionContext(code).then(setContext).catch(()=>setContext(null)).finally(()=>setLoading(false));
  }, [code]);
  if (loading) return <main className="public-form success"><h1>Validando link…</h1></main>;
  if (!context) return <main className="public-form success"><AlertTriangle/><h1>Link indisponível</h1><p>Este link de cadastro não existe ou foi desativado. Solicite um novo link à coordenação.</p></main>;
  const activeContext = context;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const candidate = { nome: String(f.get("nome")), telefone: String(f.get("telefone")), bairro: String(f.get("bairro")) };
    if (!isSupabaseConfigured && duplicateCandidates(candidate, data).length) { setMessage("Este telefone ou cadastro já consta na base. Nenhum registro duplicado foi criado."); return; }
    try {
      if (isSupabaseConfigured && code) await submitCollection(code,{ nome:candidate.nome, telefone:candidate.telefone, email:String(f.get("email")), municipio:String(f.get("municipio")), bairro:candidate.bairro, notes:String(f.get("notes")), contactAuthorized:Boolean(f.get("contactAuthorized")) });
      else {
        const now = new Date().toISOString().slice(0, 10);
        setData((s) => [...s, { id: crypto.randomUUID(), nome:candidate.nome, telefone:candidate.telefone, email:String(f.get("email"))||undefined, municipio:String(f.get("municipio")), bairro:candidate.bairro, parentId:activeContext.leaderId, role:"participante", status:"cadastrado", registrationStatus:"pendente_revisao", linkStatus:"informado_lideranca", source:`Link de base — ${activeContext.leaderName}`, contactAuthorized:Boolean(f.get("contactAuthorized")), notes:String(f.get("notes")), joinedAt:now, lastActivity:now, inviteCode:"", hasLogin:false }]);
      }
      setSaved((n)=>n+1); setMessage("Pessoa adicionada à base para revisão da coordenação."); form.reset();
    } catch (reason) { const detail=reason instanceof Error?reason.message:"Não foi possível enviar."; setMessage(detail.includes("Cadastro ja existente")?"Este telefone já consta na base.":detail); }
  }
  return <main className="public-form collection-public"><div className="brand"><span className="brand-mark">40180</span><span><b>TIME 40180</b><small>Cadastro de base</small></span></div><span className="eyebrow">Base de {activeContext.leaderName}</span><h1>Adicionar pessoa</h1><p>Use este formulário para informar pessoas da sua base. O registro não cria login, não representa voto e será revisado pela coordenação.</p><div className="collection-counter"><Users/><span><b>{saved}</b> adicionada(s) nesta sessão</span></div><form onSubmit={submit} className="stack"><Field label="Nome completo" name="nome" required/><PhoneField/><Field label="E-mail (opcional)" name="email" type="email"/><div className="form-row"><CityField/><Field label="Bairro ou comunidade" name="bairro" required/></div><label>Observação<textarea name="notes" rows={3}/></label><label className="check"><input type="checkbox" name="contactAuthorized"/><span>A pessoa autorizou contato pela equipe. Deixe desmarcado se não houver autorização.</span></label>{message&&<div className="form-message" role="status">{message}</div>}<button className="primary">Adicionar à base de {activeContext.leaderName.split(" ")[0]}</button></form></main>;
}

export function TeamUsers({ user }: { user: SessionUser }) {
  const [users, setUsers] = useState<TeamUser[]>([]),
    [loading, setLoading] = useState(true),
    [busyAction, setBusyAction] = useState(""),
    [message, setMessage] = useState(""),
    [credentials, setCredentials] = useState<{username:string;password:string}|null>(null);
  async function refresh() {
    setLoading(true);
    try { setUsers(await loadTeamUsers()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível carregar a equipe."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    loadTeamUsers()
      .then((result) => { if (active) setUsers(result); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Não foi possível carregar a equipe."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage(""); setCredentials(null);
    const form = e.currentTarget, values = new FormData(form);
    try {
      const result = await createTeamUser({ name:String(values.get("name")), login:String(values.get("login")), role:String(values.get("role")) as 'administrador'|'cadastrador' });
      setCredentials({ username:result.username, password:result.temporaryPassword });
      setMessage("Usuário criado. Copie a senha temporária agora; ela não será exibida novamente.");
      form.reset(); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível criar o usuário."); }
  }
  async function changeRole(profileId:string, role:'administrador'|'cadastrador') {
    setMessage(""); setBusyAction(`role:${profileId}`);
    try { await changeTeamUserRole(profileId,role); setMessage("Perfil atualizado e registrado na auditoria."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível alterar o perfil."); }
    finally { setBusyAction(""); }
  }
  async function manage(teamUser: TeamUser, action: 'reset'|'status'|'delete') {
    const isActive = teamUser.status !== "bloqueado";
    const prompt = action === "reset"
      ? `Gerar uma nova senha temporária para ${teamUser.name}?`
      : action === "delete"
        ? `Excluir o acesso de ${teamUser.name}? O histórico dos cadastros será preservado.`
        : `${isActive ? "Inativar" : "Reativar"} o acesso de ${teamUser.name}?`;
    if (!window.confirm(prompt)) return;
    setBusyAction(`${action}:${teamUser.id}`); setMessage(""); setCredentials(null);
    try {
      if (action === "reset") {
        const result = await resetTeamUserPassword(teamUser.id);
        setCredentials({ username:result.username, password:result.temporaryPassword });
        setMessage("Nova senha temporária gerada. Copie agora; ela não será exibida novamente.");
      } else if (action === "delete") {
        await deleteTeamUser(teamUser.id);
        setMessage(`Acesso de ${teamUser.name} excluído. O histórico foi preservado.`);
      } else {
        await setTeamUserActive(teamUser.id, !isActive);
        setMessage(`Acesso de ${teamUser.name} ${isActive ? "inativado" : "reativado"}.`);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusyAction("");
    }
  }
  return <>
    <Head title="Usuários da equipe" description={user.isSuperAdmin ? "Você é o Administrador geral e pode gerenciar acessos e senhas da equipe." : "Crie acessos para cadastradores ou conceda visão administrativa completa."}/>
    {message&&<div className="form-message" role="status">{message}</div>}
    <div className="two-col team-users-layout">
      <section className="card"><h2>Criar usuário</h2><p>O usuário receberá uma senha temporária e deverá trocá-la no primeiro acesso.</p><form className="stack" onSubmit={submit}><Field label="Nome da pessoa" name="name" required/><Field label="Nome de usuário ou e-mail" name="login" required placeholder="Ex.: maria.silva ou maria@exemplo.com"/><label>Perfil<select name="role" defaultValue="cadastrador"><option value="cadastrador">Cadastrador — vê somente o que cadastrar</option><option value="administrador">Administrador — vê toda a base</option></select></label><button className="primary"><KeyRound/>Criar acesso</button></form>{credentials&&<div className="credentials-card"><label>Login<code>{credentials.username}</code></label><label>Senha temporária<code>{credentials.password}</code></label><button className="secondary" onClick={()=>navigator.clipboard?.writeText(`Login: ${credentials.username}\nSenha: ${credentials.password}`)}><Copy/>Copiar credenciais</button></div>}</section>
      <section className="card team-list"><div className="section-head"><div><h2>Equipe com acesso</h2><p>{users.length} usuário(s) cadastrado(s).</p></div></div>{loading?<div className="empty" aria-live="polite">Carregando equipe…</div>:<div className="table-wrap"><table className="responsive-table team-table"><thead><tr><th>Pessoa</th><th>Login</th><th>Perfil</th><th>Situação</th>{user.isSuperAdmin&&<th>Ações</th>}</tr></thead><tbody>{users.map((teamUser)=><tr key={teamUser.id}><td data-label="Pessoa"><b>{teamUser.name}{teamUser.isSuperAdmin&&<Pill tone="green">Geral</Pill>}</b><small>Desde {new Date(teamUser.createdAt).toLocaleDateString("pt-BR")}</small></td><td data-label="Login">{teamUser.username ?? teamUser.email ?? "—"}</td><td data-label="Perfil"><select aria-label={`Perfil de ${teamUser.name}`} value={teamUser.role} disabled={teamUser.isSuperAdmin||busyAction===`role:${teamUser.id}`} onChange={(e)=>void changeRole(teamUser.id,e.target.value as 'administrador'|'cadastrador')}><option value="cadastrador">Cadastrador</option><option value="administrador">Administrador</option></select></td><td data-label="Situação"><Pill tone={teamUser.status==="bloqueado"?"warning":"green"}>{teamUser.status==="bloqueado"?"Inativo":"Ativo"}</Pill></td>{user.isSuperAdmin&&<td data-label="Ações"><div className="team-actions"><button className="team-action" disabled={Boolean(busyAction)} onClick={()=>void manage(teamUser,"reset")}><KeyRound/>Resetar senha</button>{!teamUser.isSuperAdmin&&<><button className="team-action" disabled={Boolean(busyAction)} onClick={()=>void manage(teamUser,"status")}><Power/>{teamUser.status==="bloqueado"?"Reativar":"Inativar"}</button><button className="team-action danger" disabled={Boolean(busyAction)} onClick={()=>void manage(teamUser,"delete")}><Trash2/>Excluir</button></>}</div></td>}</tr>)}</tbody></table></div>}</section>
    </div>
  </>;
}

export function ModeSettings({user}:{user:SessionUser}) {
  const [mode, setMode] = useState<"mapeamento" | "mobilizacao">("mobilizacao"), [message,setMessage]=useState("");
  useEffect(()=>{ if(isSupabaseConfigured) loadOperatingMode().then(setMode).catch(()=>setMessage("Não foi possível carregar a configuração.")); },[]);
  async function changeMode(next:'mapeamento'|'mobilizacao') { try { if(isSupabaseConfigured) await saveOperatingMode(next,user.profileId); setMode(next); setMessage("Configuração salva."); } catch(reason){setMessage(reason instanceof Error?reason.message:"Não foi possível salvar.");} }
  return (
    <>
      <Head
        title="Configuração da etapa"
        description="Controle a liberação de acessos e links para as lideranças."
      />
      <section className="card setting-card">
        <Settings2 />
        <div>
          <h2>Modo operacional</h2>
          <p>
            Em Mobilização, a administração pode gerar login para lideranças e
            links seguros para que elas cadastrem suas bases.
          </p>
        </div>
        <label>
          <input
            type="radio"
            checked={mode === "mapeamento"}
            onChange={() => void changeMode("mapeamento")}
          />
          <span>
            <b>Mapeamento</b>
            <small>Pausa a geração operacional de novos acessos e links</small>
          </span>
        </label>
        {message&&<div className="form-message" role="status">{message}</div>}
        <label>
          <input
            type="radio"
            checked={mode === "mobilizacao"}
            onChange={() => void changeMode("mobilizacao")}
          />
          <span>
            <b>Mobilização</b>
            <small>Logins de lideranças e links de cadastro liberados</small>
          </span>
        </label>
        <div className="mode-checklist">
          <b>Controles disponíveis na etapa ativa</b>
          <span>
            <CheckCircle2 />
            Selecionar lideranças validadas
          </span>
          <span>
            <CheckCircle2 />
            Vincular cadastro existente a uma conta
          </span>
          <span>
            <CheckCircle2 />
            Preservar apoiadores e vínculos
          </span>
          <span>
            <CheckCircle2 />
            Gerar convite e link pessoal após liberação
          </span>
        </div>
      </section>
    </>
  );
}
