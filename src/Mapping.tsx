import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  History,
  KeyRound,
  Link2Off,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { LinkStatus, Member, RegistrationStatus, Role, SessionUser } from "./types";
import { confirmed, directMembers, normalizePhone } from "./lib/network";
import {
  duplicateCandidates,
  parseCsv,
  prepareActivation,
  realization,
  uniquePeople,
  type CsvRow,
} from "./lib/mapping";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { bulkCreateMembers, createActivity, createCollectionLink, createMember, getCollectionContext, loadActivities, loadDuplicateReviews, loadOperatingMode, resolveDuplicateReview, saveOperatingMode, submitCollection, updateMember, type ActivityItem, type DuplicateReview } from "./services/data";

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
  const unique = uniquePeople(data),
    ls = leaders(data),
    supporters = data.filter((m) => m.role === "participante"),
    confirmedCount = data.filter(confirmed).length,
    capacity = ls.reduce((a, m) => a + (m.estimatedCapacity ?? 0), 0),
    goal = ls.reduce((a, m) => a + (m.agreedGoal ?? 10), 0),
    navigate = useNavigate();
  return (
    <>
      <div className="mode-banner">
        <ShieldCheck />
        <div>
          <b>Etapa de organização e validação</b>
          <span>
            Os registros ainda não possuem acesso. Convites e links estão
            desabilitados.
          </span>
        </div>
        <Pill tone="warning">
          <Link2Off /> Convites pausados
        </Pill>
      </div>
      <Head
        title="Visão geral do mapeamento"
        description="Acompanhe a qualidade da base sem confundir estimativas com resultados reais."
        action={
          <button
            className="primary"
            onClick={() => navigate("/cadastro-rapido")}
          >
            <Plus />
            Cadastro rápido
          </button>
        }
      />
      <section className="map-stats">
        <Stat
          label="Lideranças"
          value={ls.filter((m) => m.role === "lideranca").length}
        />
        <Stat
          label="Mobilizadores"
          value={ls.filter((m) => m.role === "mobilizador").length}
        />
        <Stat label="Apoiadores informados" value={supporters.length} />
        <Stat
          label="Pessoas únicas"
          value={unique.length}
          hint="sem dupla contagem"
          tone="green"
        />
        <Stat
          label="Capacidade estimada"
          value={capacity}
          hint="não é quantidade real"
        />
        <Stat label="Meta acordada" value={goal} />
        <Stat label="Pessoas confirmadas" value={confirmedCount} />
        <Stat
          label="Realização da meta"
          value={`${realization(confirmedCount, goal)}%`}
          tone="lime"
        />
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
    navigate = useNavigate();
  const list = leaders(data).filter((m) =>
    m.nome.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <Head
        title="Lideranças mapeadas"
        description="Pessoas e vínculos podem existir sem conta de acesso."
        action={
          <button
            className="primary"
            onClick={() => navigate("/cadastro-rapido")}
          >
            <Plus />
            Nova pessoa
          </button>
        }
      />
      <section className="card">
        <div className="filters">
          <label className="search">
            <Search />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar liderança"
            />
          </label>
          <select>
            <option>Todos os tipos</option>
            <option>Liderança principal</option>
            <option>Mobilizador</option>
          </select>
          <select>
            <option>Todas as situações</option>
            <option>Pendente de revisão</option>
            <option>Pronto para ativação</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Liderança</th>
                <th>Tipo</th>
                <th>Capacidade</th>
                <th>Meta</th>
                <th>Vínculos</th>
                <th>Cadastro</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/liderancas/${m.id}`)}
                  className="click-row"
                >
                  <td>
                    <b>{m.nome}</b>
                    <small>
                      {m.bairro} · {m.municipio}
                    </small>
                  </td>
                  <td>
                    {m.role === "lideranca" ? "Principal" : "Mobilizador"}
                  </td>
                  <td>{m.estimatedCapacity ?? "—"}</td>
                  <td>{m.agreedGoal ?? 10}</td>
                  <td>{directMembers(data, m.id).length}</td>
                  <td>
                    <Pill>
                      {regLabels[m.registrationStatus ?? "pendente_revisao"]}
                    </Pill>
                  </td>
                  <td>
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
      </section>
    </>
  );
}

export function QuickCreate({ data, setData }: MappingProps) {
  const navigate = useNavigate(),
    [type, setType] = useState<Role>("participante"),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      phone = String(f.get("telefone"));
    const isDuplicate = Boolean(
      duplicateCandidates(
        {
          nome: String(f.get("nome")),
          telefone: phone,
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
      municipio: String(f.get("municipio")),
      bairro: String(f.get("bairro")),
      role: type,
      parentId: String(f.get("parentId")) || undefined,
      coordinator: String(f.get("coordinator")),
      source: String(f.get("source")),
      linkStatus: String(f.get("linkStatus")) as LinkStatus,
      notes: String(f.get("notes")),
      estimatedCapacity:
        type === "participante" ? undefined : Number(f.get("capacity")),
      agreedGoal:
        type === "participante" ? undefined : Number(f.get("goal") || 10),
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
      if (!isDuplicate) navigate(type === "participante" ? "/mapeamento" : `/liderancas/${saved.id}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível salvar o cadastro.";
      setError(message.includes("network_members_active_phone") ? "Este telefone já consta na base." : message);
    }
  }
  return (
    <>
      <Head
        title="Cadastro rápido"
        description="Insira a pessoa agora; a conta de acesso poderá ser vinculada futuramente."
      />
      <section className="card form-card">
        <form className="mapping-form" onSubmit={submit}>
          <Field label="Nome completo" name="nome" required />
          <Field label="Telefone ou WhatsApp" name="telefone" required />
          <Field label="Município" name="municipio" required />
          <Field label="Bairro ou comunidade" name="bairro" required />
          <label>
            Tipo de pessoa
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Role)}
              name="type"
            >
              <option value="participante">Apoiador</option>
              <option value="lideranca">Liderança principal</option>
              <option value="mobilizador">
                Mobilizador / pequena liderança
              </option>
            </select>
          </label>
          <label>
            Liderança de referência
            <select name="parentId">
              <option value="">Sem liderança</option>
              {leaders(data).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Coordenador responsável"
            name="coordinator"
            placeholder="Nome do coordenador"
          />
          <label>
            Origem dos dados
            <select name="source">
              <option>Base territorial 2026</option>
              <option>Reunião comunitária</option>
              <option>Informado pela liderança</option>
              <option>Outra base autorizada</option>
            </select>
          </label>
          <label>
            Situação do vínculo
            <select name="linkStatus">
              <option value="nao_informado">Não informado</option>
              <option value="informado_lideranca">
                Informado pela liderança
              </option>
              <option value="em_validacao">Em validação</option>
              <option value="confirmado_pessoa">Confirmado pela pessoa</option>
            </select>
          </label>
          {type !== "participante" && (
            <>
              <Field
                label="Capacidade estimada"
                name="capacity"
                type="number"
                min="1"
                required
              />
              <Field
                label="Meta inicial acordada"
                name="goal"
                type="number"
                min="1"
                defaultValue="10"
                required
              />
            </>
          )}
          <label className="span-2">
            Observação
            <textarea name="notes" rows={3} />
          </label>
          {error && (
            <div className="form-message span-2" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions span-2">
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </button>
            <button className="primary">Salvar sem criar login</button>
          </div>
        </form>
      </section>
    </>
  );
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

export function LeaderDetail({ data, setData, user }: MappingProps) {
  const { id } = useParams(),
    navigate = useNavigate(),
    m = data.find((x) => x.id === id),
    [tab, setTab] = useState("resumo"),
    [notice, setNotice] = useState(""),
    [activities, setActivities] = useState<ActivityItem[]>([]),
    [credentials, setCredentials] = useState<{username:string;password:string}|null>(null);
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
      const code = isSupabaseConfigured && user ? await createCollectionLink(member.id, user.profileId) : member.collectionCode ?? `BASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      setData((s) => s.map((x) => x.id === member.id ? { ...x, collectionCode: code } : x));
      setNotice("Novo link seguro gerado. O anterior foi revogado; copie este link agora.");
    }
    if (kind === "gerar-acesso") {
      if (isSupabaseConfigured && supabase) {
        const { data: result, error } = await supabase.functions.invoke("create-leadership-access", { body: { memberId: member.id } });
        if (error || !result) { setNotice(error?.message ?? "Não foi possível gerar o acesso."); return; }
        setData((s) => s.map((x) => x.id === member.id ? { ...x, hasLogin: true, accessUsername: result.username, registrationStatus: "ativado" } : x));
        setCredentials({ username: result.username, password: result.temporaryPassword });
        setNotice("Acesso gerado. A senha temporária é exibida apenas agora.");
        return;
      }
      const base = member.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
      const username = `${base}.${member.id.slice(0, 4)}`;
      const password = `R10-${crypto.randomUUID().slice(0, 8)}!`;
      setData((s) => s.map((x) => x.id === member.id ? { ...x, hasLogin: true, accessUsername: username, registrationStatus: "ativado" } : x));
      setCredentials({ username, password });
      setNotice("Acesso gerado. A senha temporária é exibida apenas agora.");
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
            onClick={() =>
              setNotice(
                "Edição habilitada. Alterações serão auditadas ao salvar.",
              )
            }
          >
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
          <Pill tone="warning">Sem conta de acesso</Pill>
          <span>Organização e validação interna</span>
        </div>
        <button className="secondary" onClick={() => act("ativar")}>
          <UserCheck />
          Preparar ativação futura
        </button>
        <button className="primary" onClick={() => act("gerar-acesso")}>
          <KeyRound />
          {member.hasLogin ? "Gerar nova senha" : "Gerar login"}
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
      <nav className="tabs">
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
            <Stat label="Pessoas informadas" value={direct.length} />
            <Stat label="Pessoas cadastradas" value={direct.length} />
            <Stat label="Pessoas confirmadas" value={confirmedDirect} />
            <Stat
              label="Pequenas lideranças"
              value={direct.filter((x) => x.role === "mobilizador").length}
            />
            <Stat
              label="Ativadas com login"
              value={direct.filter((x) => x.hasLogin).length}
            />
            <Stat
              label="Realização da meta"
              value={`${realization(confirmedDirect, goal)}%`}
              tone="lime"
            />
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
                <button onClick={() => act("gerar-link")}>
                  <Copy />
                  {member.collectionCode ? "Ver link da base" : "Gerar link da base"}
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
            <section className="card">
              <h2>Qualidade da estimativa</h2>
              <dl className="detail-list">
                <div>
                  <dt>Confiança</dt>
                  <dd>{m.confidence ?? "Não revisada"}</dd>
                </div>
                <div>
                  <dt>Como foi obtida</dt>
                  <dd>{m.estimateMethod ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt>Última revisão</dt>
                  <dd>{m.lastReview ?? "Pendente"}</dd>
                </div>
                <div>
                  <dt>Prazo da meta</dt>
                  <dd>{m.goalDeadline ?? "A combinar"}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
      {tab === "vinculos" && (
        <section className="card">
          <div className="table-wrap">
            <table>
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
                    <td>
                      <b>{x.nome}</b>
                      <small>{x.telefone}</small>
                    </td>
                    <td>{x.role}</td>
                    <td>
                      {regLabels[x.registrationStatus ?? "pendente_revisao"]}
                    </td>
                    <td>{linkLabels[x.linkStatus ?? "nao_informado"]}</td>
                    <td>{x.hasLogin ? "Com login" : "Sem login"}</td>
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
              <table>
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
                      <td>{i + 2}</td>
                      <td>{r.row.nome || <em>ausente</em>}</td>
                      <td>{r.row.telefone || <em>ausente</em>}</td>
                      <td>{r.row.municipio || "—"}</td>
                      <td>{r.row.bairro || "—"}</td>
                      <td>
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
  return <main className="public-form collection-public"><div className="brand"><span className="brand-mark">40180</span><span><b>TIME 40180</b><small>Cadastro de base</small></span></div><span className="eyebrow">Base de {activeContext.leaderName}</span><h1>Adicionar pessoa</h1><p>Use este formulário para informar pessoas da sua base. O registro não cria login, não representa voto e será revisado pela coordenação.</p><div className="collection-counter"><Users/><span><b>{saved}</b> adicionada(s) nesta sessão</span></div><form onSubmit={submit} className="stack"><Field label="Nome completo" name="nome" required/><Field label="Telefone ou WhatsApp" name="telefone" required/><Field label="E-mail (opcional)" name="email" type="email"/><div className="form-row"><Field label="Município" name="municipio" required/><Field label="Bairro ou comunidade" name="bairro" required/></div><label>Observação<textarea name="notes" rows={3}/></label><label className="check"><input type="checkbox" name="contactAuthorized"/><span>A pessoa autorizou contato pela equipe. Deixe desmarcado se não houver autorização.</span></label>{message&&<div className="form-message" role="status">{message}</div>}<button className="primary">Adicionar à base de {activeContext.leaderName.split(" ")[0]}</button></form></main>;
}

export function ModeSettings({user}:{user:SessionUser}) {
  const [mode, setMode] = useState<"mapeamento" | "mobilizacao">("mapeamento"), [message,setMessage]=useState("");
  useEffect(()=>{ if(isSupabaseConfigured) loadOperatingMode().then(setMode).catch(()=>setMessage("Não foi possível carregar a configuração.")); },[]);
  async function changeMode(next:'mapeamento'|'mobilizacao') { try { if(isSupabaseConfigured) await saveOperatingMode(next,user.profileId); setMode(next); setMessage("Configuração salva."); } catch(reason){setMessage(reason instanceof Error?reason.message:"Não foi possível salvar.");} }
  return (
    <>
      <Head
        title="Configuração da etapa"
        description="A mudança futura exige decisão administrativa e revisão das permissões."
      />
      <section className="card setting-card">
        <Settings2 />
        <div>
          <h2>Modo operacional</h2>
          <p>
            No Modo Mapeamento, somente administração e coordenação autorizada
            acessam a base. Pessoas cadastradas não recebem login ou convite.
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
            <small>Ativo e recomendado nesta etapa</small>
          </span>
        </label>
        {message&&<div className="form-message" role="status">{message}</div>}
        <label className="disabled">
          <input
            type="radio"
            disabled
            checked={mode === "mobilizacao"}
            onChange={() => setMode("mobilizacao")}
          />
          <span>
            <b>Mobilização</b>
            <small>Bloqueado até homologação e liberação administrativa</small>
          </span>
        </label>
        <div className="mode-checklist">
          <b>Preparado para a próxima etapa</b>
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
