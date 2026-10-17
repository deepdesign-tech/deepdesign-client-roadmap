import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp,
  collection, query, where, getDocs, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = id => document.getElementById(id);
const show = (id,on) => $(id)?.classList.toggle('hidden',!on);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg = window.DEEPDESIGN_FIREBASE_CONFIG;
const requestedProject = new URLSearchParams(location.search).get('project');

const legacyTemplate = [
  {id:'phase-1',title:'สร้างตัวตนบน TikTok',label:'TikTok',detail:'DeepDesign จัด Schedule เลือกวันเวลา และเผยแพร่ขั้นต่ำ 1 วิดีโอต่อวัน เจ้าของกิจการลงเสริมได้ และนำคลิปเดิมกลับมาใช้ได้',tasks:[
    {id:'task-1',label:'วาง Schedule ลงคลิป'},{id:'task-2',label:'เลือกวันและเวลาเผยแพร่'},{id:'task-3',label:'ลงคลิปขั้นต่ำวันละ 1 วิดีโอ'},{id:'task-4',label:'เปิดให้เจ้าของกิจการลงคลิปเสริม'}]},
  {id:'phase-2',title:'ปรับปรุง Facebook ให้พร้อมโฆษณา',label:'Facebook',detail:'เปลี่ยนภาพปกเป็นภาพเจ้าของร้านและรวมผลงาน พร้อม Ads Post + PinPost รวม 15 โพสต์',tasks:[
    {id:'task-1',label:'รวบรวมภาพเจ้าของร้านและผลงาน'},{id:'task-2',label:'ออกแบบและเปลี่ยนภาพปก'},{id:'task-3',label:'จัดทำ Ads Post + PinPost 15 โพสต์'},{id:'task-4',label:'เผยแพร่ภาพตามแผน'}]},
  {id:'phase-3',title:'Repost TikTok ไป Facebook',label:'TikTok → FB',detail:'นำวิดีโอ TikTok ที่ลงแล้วมาเผยแพร่ซ้ำบน Facebook อย่างต่อเนื่อง',tasks:[
    {id:'task-1',label:'รวบรวมวิดีโอที่เผยแพร่แล้ว'},{id:'task-2',label:'ลงวิดีโอซ้ำบน Facebook'},{id:'task-3',label:'จัดตารางเผยแพร่ต่อเนื่อง'}]},
  {id:'phase-4',title:'Facebook Ads',label:'Facebook Ads',detail:'หลังลงภาพทั้งหมด ทีมคอนเทนต์ลงวันละ 1 โพสต์ เมื่อ Publish ครบ จึงดูคะแนนหลังบ้านและเลือก Top 2 เพื่อทำโฆษณา',tasks:[
    {id:'task-1',label:'ยืนยันภาพเผยแพร่ครบ'},{id:'task-2',label:'จัดลำดับโพสต์วันละ 1 โพสต์'},{id:'task-3',label:'ตรวจข้อมูลหลังบ้านหลัง Publish ครบ'},{id:'task-4',label:'เลือกภาพคะแนนสูงสุด 2 อันดับ'},{id:'task-5',label:'นำภาพ Top 2 ไปทำ Ads'}]}
];

let auth, db, currentUser, role, memberData={}, projectId=null, data={};
let projectUnsub, membersUnsub, projectsUnsub, selfMemberUnsub;
let projectCatalog=[], pendingProjectSelect=null, projectIdManuallyEdited=false, builderPhases=[];

function deepCopy(v){ return JSON.parse(JSON.stringify(v)); }
function uid(prefix='id'){ return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
function notify(text,error=false){ $('message').textContent=text; $('message').className=error?'error':'ok'; }
function adminNotify(text,error=false){ $('adminMessage').textContent=text; $('adminMessage').className=error?'error':'ok'; }
function projectNotify(text,error=false){ $('projectMessage').textContent=text; $('projectMessage').className=error?'error':'ok'; }
function builderNotify(text,error=false){ $('builderMessage').textContent=text; $('builderMessage').className=error?'error':'ok'; }
function writable(){ return role==='admin'||role==='editor'; }
function slugify(s){ const b=String(s||'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60); return b||('project-'+Date.now().toString(36)); }
function cleanProjectId(s){ return String(s||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80); }
function projectDefs(){ return Array.isArray(data.phaseDefinitions) ? data.phaseDefinitions : legacyTemplate; }
function phaseProgress(def,index){ const p=data.phases||{}; return p[def.id] || p[String(index)] || {status:'todo',tasks:{}}; }
function statusText(s){ return ({active:'Active',paused:'Paused',archived:'Archived'})[s]||'Active'; }

function renderRoadmap(){
  const defs=projectDefs();
  let done=0,doing=0,totalTasks=0,checkedTasks=0;
  if(!defs.length){ $('phases').innerHTML='<div class="card empty-roadmap" style="grid-column:1/-1"><strong>Project นี้ยังไม่มี Phase</strong><p>Admin สามารถออกแบบ Roadmap ได้จาก Dynamic Phase Builder ด้านล่าง</p></div>'; }
  else $('phases').innerHTML=defs.map((d,i)=>{
    const pr=phaseProgress(d,i), st=pr.status||'todo';
    if(st==='done')done++; if(st==='doing')doing++;
    const tasks=Array.isArray(d.tasks)?d.tasks:[]; totalTasks+=tasks.length; tasks.forEach((t,j)=>{if(pr.tasks?.[t.id] ?? pr.tasks?.[String(j)])checkedTasks++;});
    return `<article class="card"><div class="row"><span class="tag">PHASE ${String(i+1).padStart(2,'0')}</span><span class="muted">${esc(d.label||'')}</span></div><h3 style="margin-top:14px">${esc(d.title||'Untitled Phase')}</h3>${d.detail?`<p>${esc(d.detail)}</p>`:''}<div class="tasks">${tasks.length?tasks.map((t,j)=>`<label><input type="checkbox" data-phase-id="${esc(d.id)}" data-phase-index="${i}" data-task-id="${esc(t.id)}" data-task-index="${j}" ${(pr.tasks?.[t.id] ?? pr.tasks?.[String(j)])?'checked':''} ${!writable()?'disabled':''}> ${esc(t.label)}</label>`).join(''):'<div class="muted">ไม่มี Checklist</div>'}</div><label>สถานะ<select data-status-phase="${esc(d.id)}" data-phase-index="${i}" ${!writable()?'disabled':''}><option value="todo" ${st==='todo'?'selected':''}>ยังไม่เริ่ม</option><option value="doing" ${st==='doing'?'selected':''}>กำลังดำเนินการ</option><option value="review" ${st==='review'?'selected':''}>รอตรวจสอบ</option><option value="done" ${st==='done'?'selected':''}>เสร็จสิ้น</option></select></label></article>`;
  }).join('');
  const total=defs.length, percent=total?Math.round(done/total*100):0;
  $('done').textContent=`${done}/${total}`; $('percent').textContent=`${percent}%`; $('fill').style.width=`${percent}%`; $('taskMetric').textContent=`${checkedTasks}/${totalTasks}`; $('doingMetric').textContent=doing; $('statusMetric').textContent=statusText(data.status||'active');
  $('clientTitle').textContent=data.name||'Client Roadmap'; $('sync').textContent='ข้อมูลอัปเดตเรียลไทม์ · '+(data.updatedAt?.toDate?.().toLocaleString('th-TH')||'เชื่อมต่อแล้ว');
  $('notes').value=data.notes||''; $('notes').disabled=!writable(); $('saveNotes').disabled=!writable();
  if(role==='admin'){ fillProjectSettings(); resetBuilder(); }
  document.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('change',async()=>{
    const p=deepCopy(data.phases||{}), id=el.dataset.phaseId, idx=el.dataset.phaseIndex; const current=p[id]||p[idx]||{status:'todo',tasks:{}}; current.tasks??={}; current.tasks[el.dataset.taskId]=el.checked; p[id]=current; await writeProject({phases:p});
  }));
  document.querySelectorAll('[data-status-phase]').forEach(el=>el.addEventListener('change',async()=>{
    const p=deepCopy(data.phases||{}), id=el.dataset.statusPhase, idx=el.dataset.phaseIndex; const current=p[id]||p[idx]||{tasks:{}}; current.status=el.value; p[id]=current; await writeProject({phases:p});
  }));
}

async function writeProject(patch){ if(!writable()||!projectId)return; try{await updateDoc(doc(db,'projects',projectId),{...patch,updatedAt:serverTimestamp()});notify('บันทึกสำเร็จ');}catch(e){notify('บันทึกไม่สำเร็จ: '+e.message,true);} }

function fillProjectSettings(){ if(!projectId)return; $('editProjectId').value=projectId; $('editProjectName').value=data.name||''; $('editProjectStatus').value=data.status||'active'; $('accessProjectLabel').textContent=`${data.name||projectId} · ${projectId}`; }

function subscribeProject(id){
  if(!id)return; if(projectUnsub)projectUnsub(); if(membersUnsub){membersUnsub();membersUnsub=null;} projectId=id; $('project').value=id; if(role==='admin'){$('clientProject').value=id;subscribeMembers(id);}
  projectUnsub=onSnapshot(doc(db,'projects',id),snap=>{if(!snap.exists()){notify('ไม่พบ Project หรือไม่มีสิทธิ์เข้าถึง',true);return;} data=snap.data(); renderRoadmap(); renderProjectTiles();},e=>notify('โหลดข้อมูลไม่ได้: '+e.message,true));
}

function renderProjectSelectors(){
  const opts=projectCatalog.map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.id)}${p.status==='archived'?' [Archived]':''}</option>`).join(''); $('project').innerHTML=opts; if(role==='admin')$('clientProject').innerHTML=opts;
  const available=new Set(projectCatalog.map(p=>p.id)); let target=pendingProjectSelect&&available.has(pendingProjectSelect)?pendingProjectSelect:(projectId&&available.has(projectId)?projectId:null); if(!target&&requestedProject&&available.has(requestedProject))target=requestedProject; if(!target)target=projectCatalog[0]?.id||null; pendingProjectSelect=null; renderProjectTiles(); if(target&&target!==projectId)subscribeProject(target); else if(target){$('project').value=target;if(role==='admin')$('clientProject').value=target;}
}
function renderProjectTiles(){ if(role!=='admin')return; $('projectTiles').innerHTML=projectCatalog.length?projectCatalog.map(p=>`<div class="project-tile ${p.id===projectId?'active-project':''}"><strong>${esc(p.name||p.id)}</strong><div class="muted">${esc(p.id)} · ${esc(p.status||'active')} · ${(Array.isArray(p.phaseDefinitions)?p.phaseDefinitions.length:'legacy')} phases</div><button type="button" class="secondary compact" data-open-project="${esc(p.id)}" style="margin-top:8px">เปิด Project</button></div>`).join(''):'<div class="muted">ยังไม่มี Project</div>'; document.querySelectorAll('[data-open-project]').forEach(b=>b.addEventListener('click',()=>subscribeProject(b.dataset.openProject))); }
function subscribeAdminProjects(){ if(projectsUnsub)projectsUnsub(); projectsUnsub=onSnapshot(collection(db,'projects'),snap=>{projectCatalog=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'th'));renderProjectSelectors();},e=>projectNotify('โหลดรายการ Project ไม่สำเร็จ: '+e.message,true)); }
async function loadClientProjects(ids){ const out=[]; for(const id of ids){try{const s=await getDoc(doc(db,'projects',id));if(s.exists()&&s.data().status!=='archived')out.push({id,...s.data()});}catch(_){}} projectCatalog=out.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'th'));renderProjectSelectors(); }
function subscribeSelfMember(uid){ if(selfMemberUnsub)selfMemberUnsub(); selfMemberUnsub=onSnapshot(doc(db,'members',uid),snap=>{if(!snap.exists()){signOut(auth);return;}const next=snap.data();if(next.active===false){signOut(auth);return;}memberData=next;role=next.role;$('roleText').textContent=`สิทธิ์: ${role} · ${currentUser.email}`;if(role!=='admin')loadClientProjects(Array.isArray(next.projects)?next.projects:[]);}); }

function resetBuilder(){ if(role!=='admin')return; builderPhases=deepCopy(projectDefs()); renderBuilder(); builderNotify(Array.isArray(data.phaseDefinitions)?'โหลดโครงสร้างล่าสุดแล้ว':'Project เดิมกำลังแสดง Legacy Template — กดบันทึกเพื่อแปลงเป็น Dynamic Phase'); }
function renderBuilder(){
  if(role!=='admin')return;
  $('phaseBuilder').innerHTML=builderPhases.length?builderPhases.map((p,i)=>`<div class="phase-builder" data-builder-phase="${esc(p.id)}"><div class="phase-builder-head"><div><span class="tag">PHASE ${String(i+1).padStart(2,'0')}</span> <span class="muted">ID: ${esc(p.id)}</span></div><div class="builder-actions"><button type="button" class="ghost compact" data-up="${i}" ${i===0?'disabled':''}>↑</button><button type="button" class="ghost compact" data-down="${i}" ${i===builderPhases.length-1?'disabled':''}>↓</button><button type="button" class="danger compact" data-delete-phase="${i}">ลบ Phase</button></div></div><div class="two"><label>ชื่อ Phase<input data-b-title="${i}" maxlength="160" value="${esc(p.title||'')}"></label><label>Label / Channel<input data-b-label="${i}" maxlength="80" value="${esc(p.label||'')}"></label></div><label>รายละเอียด<textarea data-b-detail="${i}" rows="3" maxlength="2000">${esc(p.detail||'')}</textarea></label><div class="divider"></div><strong>Checklist</strong><div data-task-list="${i}">${(p.tasks||[]).map((t,j)=>`<div class="task-builder"><input data-b-task="${i}" data-task-index="${j}" maxlength="300" value="${esc(t.label||'')}"><button type="button" class="danger compact" data-delete-task="${i}:${j}">ลบ</button></div>`).join('')}</div><button type="button" class="secondary compact" data-add-task="${i}">+ Checklist</button></div>`).join(''):'<div class="notice" style="margin-top:14px">ยังไม่มี Phase — กด “+ เพิ่ม Phase” เพื่อเริ่มออกแบบ Roadmap</div>';
  document.querySelectorAll('[data-b-title]').forEach(x=>x.addEventListener('input',()=>builderPhases[+x.dataset.bTitle].title=x.value));
  document.querySelectorAll('[data-b-label]').forEach(x=>x.addEventListener('input',()=>builderPhases[+x.dataset.bLabel].label=x.value));
  document.querySelectorAll('[data-b-detail]').forEach(x=>x.addEventListener('input',()=>builderPhases[+x.dataset.bDetail].detail=x.value));
  document.querySelectorAll('[data-b-task]').forEach(x=>x.addEventListener('input',()=>builderPhases[+x.dataset.bTask].tasks[+x.dataset.taskIndex].label=x.value));
  document.querySelectorAll('[data-add-task]').forEach(b=>b.addEventListener('click',()=>{builderPhases[+b.dataset.addTask].tasks.push({id:uid('task'),label:''});renderBuilder();}));
  document.querySelectorAll('[data-delete-task]').forEach(b=>b.addEventListener('click',()=>{const [i,j]=b.dataset.deleteTask.split(':').map(Number);builderPhases[i].tasks.splice(j,1);renderBuilder();}));
  document.querySelectorAll('[data-delete-phase]').forEach(b=>b.addEventListener('click',()=>{builderPhases.splice(+b.dataset.deletePhase,1);renderBuilder();}));
  document.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.up;[builderPhases[i-1],builderPhases[i]]=[builderPhases[i],builderPhases[i-1]];renderBuilder();}));
  document.querySelectorAll('[data-down]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.down;[builderPhases[i+1],builderPhases[i]]=[builderPhases[i],builderPhases[i+1]];renderBuilder();}));
}
function normalizedBuilder(){ return builderPhases.map((p,i)=>({id:p.id||uid('phase'),title:String(p.title||'').trim()||`Phase ${i+1}`,label:String(p.label||'').trim(),detail:String(p.detail||'').trim(),tasks:(p.tasks||[]).map(t=>({id:t.id||uid('task'),label:String(t.label||'').trim()})).filter(t=>t.label)})); }
function reconcileProgress(defs){ const old=data.phases||{}, next={}; defs.forEach((d,i)=>{const prev=old[d.id]||old[String(i)]||{status:'todo',tasks:{}};const tasks={};(d.tasks||[]).forEach((t,j)=>{tasks[t.id]=Boolean(prev.tasks?.[t.id]??prev.tasks?.[String(j)]);});next[d.id]={status:prev.status||'todo',tasks};});return next; }

function subscribeMembers(id){ if(role!=='admin')return;if(membersUnsub)membersUnsub();const q=query(collection(db,'members'),where('projects','array-contains',id));membersUnsub=onSnapshot(q,snap=>{const rows=[];snap.forEach(d=>{const m=d.data();if(m.role!=='admin')rows.push({uid:d.id,...m});});rows.sort((a,b)=>String(a.email||'').localeCompare(String(b.email||'')));renderMembers(rows);},e=>adminNotify('โหลดรายชื่อลูกค้าไม่ได้: '+e.message,true)); }
function renderMembers(rows){ $('memberRows').innerHTML=rows.length?rows.map(m=>`<tr><td>${esc(m.displayName||'-')}</td><td>${esc(m.email||'-')}</td><td><select class="inline-select" data-role-uid="${esc(m.uid)}"><option value="viewer" ${m.role==='viewer'?'selected':''}>Viewer</option><option value="editor" ${m.role==='editor'?'selected':''}>Editor</option></select></td><td>${(m.projects||[]).map(x=>`<span class="project-chip">${esc(x)}</span>`).join('')||'-'}</td><td><span class="status-dot ${m.active===false?'off':''}"></span>${m.active===false?'ปิดสิทธิ์':'ใช้งาน'}</td><td><button class="secondary compact" data-reset="${esc(m.email||'')}">Reset</button> <button class="${m.active===false?'secondary':'danger'} compact" data-toggle="${esc(m.uid)}" data-active="${m.active===false?'false':'true'}">${m.active===false?'เปิด':'ปิด'}</button> <button class="danger compact" data-remove="${esc(m.uid)}">ถอน Project นี้</button></td></tr>`).join(''):'<tr><td colspan="6" class="muted">ยังไม่มีลูกค้าที่ได้รับสิทธิ์ใน Project นี้</td></tr>';
  document.querySelectorAll('[data-role-uid]').forEach(el=>el.addEventListener('change',async()=>{try{await updateDoc(doc(db,'members',el.dataset.roleUid),{role:el.value,updatedAt:serverTimestamp()});adminNotify('อัปเดตสิทธิ์แล้ว');}catch(e){adminNotify('เปลี่ยนสิทธิ์ไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',async()=>{const next=el.dataset.active!=='true';try{await updateDoc(doc(db,'members',el.dataset.toggle),{active:next,updatedAt:serverTimestamp()});adminNotify(next?'เปิดสิทธิ์แล้ว':'ปิดสิทธิ์แล้ว');}catch(e){adminNotify('เปลี่ยนสถานะไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('ถอนสิทธิ์ออกจาก Project '+projectId+' ?'))return;try{await updateDoc(doc(db,'members',el.dataset.remove),{projects:arrayRemove(projectId),updatedAt:serverTimestamp()});adminNotify('ถอนสิทธิ์ Project แล้ว');}catch(e){adminNotify('ถอนสิทธิ์ไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-reset]').forEach(el=>el.addEventListener('click',async()=>{try{await sendPasswordResetEmail(auth,el.dataset.reset);adminNotify('ส่งอีเมล Reset Password แล้ว');}catch(e){adminNotify('ส่ง Reset ไม่สำเร็จ: '+e.message,true);}}));
}
function randomPassword(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';const bytes=new Uint32Array(28);crypto.getRandomValues(bytes);return Array.from(bytes,n=>chars[n%chars.length]).join('');}
async function provisionClient(name,email,newRole,targetProject){
  const normalized=email.trim().toLowerCase(),existingQ=query(collection(db,'members'),where('email','==',normalized)),existing=await getDocs(existingQ);
  if(!existing.empty){const target=existing.docs[0],old=target.data();if(old.role==='admin')throw new Error('ไม่สามารถเปลี่ยนบัญชี Admin ผ่านเมนูนี้ได้');await updateDoc(target.ref,{displayName:name.trim(),role:newRole,active:true,projects:arrayUnion(targetProject),updatedAt:serverTimestamp()});try{await sendPasswordResetEmail(auth,normalized);}catch(_){}return 'พบผู้ใช้เดิมและเพิ่ม Project ให้แล้ว';}
  const secondaryApp=initializeApp(cfg,'provision-'+Date.now()),secondaryAuth=getAuth(secondaryApp);let createdUser=null;
  try{const cred=await createUserWithEmailAndPassword(secondaryAuth,normalized,randomPassword());createdUser=cred.user;await setDoc(doc(db,'members',createdUser.uid),{email:normalized,displayName:name.trim(),role:newRole,projects:[targetProject],active:true,createdAt:serverTimestamp(),createdBy:currentUser.uid,updatedAt:serverTimestamp()});await signOut(secondaryAuth);try{await sendPasswordResetEmail(auth,normalized);return 'สร้างบัญชีและส่งอีเมลตั้งรหัสผ่านแล้ว';}catch(e){return 'สร้างบัญชีสำเร็จ แต่ส่ง Reset email ไม่สำเร็จ: '+e.message;}}
  catch(e){if(createdUser){try{await deleteUser(createdUser);}catch(_){}}if(e.code==='auth/email-already-in-use')throw new Error('อีเมลนี้มีอยู่ใน Firebase Authentication แล้วแต่ยังไม่มี member record');throw e;}finally{try{await deleteApp(secondaryApp);}catch(_){}}
}

function resetSession(){if(projectUnsub){projectUnsub();projectUnsub=null;}if(membersUnsub){membersUnsub();membersUnsub=null;}if(projectsUnsub){projectsUnsub();projectsUnsub=null;}if(selfMemberUnsub){selfMemberUnsub();selfMemberUnsub=null;}currentUser=null;projectId=null;data={};projectCatalog=[];show('workspace',false);show('adminPanel',false);show('login',true);$('identity').textContent='';}

if(!cfg?.apiKey||!cfg?.projectId){show('setup',true);}else{
  const app=initializeApp(cfg);auth=getAuth(app);db=getFirestore(app);
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);}catch(err){$('loginError').textContent='เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน';}});
  $('logout').onclick=()=>signOut(auth); $('project').addEventListener('change',e=>subscribeProject(e.target.value)); $('saveNotes').onclick=()=>writeProject({notes:$('notes').value});
  $('newProjectName').addEventListener('input',()=>{if(!projectIdManuallyEdited)$('newProjectId').value=slugify($('newProjectName').value);}); $('newProjectId').addEventListener('input',()=>{projectIdManuallyEdited=true;$('newProjectId').value=cleanProjectId($('newProjectId').value);});
  $('projectCreateForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('newProjectName').value.trim(),id=cleanProjectId($('newProjectId').value),mode=$('newProjectTemplate').value;if(!name||!id)return projectNotify('กรุณากรอกชื่อและ Project ID',true);try{if((await getDoc(doc(db,'projects',id))).exists())throw new Error('Project ID นี้มีอยู่แล้ว');let defs=[];if(mode==='marketing')defs=deepCopy(legacyTemplate);if(mode==='current')defs=deepCopy(projectDefs());await setDoc(doc(db,'projects',id),{name,status:'active',phaseDefinitions:defs,phaseSchemaVersion:2,phases:{},kpi:{},notes:'',createdAt:serverTimestamp(),createdBy:currentUser.uid,updatedAt:serverTimestamp()});pendingProjectSelect=id;projectNotify('สร้าง Project สำเร็จ กำลังเปิด Project ใหม่');$('projectCreateForm').reset();$('newProjectTemplate').value='blank';projectIdManuallyEdited=false;}catch(err){projectNotify('สร้าง Project ไม่สำเร็จ: '+err.message,true);}});
  $('saveProjectSettings').onclick=async()=>{if(!projectId)return;try{await updateDoc(doc(db,'projects',projectId),{name:$('editProjectName').value.trim()||data.name,status:$('editProjectStatus').value,updatedAt:serverTimestamp()});projectNotify('บันทึก Project settings แล้ว');}catch(e){projectNotify('บันทึกไม่สำเร็จ: '+e.message,true);}};
  $('addPhase').onclick=()=>{builderPhases.push({id:uid('phase'),title:'',label:'',detail:'',tasks:[]});renderBuilder();}; $('resetBuilder').onclick=()=>resetBuilder();
  $('saveBuilder').onclick=async()=>{if(!projectId)return;const defs=normalizedBuilder();if(defs.length>30)return builderNotify('กำหนดได้สูงสุด 30 Phase',true);try{await updateDoc(doc(db,'projects',projectId),{phaseDefinitions:defs,phaseSchemaVersion:2,phases:reconcileProgress(defs),updatedAt:serverTimestamp()});builderNotify('บันทึกโครงสร้าง Roadmap สำเร็จ');}catch(e){builderNotify('บันทึก Builder ไม่สำเร็จ: '+e.message,true);}};
  $('inviteForm').addEventListener('submit',async e=>{e.preventDefault();const target=$('clientProject').value;if(!target)return adminNotify('กรุณาเลือก Project',true);$('inviteBtn').disabled=true;try{adminNotify('กำลังสร้าง/อัปเดตบัญชี...');const msg=await provisionClient($('clientName').value,$('clientEmail').value,$('clientRole').value,target);adminNotify(msg);$('clientEmail').value='';$('clientName').value='';}catch(err){adminNotify('เพิ่มลูกค้าไม่สำเร็จ: '+err.message,true);}finally{$('inviteBtn').disabled=false;}});
  $('copyClientLink').onclick=async()=>{const url=new URL(location.href);url.pathname=url.pathname.replace(/dashboard-v5\.html$/,'dashboard-v5.html');url.search='?project='+encodeURIComponent(projectId||'');await navigator.clipboard.writeText(url.toString());adminNotify('คัดลอกลิงก์ลูกค้าแล้ว');};
  onAuthStateChanged(auth,async u=>{if(!u){resetSession();return;}currentUser=u;show('login',false);$('identity').textContent=u.email;try{const snap=await getDoc(doc(db,'members',u.uid));if(!snap.exists())throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์');const m=snap.data();if(m.active===false)throw new Error('บัญชีนี้ถูกปิดสิทธิ์');memberData=m;role=m.role;show('workspace',true);show('adminPanel',role==='admin');$('roleText').textContent=`สิทธิ์: ${role} · ${u.email}`;subscribeSelfMember(u.uid);if(role==='admin')subscribeAdminProjects();else loadClientProjects(Array.isArray(m.projects)?m.projects:[]);}catch(err){$('loginError').textContent=err.message;await signOut(auth);}});
}
