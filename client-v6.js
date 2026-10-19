import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore,doc,getDoc,updateDoc,onSnapshot,serverTimestamp,collection,getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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

let auth,db,currentUser,role,memberData={},projectId=null,data={},projectCatalog=[];
let projectUnsub,selfMemberUnsub;

function deepCopy(v){return JSON.parse(JSON.stringify(v));}
function writable(){return role==='editor';}
function projectDefs(){return Array.isArray(data.phaseDefinitions)?data.phaseDefinitions:legacyTemplate;}
function phaseProgress(def,index){const p=data.phases||{};return p[def.id]||p[String(index)]||{status:'todo',tasks:{}};}
function statusText(s){return ({active:'Active',paused:'Paused',archived:'Archived'})[s]||'Active';}
function notify(t,e=false){$('message').textContent=t;$('message').className=e?'error':'ok';}
function switchView(name){document.querySelectorAll('.client-view').forEach(v=>v.classList.toggle('active',v.id==='client-view-'+name));document.querySelectorAll('[data-client-view]').forEach(b=>b.classList.toggle('active',b.dataset.clientView===name));}
document.querySelectorAll('[data-client-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.clientView)));

function renderOverview(){
  const defs=projectDefs();let done=0,doing=0,totalTasks=0,checked=0;
  defs.forEach((d,i)=>{const p=phaseProgress(d,i);if(p.status==='done')done++;if(p.status==='doing')doing++;(d.tasks||[]).forEach((t,j)=>{totalTasks++;if(p.tasks?.[t.id]??p.tasks?.[String(j)])checked++;});});
  const pct=defs.length?Math.round(done/defs.length*100):0;
  $('doneMetric').textContent=done+'/'+defs.length;$('taskMetric').textContent=checked+'/'+totalTasks;$('doingMetric').textContent=doing;$('statusMetric').textContent=statusText(data.status||'active');$('percent').textContent=pct+'%';$('fill').style.width=pct+'%';
  $('sync').textContent='ข้อมูลอัปเดตเรียลไทม์ · '+(data.updatedAt?.toDate?.().toLocaleString('th-TH')||'เชื่อมต่อแล้ว');
  $('overviewPhases').innerHTML=defs.length?defs.map((d,i)=>{const p=phaseProgress(d,i),st=p.status||'todo';return '<div class="notice"><div class="row"><strong>PHASE '+String(i+1).padStart(2,'0')+'</strong><span class="status-pill">'+({todo:'ยังไม่เริ่ม',doing:'กำลังดำเนินการ',review:'รอตรวจสอบ',done:'เสร็จสิ้น'})[st]+'</span></div><div style="margin-top:8px">'+esc(d.title||'Untitled Phase')+'</div><div class="muted">'+esc(d.label||'')+'</div></div>';}).join(''):'<div class="muted">Project นี้ยังไม่มี Phase</div>';
}

function renderRoadmap(){
  const defs=projectDefs();
  $('phases').innerHTML=defs.length?defs.map((d,i)=>{
    const pr=phaseProgress(d,i),st=pr.status||'todo',tasks=Array.isArray(d.tasks)?d.tasks:[];
    return '<article class="card phase-card"><div class="row"><span class="tag">PHASE '+String(i+1).padStart(2,'0')+'</span><span class="muted">'+esc(d.label||'')+'</span></div><h3 style="margin-top:14px">'+esc(d.title||'Untitled Phase')+'</h3>'+(d.detail?'<p>'+esc(d.detail)+'</p>':'')+'<div class="tasks">'+(tasks.length?tasks.map((t,j)=>'<label><input type="checkbox" data-phase-id="'+esc(d.id)+'" data-phase-index="'+i+'" data-task-id="'+esc(t.id)+'" data-task-index="'+j+'" '+((pr.tasks?.[t.id]??pr.tasks?.[String(j)])?'checked':'')+' '+(!writable()?'disabled':'')+'> '+esc(t.label)+'</label>').join(''):'<div class="muted">ไม่มี Checklist</div>')+'</div><label>สถานะ<select data-status-phase="'+esc(d.id)+'" data-phase-index="'+i+'" '+(!writable()?'disabled':'')+'><option value="todo" '+(st==='todo'?'selected':'')+'>ยังไม่เริ่ม</option><option value="doing" '+(st==='doing'?'selected':'')+'>กำลังดำเนินการ</option><option value="review" '+(st==='review'?'selected':'')+'>รอตรวจสอบ</option><option value="done" '+(st==='done'?'selected':'')+'>เสร็จสิ้น</option></select></label></article>';
  }).join(''):'<div class="card empty-roadmap" style="grid-column:1/-1">Project นี้ยังไม่มี Roadmap</div>';
  $('editHint').textContent=role==='admin'?'Admin Preview — หน้านี้จำลองหน้าที่ลูกค้าเห็นแบบ Read-only':(writable()?'คุณมีสิทธิ์ Editor สามารถอัปเดต Checklist และสถานะได้':'ดูข้อมูลอย่างเดียว');
  document.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('change',async()=>{
    if(!writable())return;const p=deepCopy(data.phases||{}),id=el.dataset.phaseId,idx=el.dataset.phaseIndex,current=p[id]||p[idx]||{status:'todo',tasks:{}};current.tasks??={};current.tasks[el.dataset.taskId]=el.checked;p[id]=current;await writeProject({phases:p});
  }));
  document.querySelectorAll('[data-status-phase]').forEach(el=>el.addEventListener('change',async()=>{
    if(!writable())return;const p=deepCopy(data.phases||{}),id=el.dataset.statusPhase,idx=el.dataset.phaseIndex,current=p[id]||p[idx]||{tasks:{}};current.status=el.value;p[id]=current;await writeProject({phases:p});
  }));
}

function renderProject(){
  $('clientTitle').textContent=data.name||'Project Roadmap';
  $('clientMeta').textContent=(projectId||'')+' · '+statusText(data.status||'active');
  $('notes').value=data.notes||'';$('notes').disabled=!writable();$('saveNotes').disabled=!writable();
  renderOverview();renderRoadmap();
}
async function writeProject(patch){if(!writable()||!projectId)return;try{await updateDoc(doc(db,'projects',projectId),{...patch,updatedAt:serverTimestamp()});notify('บันทึกสำเร็จ');}catch(e){notify('บันทึกไม่สำเร็จ: '+e.message,true);}}

function renderProjectSelector(){
  $('project').innerHTML=projectCatalog.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||p.id)+'</option>').join('');
  const ids=new Set(projectCatalog.map(p=>p.id));let target=(requestedProject&&ids.has(requestedProject))?requestedProject:(projectId&&ids.has(projectId)?projectId:(projectCatalog[0]?.id||null));
  if(target&&target!==projectId)subscribeProject(target);else if(target)$('project').value=target;
}
async function loadProjects(){
  if(role==='admin'){
    const snap=await getDocs(collection(db,'projects'));projectCatalog=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.status!=='archived').sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'th'));
  }else{
    const out=[];for(const id of (Array.isArray(memberData.projects)?memberData.projects:[])){try{const s=await getDoc(doc(db,'projects',id));if(s.exists()&&s.data().status!=='archived')out.push({id,...s.data()});}catch(_){}}
    projectCatalog=out.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'th'));
  }
  renderProjectSelector();
}
function subscribeProject(id){
  if(!id)return;if(projectUnsub)projectUnsub();projectId=id;$('project').value=id;history.replaceState(null,'','?project='+encodeURIComponent(id));
  projectUnsub=onSnapshot(doc(db,'projects',id),snap=>{if(!snap.exists())return notify('ไม่พบ Project',true);data=snap.data();renderProject();},e=>notify('โหลดข้อมูลไม่ได้: '+e.message,true));
}
function resetSession(){if(projectUnsub)projectUnsub();if(selfMemberUnsub)selfMemberUnsub();projectId=null;data={};projectCatalog=[];show('clientApp',false);show('login',true);}

if(!cfg?.apiKey||!cfg?.projectId){show('setup',true);}else{
  const app=initializeApp(cfg);auth=getAuth(app);db=getFirestore(app);
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);}catch(_){$('loginError').textContent='เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน';}});
  $('logout').onclick=()=>signOut(auth);$('project').addEventListener('change',e=>subscribeProject(e.target.value));$('saveNotes').onclick=()=>writeProject({notes:$('notes').value});$('adminConsole').onclick=()=>location.href='./admin-dashboard.html?project='+encodeURIComponent(projectId||'');
  onAuthStateChanged(auth,async u=>{if(!u){resetSession();return;}currentUser=u;show('login',false);try{const snap=await getDoc(doc(db,'members',u.uid));if(!snap.exists())throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์');const m=snap.data();if(m.active===false)throw new Error('บัญชีนี้ถูกปิดสิทธิ์');memberData=m;role=m.role;$('identity').textContent=u.email;show('adminConsole',role==='admin');show('clientApp',true);if(role==='admin'){$('editHint').textContent='Admin Preview — หน้านี้เป็นหน้าตาลูกค้าและถูกตั้งเป็น Read-only';}await loadProjects();if(!projectCatalog.length)throw new Error('บัญชีนี้ยังไม่มี Project ที่เข้าถึงได้');}catch(err){$('loginError').textContent=err.message;await signOut(auth);}});
}
