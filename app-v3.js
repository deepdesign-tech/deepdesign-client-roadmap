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
const show = (id, on) => $(id)?.classList.toggle('hidden', !on);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg = window.DEEPDESIGN_FIREBASE_CONFIG;

const phases = [
  {title:'สร้างตัวตนบน TikTok',channel:'TikTok',detail:'DeepDesign จัด Schedule เลือกวันเวลา และเผยแพร่ขั้นต่ำ 1 วิดีโอต่อวัน เจ้าของกิจการลงเสริมได้ และนำคลิปเดิมกลับมาใช้ได้',tasks:['วาง Schedule ลงคลิป','เลือกวันและเวลาเผยแพร่','ลงคลิปขั้นต่ำวันละ 1 วิดีโอ','เปิดให้เจ้าของกิจการลงคลิปเสริม']},
  {title:'ปรับปรุง Facebook ให้พร้อมโฆษณา',channel:'Facebook',detail:'เปลี่ยนภาพปกเป็นภาพเจ้าของร้านและรวมผลงาน พร้อม Ads Post + PinPost รวม 15 โพสต์',tasks:['รวบรวมภาพเจ้าของร้านและผลงาน','ออกแบบและเปลี่ยนภาพปก','จัดทำ Ads Post + PinPost 15 โพสต์','เผยแพร่ภาพตามแผน']},
  {title:'Repost TikTok ไป Facebook',channel:'TikTok → FB',detail:'นำวิดีโอ TikTok ที่ลงแล้วมาเผยแพร่ซ้ำบน Facebook อย่างต่อเนื่อง',tasks:['รวบรวมวิดีโอที่เผยแพร่แล้ว','ลงวิดีโอซ้ำบน Facebook','จัดตารางเผยแพร่ต่อเนื่อง']},
  {title:'Facebook Ads',channel:'Facebook Ads',detail:'หลังลงภาพทั้งหมด ทีมคอนเทนต์ลงวันละ 1 โพสต์ เมื่อ Publish ครบ จึงดูคะแนนหลังบ้านและเลือก Top 2 เพื่อทำโฆษณา',tasks:['ยืนยันภาพเผยแพร่ครบ','จัดลำดับโพสต์วันละ 1 โพสต์','ตรวจข้อมูลหลังบ้านหลัง Publish ครบ','เลือกภาพคะแนนสูงสุด 2 อันดับ','นำภาพ Top 2 ไปทำ Ads']}
];

let auth, db, currentUser, role, projectId, projectUnsub, membersUnsub, data = {};
const fields = ['tiktok','posts','reposts','budget','top1','top2','notes'];

function notify(text, error=false){
  $('message').textContent = text;
  $('message').className = error ? 'error' : 'ok';
}
function adminNotify(text, error=false){
  $('adminMessage').textContent = text;
  $('adminMessage').className = error ? 'error' : 'ok';
}
function writable(){ return role === 'admin' || role === 'editor'; }

function renderRoadmap(){
  const p = data.phases || {};
  const k = data.kpi || {};
  let done = 0;
  $('phases').innerHTML = phases.map((x,i) => {
    const st = p[i]?.status || 'todo';
    if(st === 'done') done++;
    return `<article class="card">
      <div class="row"><span class="tag">PHASE 0${i+1}</span><span class="muted">${x.channel}</span></div>
      <h3 style="margin-top:14px">${esc(x.title)}</h3><p>${esc(x.detail)}</p>
      <div class="tasks">${x.tasks.map((t,j)=>`<label><input type="checkbox" data-phase="${i}" data-task="${j}" ${p[i]?.tasks?.[j]?'checked':''} ${!writable()?'disabled':''}> ${esc(t)}</label>`).join('')}</div>
      <label>สถานะ<select data-phase="${i}" data-status ${!writable()?'disabled':''}>
        <option value="todo" ${st==='todo'?'selected':''}>ยังไม่เริ่ม</option>
        <option value="doing" ${st==='doing'?'selected':''}>กำลังดำเนินการ</option>
        <option value="review" ${st==='review'?'selected':''}>รอตรวจสอบ</option>
        <option value="done" ${st==='done'?'selected':''}>เสร็จสิ้น</option>
      </select></label>
    </article>`;
  }).join('');

  $('done').textContent = `${done}/4`;
  $('percent').textContent = `${Math.round(done/4*100)}%`;
  $('fill').style.width = `${done/4*100}%`;
  $('tikMetric').textContent = k.tiktok || 0;
  $('fbMetric').textContent = `${k.posts || 0}/15`;
  $('repMetric').textContent = k.reposts || 0;
  $('clientTitle').textContent = data.name || 'Client Roadmap';
  $('sync').textContent = 'ข้อมูลอัปเดตเรียลไทม์ · ' + (data.updatedAt?.toDate?.().toLocaleString('th-TH') || 'เชื่อมต่อแล้ว');

  fields.forEach(f => {
    const el = document.querySelector(`[data-field="${f}"]`);
    if(!el) return;
    if(document.activeElement !== el) el.value = f === 'notes' ? (data.notes || '') : (k[f] ?? '');
    el.disabled = !writable();
  });
  $('saveKpi').disabled = !writable();
  $('saveNotes').disabled = !writable();

  document.querySelectorAll('[data-task]').forEach(el => el.addEventListener('change', async () => {
    const i = el.dataset.phase, j = el.dataset.task;
    const ph = structuredClone(data.phases || {});
    ph[i] ??= {status:'todo',tasks:{}};
    ph[i].tasks ??= {};
    ph[i].tasks[j] = el.checked;
    await writeProject({phases:ph});
  }));
  document.querySelectorAll('[data-status]').forEach(el => el.addEventListener('change', async () => {
    const i = el.dataset.phase;
    const ph = structuredClone(data.phases || {});
    ph[i] ??= {tasks:{}};
    ph[i].status = el.value;
    await writeProject({phases:ph});
  }));
}

async function writeProject(patch){
  if(!writable() || !projectId) return;
  try{
    await updateDoc(doc(db,'projects',projectId), {...patch, updatedAt:serverTimestamp()});
    notify('บันทึกสำเร็จ');
  }catch(e){ notify('บันทึกไม่สำเร็จ: ' + e.message, true); }
}

function subscribeProject(id){
  if(projectUnsub) projectUnsub();
  projectId = id;
  $('clientProject').value = id;
  projectUnsub = onSnapshot(doc(db,'projects',id), snap => {
    if(!snap.exists()) { notify('ไม่พบโครงการหรือไม่มีสิทธิ์เข้าถึง', true); return; }
    data = snap.data();
    renderRoadmap();
  }, e => notify('โหลดข้อมูลไม่ได้: ' + e.message, true));
  if(role === 'admin') subscribeMembers(id);
}

function subscribeMembers(id){
  if(membersUnsub) membersUnsub();
  const q = query(collection(db,'members'), where('projects','array-contains',id));
  membersUnsub = onSnapshot(q, snap => {
    const rows = [];
    snap.forEach(d => {
      const m = d.data();
      if(m.role === 'admin') return;
      rows.push({uid:d.id, ...m});
    });
    rows.sort((a,b) => String(a.email||'').localeCompare(String(b.email||'')));
    renderMembers(rows);
  }, e => adminNotify('โหลดรายชื่อลูกค้าไม่ได้: ' + e.message, true));
}

function renderMembers(rows){
  $('memberRows').innerHTML = rows.length ? rows.map(m => `
    <tr>
      <td>${esc(m.displayName || '-')}</td>
      <td>${esc(m.email || '-')}</td>
      <td><select class="inline-select" data-role-uid="${esc(m.uid)}"><option value="viewer" ${m.role==='viewer'?'selected':''}>Viewer</option><option value="editor" ${m.role==='editor'?'selected':''}>Editor</option></select></td>
      <td><span class="status-dot ${m.active===false?'off':''}"></span>${m.active===false?'ปิดสิทธิ์':'ใช้งาน'}</td>
      <td><button class="secondary" data-reset="${esc(m.email||'')}">ส่ง Reset</button> <button class="${m.active===false?'secondary':'danger'}" data-toggle="${esc(m.uid)}" data-active="${m.active===false?'false':'true'}">${m.active===false?'เปิดสิทธิ์':'ปิดสิทธิ์'}</button> <button class="danger" data-remove="${esc(m.uid)}">ถอน Project</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">ยังไม่มีลูกค้าที่ได้รับสิทธิ์ใน Project นี้</td></tr>';

  document.querySelectorAll('[data-role-uid]').forEach(el => el.addEventListener('change', async () => {
    try{
      await updateDoc(doc(db,'members',el.dataset.roleUid), {role:el.value, updatedAt:serverTimestamp()});
      adminNotify('อัปเดตสิทธิ์แล้ว');
    }catch(e){ adminNotify('เปลี่ยนสิทธิ์ไม่สำเร็จ: '+e.message,true); }
  }));
  document.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', async () => {
    const next = el.dataset.active !== 'true';
    try{
      await updateDoc(doc(db,'members',el.dataset.toggle), {active:next, updatedAt:serverTimestamp()});
      adminNotify(next ? 'เปิดสิทธิ์แล้ว' : 'ปิดสิทธิ์แล้ว');
    }catch(e){ adminNotify('เปลี่ยนสถานะไม่สำเร็จ: '+e.message,true); }
  }));
  document.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', async () => {
    if(!confirm('ถอนสิทธิ์ผู้ใช้นี้ออกจาก Project '+projectId+' ?')) return;
    try{
      await updateDoc(doc(db,'members',el.dataset.remove), {projects:arrayRemove(projectId), updatedAt:serverTimestamp()});
      adminNotify('ถอนสิทธิ์ Project แล้ว');
    }catch(e){ adminNotify('ถอนสิทธิ์ไม่สำเร็จ: '+e.message,true); }
  }));
  document.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', async () => {
    try{
      await sendPasswordResetEmail(auth,el.dataset.reset);
      adminNotify('ส่งอีเมล Reset Password แล้ว');
    }catch(e){ adminNotify('ส่ง Reset ไม่สำเร็จ: '+e.message,true); }
  }));
}

function randomPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(28); crypto.getRandomValues(bytes);
  return Array.from(bytes, n => chars[n % chars.length]).join('');
}

async function provisionClient(name,email,newRole){
  const normalized = email.trim().toLowerCase();
  const existingQ = query(collection(db,'members'), where('email','==',normalized));
  const existing = await getDocs(existingQ);
  if(!existing.empty){
    const target = existing.docs[0];
    const old = target.data();
    if(old.role === 'admin') throw new Error('ไม่สามารถเปลี่ยนบัญชี Admin ผ่านเมนูนี้ได้');
    await updateDoc(target.ref, {displayName:name.trim(), role:newRole, active:true, projects:arrayUnion(projectId), updatedAt:serverTimestamp()});
    try{ await sendPasswordResetEmail(auth, normalized); }catch(_){ }
    return 'พบผู้ใช้เดิมและเพิ่มสิทธิ์ Project ให้แล้ว';
  }

  const secondaryApp = initializeApp(cfg, 'provision-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  let createdUser = null;
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, normalized, randomPassword());
    createdUser = cred.user;
    await setDoc(doc(db,'members',createdUser.uid), {
      email:normalized,
      displayName:name.trim(),
      role:newRole,
      projects:[projectId],
      active:true,
      createdAt:serverTimestamp(),
      createdBy:currentUser.uid,
      updatedAt:serverTimestamp()
    });
    await signOut(secondaryAuth);
    try{
      await sendPasswordResetEmail(auth, normalized);
      return 'สร้างบัญชีและส่งอีเมลตั้งรหัสผ่านแล้ว';
    }catch(e){
      return 'สร้างบัญชีสำเร็จ แต่ส่ง Reset email ไม่สำเร็จ: ' + e.message;
    }
  }catch(e){
    if(createdUser){ try{ await deleteUser(createdUser); }catch(_){ } }
    if(e.code === 'auth/email-already-in-use') throw new Error('อีเมลนี้มีอยู่ใน Firebase Authentication แล้วแต่ยังไม่มี member record กรุณาใช้บัญชีอื่น หรือเพิ่ม member record ให้ UID เดิมหนึ่งครั้ง');
    throw e;
  }finally{
    try{ await deleteApp(secondaryApp); }catch(_){ }
  }
}

function resetUI(){
  if(projectUnsub){ projectUnsub(); projectUnsub=null; }
  if(membersUnsub){ membersUnsub(); membersUnsub=null; }
  currentUser=null; role=null; projectId=null; data={};
  show('workspace',false); show('login',true); show('adminPanel',false);
  $('identity').textContent='';
}

if(!cfg?.apiKey || !cfg?.projectId || cfg.projectId !== 'deepdesign-client-roadmap'){
  show('setup',true);
}else{
  const app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginError').textContent='';
    try{ await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value); }
    catch(_){ $('loginError').textContent='เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน'; }
  });
  $('logout').onclick = () => signOut(auth);
  $('project').addEventListener('change', e => subscribeProject(e.target.value));
  $('saveKpi').onclick = () => {
    const k={};
    fields.filter(x=>x!=='notes').forEach(f=>{
      const v=document.querySelector(`[data-field="${f}"]`).value;
      k[f]=['tiktok','posts','reposts','budget'].includes(f)?(v===''?0:Math.max(0,Number(v))):v;
    });
    writeProject({kpi:k});
  };
  $('saveNotes').onclick = () => writeProject({notes:document.querySelector('[data-field="notes"]').value});
  $('copyClientLink').onclick = async () => {
    const link='https://deepdesign-tech.github.io/deepdesign-client-roadmap/dashboard-v3.html';
    try{ await navigator.clipboard.writeText(link); adminNotify('คัดลอกลิงก์ลูกค้าแล้ว'); }
    catch(_){ adminNotify(link); }
  };
  $('inviteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn=$('inviteBtn'); btn.disabled=true; adminNotify('กำลังสร้าง/กำหนดสิทธิ์ลูกค้า...');
    try{
      const result=await provisionClient($('clientName').value,$('clientEmail').value,$('clientRole').value);
      adminNotify(result);
      $('clientName').value=''; $('clientEmail').value=''; $('clientRole').value='viewer';
    }catch(err){ adminNotify('เพิ่มลูกค้าไม่สำเร็จ: '+err.message,true); }
    finally{ btn.disabled=false; }
  });

  onAuthStateChanged(auth, async u => {
    if(!u){ resetUI(); return; }
    currentUser=u; $('identity').textContent=u.email;
    try{
      const snap=await getDoc(doc(db,'members',u.uid));
      if(!snap.exists()) throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์');
      const member=snap.data();
      if(member.active===false) throw new Error('บัญชีนี้ถูกปิดสิทธิ์');
      role=member.role;
      if(!['admin','editor','viewer'].includes(role)) throw new Error('สิทธิ์บัญชีไม่ถูกต้อง');
      const ids=Array.isArray(member.projects)?member.projects.filter(Boolean):[];
      if(!ids.length) throw new Error('บัญชีนี้ยังไม่มี Project ที่ได้รับสิทธิ์');
      $('roleText').textContent=`สิทธิ์: ${role} · ${u.email}`;
      $('project').innerHTML='';
      ids.forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;$('project').append(o);});
      show('login',false); show('workspace',true); show('adminPanel',role==='admin');
      subscribeProject(ids[0]);
    }catch(err){
      $('loginError').textContent=err.message;
      await signOut(auth);
    }
  });
}
