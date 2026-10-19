import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,createUserWithEmailAndPassword,sendPasswordResetEmail,deleteUser } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore,doc,getDoc,setDoc,updateDoc,onSnapshot,serverTimestamp,collection,query,where,getDocs,arrayUnion,arrayRemove,writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $=id=>document.getElementById(id);
const show=(id,on)=>$(id)?.classList.toggle('hidden',!on);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.DEEPDESIGN_FIREBASE_CONFIG;
const requestedProject=new URLSearchParams(location.search).get('project');

const legacyTemplate=[
{id:'phase-1',title:'สร้างตัวตนบน TikTok',label:'TikTok',detail:'DeepDesign จัด Schedule เลือกวันเวลา และเผยแพร่ขั้นต่ำ 1 วิดีโอต่อวัน เจ้าของกิจการลงเสริมได้ และนำคลิปเดิมกลับมาใช้ได้',tasks:[{id:'task-1',label:'วาง Schedule ลงคลิป'},{id:'task-2',label:'เลือกวันและเวลาเผยแพร่'},{id:'task-3',label:'ลงคลิปขั้นต่ำวันละ 1 วิดีโอ'},{id:'task-4',label:'เปิดให้เจ้าของกิจการลงคลิปเสริม'}]},
{id:'phase-2',title:'ปรับปรุง Facebook ให้พร้อมโฆษณา',label:'Facebook',detail:'เปลี่ยนภาพปกเป็นภาพเจ้าของร้านและรวมผลงาน พร้อม Ads Post + PinPost รวม 15 โพสต์',tasks:[{id:'task-1',label:'รวบรวมภาพเจ้าของร้านและผลงาน'},{id:'task-2',label:'ออกแบบและเปลี่ยนภาพปก'},{id:'task-3',label:'จัดทำ Ads Post + PinPost 15 โพสต์'},{id:'task-4',label:'เผยแพร่ภาพตามแผน'}]},
{id:'phase-3',title:'Repost TikTok ไป Facebook',label:'TikTok → FB',detail:'นำวิดีโอ TikTok ที่ลงแล้วมาเผยแพร่ซ้ำบน Facebook อย่างต่อเนื่อง',tasks:[{id:'task-1',label:'รวบรวมวิดีโอที่เผยแพร่แล้ว'},{id:'task-2',label:'ลงวิดีโอซ้ำบน Facebook'},{id:'task-3',label:'จัดตารางเผยแพร่ต่อเนื่อง'}]},
{id:'phase-4',title:'Facebook Ads',label:'Facebook Ads',detail:'หลังลงภาพทั้งหมด ทีมคอนเทนต์ลงวันละ 1 โพสต์ เมื่อ Publish ครบ จึงดูคะแนนหลังบ้านและเลือก Top 2 เพื่อทำโฆษณา',tasks:[{id:'task-1',label:'ยืนยันภาพเผยแพร่ครบ'},{id:'task-2',label:'จัดลำดับโพสต์วันละ 1 โพสต์'},{id:'task-3',label:'ตรวจข้อมูลหลังบ้านหลัง Publish ครบ'},{id:'task-4',label:'เลือกภาพคะแนนสูงสุด 2 อันดับ'},{id:'task-5',label:'นำภาพ Top 2 ไปทำ Ads'}]}
];

let auth,db,currentUser,projectId=null,data={},projectCatalog=[],builderPhases=[];
let projectUnsub,projectsUnsub,membersUnsub,pendingProjectSelect=null,projectIdManuallyEdited=false,currentFilter='all';

function deepCopy(v){return JSON.parse(JSON.stringify(v));}
function uid(prefix='id'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);}
function slugify(s){const b=String(s||'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);return b||('project-'+Date.now().toString(36));}
function cleanProjectId(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);}
function projectDefs(){return Array.isArray(data.phaseDefinitions)?data.phaseDefinitions:legacyTemplate;}
function phaseProgress(def,index){const p=data.phases||{};return p[def.id]||p[String(index)]||{status:'todo',tasks:{}};}
function statusText(s){return ({active:'Active',paused:'Paused',completed:'Completed',archived:'Archived'})[s]||'Active';}
function statusClass(s){return 'status-'+(['active','paused','completed','archived'].includes(s)?s:'active');}
function projectNotify(t,e=false){$('projectMessage').textContent=t;$('projectMessage').className=e?'error':'ok';}
function builderNotify(t,e=false){$('builderMessage').textContent=t;$('builderMessage').className=e?'error':'ok';}
function adminNotify(t,e=false){$('adminMessage').textContent=t;$('adminMessage').className=e?'error':'ok';}
function notify(t,e=false){$('message').textContent=t;$('message').className=e?'error':'ok';}

function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));

function switchProjectTab(name){
  document.querySelectorAll('.project-subview').forEach(v=>v.classList.toggle('active',v.id==='project-tab-'+name));
  document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.toggle('active',b.dataset.projectTab===name));
}
document.querySelectorAll('[data-project-tab]').forEach(b=>b.addEventListener('click',()=>switchProjectTab(b.dataset.projectTab)));

function progressStats(){
  const defs=projectDefs();let done=0,totalTasks=0,checked=0;
  defs.forEach((d,i)=>{const p=phaseProgress(d,i);if(p.status==='done')done++;(d.tasks||[]).forEach((t,j)=>{totalTasks++;if(p.tasks?.[t.id]??p.tasks?.[String(j)])checked++;});});
  return {defs,done,totalTasks,checked,pct:defs.length?Math.round(done/defs.length*100):0};
}
function metrics(){
  const s=progressStats();
  $('doneMetric').textContent=s.done+'/'+s.defs.length;
  $('taskMetric').textContent=s.checked+'/'+s.totalTasks;
  $('workspaceDoneMetric').textContent=s.done+'/'+s.defs.length;
  $('workspaceTaskMetric').textContent=s.checked+'/'+s.totalTasks;
  $('percent').textContent=s.pct+'%';$('fill').style.width=s.pct+'%';$('phaseCount').textContent=s.defs.length;
  $('overviewProjectName').textContent=data.name||projectId||'-';
  const os=$('overviewProjectStatus');os.textContent=statusText(data.status||'active');os.className='status-pill '+statusClass(data.status||'active');
  $('workspaceStatusMetric').innerHTML='<span class="status-pill '+statusClass(data.status||'active')+'">'+statusText(data.status||'active')+'</span>';
  $('sync').textContent='ข้อมูลอัปเดตเรียลไทม์ · '+(data.updatedAt?.toDate?.().toLocaleString('th-TH')||'เชื่อมต่อแล้ว');
  $('allProjectsMetric').textContent=projectCatalog.length;
  $('activeProjectsMetric').textContent=projectCatalog.filter(p=>(p.status||'active')==='active').length;
  $('completedProjectsMetric').textContent=projectCatalog.filter(p=>p.status==='completed').length;
  $('archivedProjectsMetric').textContent=projectCatalog.filter(p=>p.status==='archived').length;
}

function renderDashboardProjects(){
  const list=[...projectCatalog].sort((a,b)=>{
    const ax=a.updatedAt?.seconds||0,bx=b.updatedAt?.seconds||0;return bx-ax;
  }).slice(0,5);
  $('dashboardProjectList').innerHTML=list.length?list.map(p=>'<div class="soft-card"><div class="row"><div><strong>'+esc(p.name||p.id)+'</strong><div class="muted">'+esc(p.id)+'</div></div><span class="status-pill '+statusClass(p.status||'active')+'">'+statusText(p.status||'active')+'</span></div><div style="margin-top:10px"><button class="secondary compact" data-dashboard-open="'+esc(p.id)+'">จัดการ</button></div></div>').join(''):'<div class="empty-state"><h3>ยังไม่มี Project</h3><div>เริ่มสร้าง Project แรกได้เลย</div></div>';
  document.querySelectorAll('[data-dashboard-open]').forEach(b=>b.addEventListener('click',()=>openProjectWorkspace(b.dataset.dashboardOpen)));
}

function renderProjectGrid(){
  const rows=projectCatalog.filter(p=>currentFilter==='all'||(p.status||'active')===currentFilter);
  $('projectGrid').innerHTML=rows.length?rows.map(p=>{
    const defs=Array.isArray(p.phaseDefinitions)?p.phaseDefinitions:null;
    return '<article class="project-card"><div class="project-card-top"><div><h3>'+esc(p.name||p.id)+'</h3><div class="project-id">'+esc(p.id)+'</div></div><span class="status-pill '+statusClass(p.status||'active')+'">'+statusText(p.status||'active')+'</span></div><div class="project-card-footer"><div class="project-meta"><span>'+((defs?.length??'Legacy'))+' phases</span></div><button class="secondary compact" data-open-card="'+esc(p.id)+'">จัดการ</button></div></article>';
  }).join(''):'<div class="card empty-state" style="grid-column:1/-1"><h3>ไม่พบ Project</h3><div>ลองเปลี่ยนตัวกรองหรือสร้าง Project ใหม่</div></div>';
  document.querySelectorAll('[data-open-card]').forEach(b=>b.addEventListener('click',()=>openProjectWorkspace(b.dataset.openCard)));
}

function renderProgress(){
  const defs=projectDefs();
  const locked=['completed','archived'].includes(data.status||'active');
  $('phases').innerHTML=defs.length?defs.map((d,i)=>{
    const pr=phaseProgress(d,i),st=pr.status||'todo',tasks=Array.isArray(d.tasks)?d.tasks:[];
    return '<article class="card phase-card"><div class="row"><span class="tag">PHASE '+String(i+1).padStart(2,'0')+'</span><span class="muted">'+esc(d.label||'')+'</span></div><h3 style="margin-top:14px">'+esc(d.title||'Untitled Phase')+'</h3>'+(d.detail?'<p>'+esc(d.detail)+'</p>':'')+'<div class="tasks">'+(tasks.length?tasks.map((t,j)=>'<label><input type="checkbox" data-phase-id="'+esc(d.id)+'" data-phase-index="'+i+'" data-task-id="'+esc(t.id)+'" data-task-index="'+j+'" '+((pr.tasks?.[t.id]??pr.tasks?.[String(j)])?'checked':'')+' '+(locked?'disabled':'')+'> '+esc(t.label)+'</label>').join(''):'<div class="muted">ไม่มี Checklist</div>')+'</div><label>สถานะ<select data-status-phase="'+esc(d.id)+'" data-phase-index="'+i+'" '+(locked?'disabled':'')+'><option value="todo" '+(st==='todo'?'selected':'')+'>ยังไม่เริ่ม</option><option value="doing" '+(st==='doing'?'selected':'')+'>กำลังดำเนินการ</option><option value="review" '+(st==='review'?'selected':'')+'>รอตรวจสอบ</option><option value="done" '+(st==='done'?'selected':'')+'>เสร็จสิ้น</option></select></label></article>';
  }).join(''):'<div class="card empty-roadmap" style="grid-column:1/-1">Project นี้ยังไม่มี Phase — ไปที่ Roadmap Builder เพื่อออกแบบ</div>';

  document.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('change',async()=>{
    if(locked)return;
    const p=deepCopy(data.phases||{}),id=el.dataset.phaseId,idx=el.dataset.phaseIndex,current=p[id]||p[idx]||{status:'todo',tasks:{}};current.tasks??={};current.tasks[el.dataset.taskId]=el.checked;p[id]=current;await writeProject({phases:p});
  }));
  document.querySelectorAll('[data-status-phase]').forEach(el=>el.addEventListener('change',async()=>{
    if(locked)return;
    const p=deepCopy(data.phases||{}),id=el.dataset.statusPhase,idx=el.dataset.phaseIndex,current=p[id]||p[idx]||{tasks:{}};current.status=el.value;p[id]=current;await writeProject({phases:p});
  }));
}
function renderLifecycle(){
  const s=data.status||'active';
  $('workspaceProjectName').textContent=data.name||projectId||'Project';
  $('workspaceProjectId').textContent=projectId||'';
  const badge=$('workspaceProjectStatus');badge.textContent=statusText(s);badge.className='status-pill '+statusClass(s);
  $('workspaceCloseProject').textContent=['completed','archived'].includes(s)?'เปิด Project อีกครั้ง':'ปิด Project / งานเสร็จแล้ว';
  $('projectLifecycleSummary').textContent=s==='active'?'Project นี้กำลังดำเนินงาน สามารถแก้ Roadmap และอัปเดตความคืบหน้าได้':s==='paused'?'Project นี้ถูกพักไว้ชั่วคราว':s==='completed'?'งานเสร็จแล้ว ข้อมูลถูกเก็บไว้เพื่อดูย้อนหลัง และล็อกการแก้ไขความคืบหน้า':'Project นี้ถูกเก็บใน Archive และยังคงข้อมูลทั้งหมดไว้';
}
function fillProjectSettings(){
  if(!projectId)return;
  $('editProjectId').value=projectId;$('editProjectName').value=data.name||'';$('editProjectStatus').value=data.status||'active';
  $('topProjectName').textContent=data.name||projectId;$('topProjectMeta').textContent=projectId+' · '+statusText(data.status||'active');
  $('accessProjectLabel').textContent=(data.name||projectId)+' · '+projectId;$('notes').value=data.notes||'';
  const closed=['completed','archived'].includes(data.status||'active');
  $('closeProject').textContent=closed?'เปิด Project อีกครั้ง':'ปิด Project / งานเสร็จแล้ว';
  $('projectLifecycleMessage').textContent=data.status==='completed'?'Project นี้ปิดงานแล้วและถูกเก็บไว้เป็นประวัติ ลูกค้ายังเปิดดูข้อมูลได้':(data.status==='archived'?'Project นี้ถูก Archive และเก็บข้อมูลไว้':'');
  renderLifecycle();
}
async function writeProject(patch){if(!projectId)return;try{await updateDoc(doc(db,'projects',projectId),{...patch,updatedAt:serverTimestamp()});notify('บันทึกสำเร็จ');}catch(e){notify('บันทึกไม่สำเร็จ: '+e.message,true);}}

function resetBuilder(){builderPhases=deepCopy(projectDefs());renderBuilder();builderNotify(Array.isArray(data.phaseDefinitions)?'โหลดโครงสร้างล่าสุดแล้ว':'Project เดิมกำลังใช้ Legacy Template — กดบันทึกเพื่อแปลงเป็น Dynamic Phase');}
function renderBuilder(){
  $('phaseBuilder').innerHTML=builderPhases.length?builderPhases.map((p,i)=>'<div class="phase-builder"><div class="phase-builder-head"><div><span class="tag">PHASE '+String(i+1).padStart(2,'0')+'</span> <span class="muted">ID: '+esc(p.id)+'</span></div><div class="builder-actions"><button type="button" class="ghost compact" data-up="'+i+'" '+(i===0?'disabled':'')+'>↑</button><button type="button" class="ghost compact" data-down="'+i+'" '+(i===builderPhases.length-1?'disabled':'')+'>↓</button><button type="button" class="danger compact" data-delete-phase="'+i+'">ลบ Phase</button></div></div><div class="grid2"><label>ชื่อ Phase<input data-b-title="'+i+'" maxlength="160" value="'+esc(p.title||'')+'"></label><label>Label / Channel<input data-b-label="'+i+'" maxlength="80" value="'+esc(p.label||'')+'"></label></div><label>รายละเอียด<textarea data-b-detail="'+i+'" rows="3" maxlength="2000">'+esc(p.detail||'')+'</textarea></label><div class="divider"></div><strong>Checklist</strong><div>'+(p.tasks||[]).map((t,j)=>'<div class="task-builder"><input data-b-task="'+i+'" data-task-index="'+j+'" maxlength="300" value="'+esc(t.label||'')+'"><button type="button" class="danger compact" data-delete-task="'+i+':'+j+'">ลบ</button></div>').join('')+'</div><button type="button" class="secondary compact" data-add-task="'+i+'">+ Checklist</button></div>').join(''):'<div class="notice">ยังไม่มี Phase — กด “+ เพิ่ม Phase” เพื่อเริ่มออกแบบ Roadmap</div>';
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
function normalizedBuilder(){return builderPhases.map((p,i)=>({id:p.id||uid('phase'),title:String(p.title||'').trim()||('Phase '+(i+1)),label:String(p.label||'').trim(),detail:String(p.detail||'').trim(),tasks:(p.tasks||[]).map(t=>({id:t.id||uid('task'),label:String(t.label||'').trim()})).filter(t=>t.label)}));}
function reconcileProgress(defs){const old=data.phases||{},next={};defs.forEach((d,i)=>{const prev=old[d.id]||old[String(i)]||{status:'todo',tasks:{}};const tasks={};(d.tasks||[]).forEach((t,j)=>tasks[t.id]=Boolean(prev.tasks?.[t.id]??prev.tasks?.[String(j)]));next[d.id]={status:prev.status||'todo',tasks};});return next;}

function renderProjectSelectors(){
  const opts=projectCatalog.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||p.id)+(p.status==='completed'?' [Completed]':(p.status==='archived'?' [Archived]':''))+'</option>').join('');
  $('project').innerHTML=opts;$('clientProject').innerHTML=opts;$('clientProjectPage').innerHTML=opts;
  const available=new Set(projectCatalog.map(p=>p.id));let target=pendingProjectSelect&&available.has(pendingProjectSelect)?pendingProjectSelect:(projectId&&available.has(projectId)?projectId:null);
  if(!target&&requestedProject&&available.has(requestedProject))target=requestedProject;if(!target)target=projectCatalog[0]?.id||null;pendingProjectSelect=null;
  renderProjectGrid();renderDashboardProjects();metrics();
  if(target&&target!==projectId)subscribeProject(target);else if(target){$('project').value=target;$('clientProject').value=target;$('clientProjectPage').value=target;}
}
function subscribeAdminProjects(){if(projectsUnsub)projectsUnsub();projectsUnsub=onSnapshot(collection(db,'projects'),snap=>{projectCatalog=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'th'));renderProjectSelectors();},e=>projectNotify('โหลด Project ไม่สำเร็จ: '+e.message,true));}
function subscribeProject(id){
  if(!id)return;if(projectUnsub)projectUnsub();if(membersUnsub){membersUnsub();membersUnsub=null;}projectId=id;$('project').value=id;$('clientProject').value=id;$('clientProjectPage').value=id;history.replaceState(null,'','?project='+encodeURIComponent(id));
  projectUnsub=onSnapshot(doc(db,'projects',id),snap=>{if(!snap.exists())return notify('ไม่พบ Project',true);data=snap.data();fillProjectSettings();metrics();renderProgress();resetBuilder();subscribeMembers(id);renderDashboardProjects();renderProjectGrid();},e=>notify('โหลดข้อมูลไม่ได้: '+e.message,true));
}
function openProjectWorkspace(id){if(id&&id!==projectId)subscribeProject(id);switchView('project');switchProjectTab('overview');}

function subscribeMembers(id){
  if(membersUnsub)membersUnsub();
  const q=query(collection(db,'members'),where('projects','array-contains',id));
  membersUnsub=onSnapshot(q,snap=>{const rows=[];snap.forEach(d=>{const m=d.data();if(m.role!=='admin')rows.push({uid:d.id,...m});});rows.sort((a,b)=>String(a.email||'').localeCompare(String(b.email||'')));renderMembers(rows);},e=>adminNotify('โหลดรายชื่อลูกค้าไม่ได้: '+e.message,true));
}
function renderMembers(rows){
  $('memberRows').innerHTML=rows.length?rows.map(m=>'<tr><td>'+esc(m.displayName||'-')+'</td><td>'+esc(m.email||'-')+'</td><td><select data-role-uid="'+esc(m.uid)+'"><option value="viewer" '+(m.role==='viewer'?'selected':'')+'>Viewer</option><option value="editor" '+(m.role==='editor'?'selected':'')+'>Editor</option></select></td><td>'+(m.projects||[]).map(x=>'<span class="project-chip">'+esc(x)+'</span>').join('')+'</td><td>'+(m.active===false?'ปิดสิทธิ์':'ใช้งาน')+'</td><td><button class="secondary compact" data-reset="'+esc(m.email||'')+'">Reset</button> <button class="'+(m.active===false?'secondary':'danger')+' compact" data-toggle="'+esc(m.uid)+'" data-active="'+(m.active===false?'false':'true')+'">'+(m.active===false?'เปิด':'ปิด')+'</button> <button class="danger compact" data-remove="'+esc(m.uid)+'">ถอน Project</button></td></tr>').join(''):'<tr><td colspan="6" class="muted">ยังไม่มีลูกค้าใน Project นี้</td></tr>';
  document.querySelectorAll('[data-role-uid]').forEach(el=>el.addEventListener('change',async()=>{try{await updateDoc(doc(db,'members',el.dataset.roleUid),{role:el.value,updatedAt:serverTimestamp()});adminNotify('อัปเดตสิทธิ์แล้ว');}catch(e){adminNotify('เปลี่ยนสิทธิ์ไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',async()=>{const next=el.dataset.active!=='true';try{await updateDoc(doc(db,'members',el.dataset.toggle),{active:next,updatedAt:serverTimestamp()});adminNotify(next?'เปิดสิทธิ์แล้ว':'ปิดสิทธิ์แล้ว');}catch(e){adminNotify('เปลี่ยนสถานะไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('ถอนสิทธิ์ออกจาก Project '+projectId+' ?'))return;try{await updateDoc(doc(db,'members',el.dataset.remove),{projects:arrayRemove(projectId),updatedAt:serverTimestamp()});adminNotify('ถอนสิทธิ์ Project แล้ว');}catch(e){adminNotify('ถอนสิทธิ์ไม่สำเร็จ: '+e.message,true);}}));
  document.querySelectorAll('[data-reset]').forEach(el=>el.addEventListener('click',async()=>{try{await sendPasswordResetEmail(auth,el.dataset.reset);adminNotify('ส่ง Reset Password แล้ว');}catch(e){adminNotify('ส่ง Reset ไม่สำเร็จ: '+e.message,true);}}));
}
function randomPassword(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';const bytes=new Uint32Array(28);crypto.getRandomValues(bytes);return Array.from(bytes,n=>chars[n%chars.length]).join('');}
async function provisionClient(name,email,newRole,targetProject){
  const normalized=email.trim().toLowerCase(),existing=await getDocs(query(collection(db,'members'),where('email','==',normalized)));
  if(!existing.empty){const target=existing.docs[0],old=target.data();if(old.role==='admin')throw new Error('ไม่สามารถเปลี่ยนบัญชี Admin ได้');await updateDoc(target.ref,{displayName:name.trim(),role:newRole,active:true,projects:arrayUnion(targetProject),updatedAt:serverTimestamp()});try{await sendPasswordResetEmail(auth,normalized);}catch(_){}return 'พบผู้ใช้เดิมและเพิ่ม Project ให้แล้ว';}
  const secondaryApp=initializeApp(cfg,'provision-'+Date.now()),secondaryAuth=getAuth(secondaryApp);let createdUser=null;
  try{const cred=await createUserWithEmailAndPassword(secondaryAuth,normalized,randomPassword());createdUser=cred.user;await setDoc(doc(db,'members',createdUser.uid),{email:normalized,displayName:name.trim(),role:newRole,projects:[targetProject],active:true,createdAt:serverTimestamp(),createdBy:currentUser.uid,updatedAt:serverTimestamp()});await signOut(secondaryAuth);try{await sendPasswordResetEmail(auth,normalized);return 'สร้างบัญชีและส่งอีเมลตั้งรหัสผ่านแล้ว';}catch(e){return 'สร้างบัญชีสำเร็จ แต่ส่ง Reset email ไม่สำเร็จ: '+e.message;}}
  catch(e){if(createdUser){try{await deleteUser(createdUser);}catch(_){}}if(e.code==='auth/email-already-in-use')throw new Error('อีเมลนี้มีอยู่ใน Authentication แต่ยังไม่มี member record');throw e;}finally{try{await deleteApp(secondaryApp);}catch(_){}}
}

async function toggleProjectClosed(){
  if(!projectId)return;
  const closed=['completed','archived'].includes(data.status||'active');
  try{
    if(closed){await updateDoc(doc(db,'projects',projectId),{status:'active',reopenedAt:serverTimestamp(),updatedAt:serverTimestamp()});projectNotify('เปิด Project อีกครั้งแล้ว');}
    else{if(!confirm('ยืนยันปิด Project “'+(data.name||projectId)+'” ว่างานเสร็จแล้ว?\nข้อมูลทั้งหมดจะยังถูกเก็บไว้และเปิดดูย้อนหลังได้'))return;await updateDoc(doc(db,'projects',projectId),{status:'completed',closedAt:serverTimestamp(),closedBy:currentUser.uid,updatedAt:serverTimestamp()});projectNotify('ปิด Project แล้ว ข้อมูลยังถูกเก็บไว้เป็นประวัติ');}
  }catch(e){projectNotify('เปลี่ยนสถานะ Project ไม่สำเร็จ: '+e.message,true);}
}
async function deleteProjectPermanently(){
  if(!projectId)return;
  const targetId=projectId,targetName=data.name||targetId;
  if(!['completed','archived'].includes(data.status||'active')){projectNotify('กรุณาปิด Project ให้เป็น Completed หรือ Archived ก่อนลบถาวร',true);return;}
  const typed=prompt('การลบนี้ย้อนกลับไม่ได้\n\nพิมพ์ Project ID เพื่อยืนยัน:\n'+targetId);if(typed===null)return;if(typed.trim()!==targetId)return projectNotify('ยกเลิกการลบ: Project ID ที่พิมพ์ไม่ตรง',true);
  if(!confirm('ยืนยันลบ “'+targetName+'” ถาวร?'))return;
  const btn=$('deleteProject');btn.disabled=true;
  try{
    const assigned=await getDocs(query(collection(db,'members'),where('projects','array-contains',targetId)));
    const memberDocs=assigned.docs.filter(d=>d.data().role!=='admin');
    for(let start=0;start<memberDocs.length;start+=400){const batch=writeBatch(db);memberDocs.slice(start,start+400).forEach(m=>batch.update(m.ref,{projects:arrayRemove(targetId),updatedAt:serverTimestamp()}));await batch.commit();}
    const batch=writeBatch(db);batch.delete(doc(db,'projects',targetId));await batch.commit();
    if(projectUnsub){projectUnsub();projectUnsub=null;}if(membersUnsub){membersUnsub();membersUnsub=null;}
    const next=projectCatalog.find(p=>p.id!==targetId);pendingProjectSelect=next?.id||null;projectId=null;data={};history.replaceState(null,'',location.pathname);switchView('projects');projectNotify('ลบ Project ถาวรแล้ว');
  }catch(e){projectNotify('ลบ Project ไม่สำเร็จ: '+e.message,true);}finally{btn.disabled=false;}
}
function resetSession(){if(projectUnsub)projectUnsub();if(projectsUnsub)projectsUnsub();if(membersUnsub)membersUnsub();projectId=null;data={};projectCatalog=[];show('adminApp',false);show('login',true);}

if(!cfg?.apiKey||!cfg?.projectId){show('setup',true);}else{
  const app=initializeApp(cfg);auth=getAuth(app);db=getFirestore(app);
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);}catch(_){$('loginError').textContent='เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน';}});
  $('logout').onclick=()=>signOut(auth);

  $('project').addEventListener('change',e=>subscribeProject(e.target.value));
  $('openClientPreview').onclick=()=>window.open('./client-dashboard.html?project='+encodeURIComponent(projectId||''),'_blank');
  $('workspaceClientPreview').onclick=()=>window.open('./client-dashboard.html?project='+encodeURIComponent(projectId||''),'_blank');
  $('workspaceCloseProject').onclick=()=>toggleProjectClosed();
  $('closeProject').onclick=()=>toggleProjectClosed();
  $('manageSelectedProject').onclick=()=>projectId&&openProjectWorkspace(projectId);
  $('backToProjects').onclick=()=>switchView('projects');
  $('saveNotes').onclick=()=>writeProject({notes:$('notes').value});

  const dialog=$('createProjectDialog');
  const openDialog=()=>{dialog.showModal();$('newProjectName').focus();};
  $('quickCreateProject').onclick=openDialog;$('createProjectBtn').onclick=openDialog;
  $('closeCreateDialog').onclick=()=>dialog.close();$('cancelCreateDialog').onclick=()=>dialog.close();

  document.querySelectorAll('[data-project-filter]').forEach(b=>b.addEventListener('click',()=>{currentFilter=b.dataset.projectFilter;document.querySelectorAll('[data-project-filter]').forEach(x=>x.classList.toggle('active',x===b));renderProjectGrid();}));
  $('clientProjectPage').addEventListener('change',e=>subscribeProject(e.target.value));
  $('openAccessWorkspace').onclick=()=>{if(!projectId)return;switchView('project');switchProjectTab('access');};

  $('newProjectName').addEventListener('input',()=>{if(!projectIdManuallyEdited)$('newProjectId').value=slugify($('newProjectName').value);});
  $('newProjectId').addEventListener('input',()=>{projectIdManuallyEdited=true;$('newProjectId').value=cleanProjectId($('newProjectId').value);});
  $('projectCreateForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('newProjectName').value.trim(),id=cleanProjectId($('newProjectId').value),mode=$('newProjectTemplate').value;
    if(!name||!id)return;
    try{
      if((await getDoc(doc(db,'projects',id))).exists())throw new Error('Project ID นี้มีอยู่แล้ว');
      let defs=[];if(mode==='marketing')defs=deepCopy(legacyTemplate);if(mode==='current')defs=deepCopy(projectDefs());
      await setDoc(doc(db,'projects',id),{name,status:'active',phaseDefinitions:defs,phaseSchemaVersion:2,phases:{},kpi:{},notes:'',createdAt:serverTimestamp(),createdBy:currentUser.uid,updatedAt:serverTimestamp()});
      pendingProjectSelect=id;dialog.close();$('projectCreateForm').reset();$('newProjectTemplate').value='blank';projectIdManuallyEdited=false;
      setTimeout(()=>openProjectWorkspace(id),200);
    }catch(err){alert('สร้าง Project ไม่สำเร็จ: '+err.message);}
  });

  $('saveProjectSettings').onclick=async()=>{if(!projectId)return;try{await updateDoc(doc(db,'projects',projectId),{name:$('editProjectName').value.trim()||data.name,status:$('editProjectStatus').value,updatedAt:serverTimestamp()});projectNotify('บันทึก Project settings แล้ว');}catch(e){projectNotify('บันทึกไม่สำเร็จ: '+e.message,true);}};
  $('deleteProject').onclick=()=>deleteProjectPermanently();

  $('addPhase').onclick=()=>{builderPhases.push({id:uid('phase'),title:'',label:'',detail:'',tasks:[]});renderBuilder();};
  $('resetBuilder').onclick=()=>resetBuilder();
  $('saveBuilder').onclick=async()=>{if(!projectId)return;const defs=normalizedBuilder();if(defs.length>30)return builderNotify('กำหนดได้สูงสุด 30 Phase',true);try{await updateDoc(doc(db,'projects',projectId),{phaseDefinitions:defs,phaseSchemaVersion:2,phases:reconcileProgress(defs),updatedAt:serverTimestamp()});builderNotify('บันทึกโครงสร้าง Roadmap สำเร็จ');}catch(e){builderNotify('บันทึก Builder ไม่สำเร็จ: '+e.message,true);}};

  $('copyClientLink').onclick=async()=>{const u=new URL('./client-dashboard.html',location.href);u.searchParams.set('project',projectId||'');await navigator.clipboard.writeText(u.toString());adminNotify('คัดลอกลิงก์หน้าลูกค้าแล้ว');};
  $('inviteForm').addEventListener('submit',async e=>{e.preventDefault();const target=$('clientProject').value;if(!target)return adminNotify('กรุณาเลือก Project',true);$('inviteBtn').disabled=true;try{adminNotify('กำลังสร้าง/อัปเดตบัญชี...');const msg=await provisionClient($('clientName').value,$('clientEmail').value,$('clientRole').value,target);adminNotify(msg);$('clientEmail').value='';$('clientName').value='';}catch(err){adminNotify('เพิ่มลูกค้าไม่สำเร็จ: '+err.message,true);}finally{$('inviteBtn').disabled=false;}});

  onAuthStateChanged(auth,async u=>{
    if(!u){resetSession();return;}
    currentUser=u;show('login',false);
    try{
      const snap=await getDoc(doc(db,'members',u.uid));if(!snap.exists())throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์');
      const m=snap.data();if(m.active===false)throw new Error('บัญชีนี้ถูกปิดสิทธิ์');
      if(m.role!=='admin'){location.replace('./client-dashboard.html'+location.search);return;}
      $('adminIdentity').textContent=u.email;show('adminApp',true);subscribeAdminProjects();
    }catch(err){$('loginError').textContent=err.message;await signOut(auth);}
  });
}
