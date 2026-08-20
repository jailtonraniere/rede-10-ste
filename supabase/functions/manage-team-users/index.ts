import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "https://rede-10-ste-vilela.vercel.app";
const cors = { "Access-Control-Allow-Origin": frontendUrl, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const normalizeUsername = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), authorization = req.headers.get("Authorization");
  if (!url || !serviceKey || !authorization) return json({ error: "Não autorizado" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession:false, autoRefreshToken:false } });
  const { data:userData } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (!userData.user) return json({ error:"Sessão inválida" }, 401);
  const { data:actor } = await admin.from("profiles").select("id,role,status").eq("auth_user_id",userData.user.id).single();
  if (!actor || actor.role !== "administrador" || actor.status === "bloqueado") return json({ error:"Somente administradores podem gerenciar usuários" }, 403);

  const body = await req.json();
  if (body.action === "update-role") {
    if (!body.profileId || !["administrador","cadastrador"].includes(body.role)) return json({ error:"Dados inválidos" }, 400);
    if (body.profileId === actor.id && body.role !== "administrador") return json({ error:"Você não pode remover seu próprio acesso administrativo" }, 409);
    const { data:target } = await admin.from("profiles").select("auth_user_id").eq("id",body.profileId).single();
    if (!target) return json({ error:"Usuário não encontrado" }, 404);
    const authUpdate = await admin.auth.admin.updateUserById(target.auth_user_id, { app_metadata:{ role:body.role } });
    if (authUpdate.error) return json({ error:authUpdate.error.message }, 400);
    const profileUpdate = await admin.from("profiles").update({ role:body.role, updated_at:new Date().toISOString() }).eq("id",body.profileId);
    if (profileUpdate.error) return json({ error:profileUpdate.error.message }, 400);
    await admin.from("audit_logs").insert({ actor_profile_id:actor.id, action:"team_user.role_updated", entity_type:"profile", entity_id:body.profileId, new_data_resumida:{ role:body.role } });
    return json({ ok:true });
  }

  if (body.action !== "create") return json({ error:"Ação inválida" }, 400);
  const name = String(body.name ?? "").trim(), rawLogin = String(body.login ?? "").trim().toLowerCase(), role = String(body.role ?? "cadastrador");
  if (name.length < 2 || !rawLogin || !["administrador","cadastrador"].includes(role)) return json({ error:"Preencha nome, login e perfil" }, 400);
  const isEmail = rawLogin.includes("@"), username = isEmail ? rawLogin : normalizeUsername(rawLogin);
  if ((!isEmail && username.length < 3) || (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawLogin))) return json({ error:"Informe um nome de usuário ou e-mail válido" }, 400);
  const email = isEmail ? rawLogin : `${username}@acesso.rede10.local`, password = `R10!${crypto.randomUUID().replaceAll("-","").slice(0,12)}aA`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm:true, app_metadata:{ role }, user_metadata:{ must_change_password:true } });
  if (created.error || !created.data.user) return json({ error:created.error?.message ?? "Não foi possível criar o usuário" }, 400);
  const profile = await admin.from("profiles").insert({ auth_user_id:created.data.user.id, nome:name, email:isEmail ? email : null, username, telefone:"Não informado", municipio:"Recife", bairro:"Não informado", role, status:"cadastrado" }).select("id").single();
  if (profile.error) { await admin.auth.admin.deleteUser(created.data.user.id); return json({ error:profile.error.message }, 400); }
  await admin.from("audit_logs").insert({ actor_profile_id:actor.id, action:"team_user.created", entity_type:"profile", entity_id:profile.data.id, new_data_resumida:{ role, username } });
  return json({ profileId:profile.data.id, username, temporaryPassword:password, role });
});
