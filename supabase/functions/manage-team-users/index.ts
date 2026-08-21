import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const configuredOrigins = (Deno.env.get("FRONTEND_URLS") ?? Deno.env.get("FRONTEND_URL") ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = new Set([
  "https://rede10.org",
  "https://www.rede10.org",
  "https://rede-10-ste-vilela.vercel.app",
  ...configuredOrigins,
]);
const corsHeaders = (req: Request) => {
  const requestOrigin = req.headers.get("Origin")?.replace(/\/$/, "") ?? "";
  const isLocalOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin);
  const origin = allowedOrigins.has(requestOrigin) || isLocalOrigin ? requestOrigin : "https://rede10.org";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};
const normalizeUsername = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");
const temporaryPassword = () => `R10!${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}aA`;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), authorization = req.headers.get("Authorization");
  if (!url || !serviceKey || !authorization) return json({ error: "Não autorizado" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession:false, autoRefreshToken:false } });
  const { data:userData } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (!userData.user) return json({ error:"Sessão inválida" }, 401);
  const { data:actor } = await admin.from("profiles").select("id,role,status,is_super_admin,deleted_at").eq("auth_user_id",userData.user.id).single();
  if (!actor || actor.role !== "administrador" || actor.status === "bloqueado" || actor.deleted_at) return json({ error:"Somente administradores podem gerenciar usuários" }, 403);

  const body = await req.json();
  const action = String(body.action ?? "");
  const audit = async (auditAction: string, entityId: string, details: Record<string, unknown>) => {
    await admin.from("audit_logs").insert({ actor_profile_id:actor.id, action:auditAction, entity_type:"profile", entity_id:entityId, new_data_resumida:details });
  };
  const getTarget = async () => {
    if (!body.profileId) return null;
    const { data } = await admin.from("profiles")
      .select("id,auth_user_id,nome,email,username,role,status,is_super_admin")
      .eq("id",body.profileId)
      .is("deleted_at",null)
      .in("role",["administrador","cadastrador"])
      .single();
    return data;
  };

  if (action === "update-role") {
    if (!body.profileId || !["administrador","cadastrador"].includes(body.role)) return json({ error:"Dados inválidos" }, 400);
    const target = await getTarget();
    if (!target) return json({ error:"Usuário não encontrado" }, 404);
    if (target.is_super_admin) return json({ error:"O Administrador geral não pode ser rebaixado" }, 409);
    if (target.id === actor.id && body.role !== "administrador") return json({ error:"Você não pode remover seu próprio acesso administrativo" }, 409);
    const authUpdate = await admin.auth.admin.updateUserById(target.auth_user_id, { app_metadata:{ role:body.role } });
    if (authUpdate.error) return json({ error:authUpdate.error.message }, 400);
    const profileUpdate = await admin.from("profiles").update({ role:body.role, updated_at:new Date().toISOString() }).eq("id",target.id);
    if (profileUpdate.error) return json({ error:profileUpdate.error.message }, 400);
    await audit("team_user.role_updated", target.id, { role:body.role });
    return json({ ok:true });
  }

  if (["set-status", "delete", "reset-password"].includes(action)) {
    if (!actor.is_super_admin) return json({ error:"Somente o Administrador geral pode executar esta ação" }, 403);
    const target = await getTarget();
    if (!target) return json({ error:"Usuário não encontrado" }, 404);

    if (action === "reset-password") {
      const password = temporaryPassword();
      const { data:authTarget, error:authReadError } = await admin.auth.admin.getUserById(target.auth_user_id);
      if (authReadError || !authTarget.user) return json({ error:authReadError?.message ?? "Conta de acesso não encontrada" }, 404);
      const authUpdate = await admin.auth.admin.updateUserById(target.auth_user_id, {
        password,
        user_metadata:{ ...(authTarget.user.user_metadata ?? {}), must_change_password:true },
      });
      if (authUpdate.error) return json({ error:authUpdate.error.message }, 400);
      await audit("team_user.password_reset", target.id, { forced_change:true });
      return json({ username:target.username ?? target.email ?? "", temporaryPassword:password });
    }

    if (target.id === actor.id || target.is_super_admin) return json({ error:"O acesso do Administrador geral é protegido" }, 409);

    if (action === "set-status") {
      const active = body.active === true;
      const authUpdate = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration:active ? "none" : "876000h" });
      if (authUpdate.error) return json({ error:authUpdate.error.message }, 400);
      const profileUpdate = await admin.from("profiles").update({ status:active ? "cadastrado" : "bloqueado", updated_at:new Date().toISOString() }).eq("id",target.id);
      if (profileUpdate.error) return json({ error:profileUpdate.error.message }, 400);
      await audit(active ? "team_user.reactivated" : "team_user.deactivated", target.id, { status:active ? "cadastrado" : "bloqueado" });
      return json({ ok:true });
    }

    const authUpdate = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration:"876000h" });
    if (authUpdate.error) return json({ error:authUpdate.error.message }, 400);
    const profileUpdate = await admin.from("profiles").update({ status:"bloqueado", deleted_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq("id",target.id);
    if (profileUpdate.error) return json({ error:profileUpdate.error.message }, 400);
    await audit("team_user.deleted", target.id, { deletion:"logical", history_preserved:true });
    return json({ ok:true });
  }

  if (action !== "create") return json({ error:"Ação inválida" }, 400);
  const name = String(body.name ?? "").trim(), rawLogin = String(body.login ?? "").trim().toLowerCase(), role = String(body.role ?? "cadastrador");
  if (name.length < 2 || !rawLogin || !["administrador","cadastrador"].includes(role)) return json({ error:"Preencha nome, login e perfil" }, 400);
  const isEmail = rawLogin.includes("@"), username = isEmail ? rawLogin : normalizeUsername(rawLogin);
  if ((!isEmail && username.length < 3) || (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawLogin))) return json({ error:"Informe um nome de usuário ou e-mail válido" }, 400);
  const email = isEmail ? rawLogin : `${username}@acesso.rede10.local`, password = temporaryPassword();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm:true, app_metadata:{ role }, user_metadata:{ must_change_password:true } });
  if (created.error || !created.data.user) return json({ error:created.error?.message ?? "Não foi possível criar o usuário" }, 400);
  const profile = await admin.from("profiles").insert({ auth_user_id:created.data.user.id, nome:name, email:isEmail ? email : null, username, telefone:"Não informado", municipio:"Recife", bairro:"Não informado", role, status:"cadastrado", is_super_admin:false }).select("id").single();
  if (profile.error) { await admin.auth.admin.deleteUser(created.data.user.id); return json({ error:profile.error.message }, 400); }
  await audit("team_user.created", profile.data.id, { role, username });
  return json({ profileId:profile.data.id, username, temporaryPassword:password, role });
});
