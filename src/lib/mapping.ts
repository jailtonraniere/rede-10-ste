import type { Member } from '../types'
import { normalizePhone } from './network'

export type CsvRow = Record<string,string>
export function parseCsv(text:string):CsvRow[]{
  const rows:string[][]=[]; let row:string[]=[],cell='',quoted=false
  for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'&&quoted&&next==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell.trim());cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);if(rows.length<2)return[];const headers=rows[0].map(h=>h.toLowerCase().trim());return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))
}
export function duplicateCandidates(candidate:Pick<Member,'telefone'|'nome'|'email'|'bairro'>,all:Member[]){const phone=normalizePhone(candidate.telefone);return all.filter(m=>(phone&&normalizePhone(m.telefone)===phone)||(candidate.email&&m.email?.toLowerCase()===candidate.email.toLowerCase())||(m.nome.toLowerCase()===candidate.nome.toLowerCase()&&m.bairro.toLowerCase()===candidate.bairro.toLowerCase()))}
export function realization(confirmed:number,goal:number){return goal>0?Math.round((confirmed/goal)*100):0}
export function uniquePeople(all:Member[]){const seen=new Set<string>();return all.filter(m=>{const key=normalizePhone(m.telefone)||`${m.nome.toLowerCase()}|${m.bairro.toLowerCase()}`;if(seen.has(key))return false;seen.add(key);return true})}
export function transferMember(all:Member[],id:string,parentId:string){return all.map(m=>m.id===id?{...m,parentId,lastReview:new Date().toISOString().slice(0,10)}:m)}
export function prepareActivation(all:Member[],id:string){return all.map(m=>m.id===id?{...m,registrationStatus:'pronto_ativacao' as const,hasLogin:false}:m)}
