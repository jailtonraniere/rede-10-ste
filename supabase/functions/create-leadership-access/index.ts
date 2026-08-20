import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), auth = req.headers.get("Authorization");
  if (!url || !serviceKey || !auth) return json({ error: "Não autorizado" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData.user) return json({ error: "Sessão inválida" }, 401);
  const { data: actor } = await admin.from("profiles").select("id,role,status").eq("auth_user_id", userData.user.id).single();
  if (!actor || actor.role !== "administrador" || actor.status === "bloqueado") return json({ error: "Somente administradores podem gerar acessos" }, 403);
  const { memberId } = await req.json();
  const { data: member } = await admin.from("network_members").select("id,nome,telefone_normalizado,municipio,bairro,member_role,profile_id,access_username").eq("id", memberId).single();
  if (!member) return json({ error: "Liderança não encontrada" }, 404);
  const slug = member.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  const username = member.access_username || `${slug}.${member.id.slice(0, 4)}`;
  const email = `${username}@acesso.rede10.local`;
  const password = `R10-${crypto.randomUUID().slice(0, 8)}!`;
  let authUserId: string;
  if (member.profile_id) {
    const { data, error } = await admin.from("profiles").select("auth_user_id").eq("id", member.profile_id).single();
    if (error || !data) return json({ error: "Perfil de acesso inválido" }, 409);
    const updated = await admin.auth.admin.updateUserById(data.auth_user_id, { password, user_metadata: { must_change_password: true } });
    if (updated.error) return json({ error: updated.error.message }, 400);
    authUserId = data.auth_user_id;
  } else {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "lideranca" }, user_metadata: { must_change_password: true } });
    if (created.error || !created.data.user) return json({ error: created.error?.message ?? "Falha ao criar usuário" }, 400);
    authUserId = created.data.user.id;
    const profile = await admin.from("profiles").insert({ auth_user_id: authUserId, nome: member.nome, email, telefone: member.telefone_normalizado, municipio: member.municipio, bairro: member.bairro, role: member.member_role, status: "cadastrado" }).select("id").single();
    if (profile.error) { await admin.auth.admin.deleteUser(authUserId); return json({ error: profile.error.message }, 400); }
    const linked = await admin.from("network_members").update({ profile_id: profile.data.id, access_username: username, registration_status: "ativado", activated_by: actor.id }).eq("id", member.id).select("id").single();
    if (linked.error) {
      await admin.auth.admin.deleteUser(authUserId);
      return json({ error: linked.error.message }, 400);
    }
  }
  await admin.from("audit_logs").insert({ actor_profile_id: actor.id, action: member.profile_id ? "access_password_regenerated" : "leadership_access_created", entity_type: "network_member", entity_id: member.id, new_data_resumida: { username } });
  return json({ username, temporaryPassword: password, authUserId });
});
