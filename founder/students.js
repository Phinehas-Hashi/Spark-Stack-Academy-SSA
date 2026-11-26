import { auth, db } from "../js/firebase.js";
import { collection,onSnapshot,doc,updateDoc,serverTimestamp,runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const $=id=>document.getElementById(id); const esc=v=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
let students=[],editingId=null,page=1;const size=10;let stop=null;
const time=v=>v?.toMillis?v.toMillis():v?.toDate?v.toDate().getTime():new Date(v||0).getTime()||0;
const date=v=>time(v)?new Date(time(v)).toLocaleDateString():"—";
const toast=(m,t="success")=>window.showFounderToast?.(m,t)||window.showToast?.(m,t);
function stats(){const active=students.filter(s=>String(s.status||"").toLowerCase()==="active").length;const suspended=students.filter(s=>String(s.status||"").toLowerCase()==="suspended").length;const grad=students.filter(s=>String(s.status||"").toLowerCase()==="graduated").length;const now=new Date();const fresh=students.filter(s=>{const d=new Date(time(s.createdAt));return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;const progress=students.reduce((n,s)=>n+Math.max(0,Math.min(100,Number(s.progress??s.stats?.progress)||0)),0);$("studentCount")&&( $("studentCount").textContent=students.length);$("activeStudentCount")&&($("activeStudentCount").textContent=active);$("suspendedCount")&&($("suspendedCount").textContent=suspended);$("graduatedCount")&&($("graduatedCount").textContent=grad);$("newStudentCount")&&($("newStudentCount").textContent=fresh);$("completionRate")&&($("completionRate").textContent=students.length?`${Math.round(progress/students.length)}%`:"0%");$("studentTotal")&&($("studentTotal").textContent=`${students.length} ${students.length===1?"Student":"Students"}`);}
function filtered(){const q=String($("studentSearch")?.value||"").toLowerCase().trim(),course=String($("courseFilter")?.value||"").toLowerCase(),status=String($("statusFilter")?.value||"").toLowerCase();const out=students.filter(s=>{const name=String(s.name||s.fullName||"").toLowerCase(),email=String(s.email||"").toLowerCase(),ad=String(s.admissionNumber||"").toLowerCase(),co=String(s.courseName||s.course||"").toLowerCase(),st=String(s.status||"pending").toLowerCase();return(!q||name.includes(q)||email.includes(q)||ad.includes(q))&&(!course||co===course)&&(!status||st===status);});const sort=$("sortStudents")?.value||"newest";out.sort((a,b)=>sort==="name"?String(a.name||a.fullName||"").localeCompare(String(b.name||b.fullName||"")):sort==="oldest"?time(a.createdAt)-time(b.createdAt):time(b.createdAt)-time(a.createdAt));return out;}
function render(){const body=$("studentsTableBody");if(!body)return;const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages);const slice=rows.slice((page-1)*size,page*size);if(!slice.length){body.innerHTML='<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">🎓</div><h3>No Students Found</h3><p>Students will appear here after registration.</p></div></td></tr>';}else body.innerHTML=slice.map(s=>{const name=esc(s.name||s.fullName||"Unnamed Student"),status=String(s.status||"Pending"),p=Math.max(0,Math.min(100,Number(s.progress??s.stats?.progress)||0));return `<tr><td><div class="student-info"><div class="student-avatar">${esc(name.charAt(0).toUpperCase())}</div><div class="student-details"><strong>${name}</strong><small>${esc(s.admissionNumber||"Pending")}</small></div></div></td><td>${esc(s.courseName||s.course||"Not Assigned")}</td><td>${esc(s.email||"—")}</td><td>${esc(s.phone||"—")}</td><td><span class="status status-badge ${esc(status.toLowerCase())}">${esc(status)}</span></td><td><div class="progress"><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><span>${p}%</span></div></td><td>${date(s.createdAt)}</td><td><div class="action-buttons"><button class="action-btn view" data-action="edit" data-id="${esc(s.id)}" title="Edit student record"><i data-lucide="pencil"></i></button>${status.toLowerCase()!=="graduated"?`<button class="action-btn" data-action="toggle" data-id="${esc(s.id)}" title="${status.toLowerCase()==="suspended"?"Restore account":"Suspend account"}"><i data-lucide="${status.toLowerCase()==="suspended"?"play":"pause"}"></i></button>`:""}${status.toLowerCase()==="active"?`<button class="action-btn" data-action="graduate" data-id="${esc(s.id)}" title="Mark graduated"><i data-lucide="graduation-cap"></i></button>`:""}${status.toLowerCase()==="active"?`<button class="action-btn" data-action="graduate" data-id="${esc(s.id)}" title="Mark graduated"><i data-lucide="graduation-cap"></i></button>`:""}</div></td></tr>`;}).join("");$("pageInfo")&&($("pageInfo").textContent=`Page ${page} of ${pages}`);$("prevPage")&&($("prevPage").disabled=page<=1);$("nextPage")&&($("nextPage").disabled=page>=pages);window.lucide?.createIcons();}
function populateCourses(){const select=$("courseFilter");if(!select)return;const current=select.value;const values=[...new Set(students.map(s=>s.courseName||s.course).filter(Boolean))].sort();select.innerHTML='<option value="">All Courses</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");if(values.includes(current))select.value=current;}
function subscribe(){stop?.();const body=$("studentsTableBody");if(body)body.innerHTML='<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">✦</div><h3>Syncing student records</h3><p>Connecting to the academy database…</p></div></td></tr>';stop=onSnapshot(collection(db,"students"),snap=>{students=snap.docs.map(d=>({id:d.id,...d.data()}));stats();populateCourses();page=1;render();},err=>{console.error(err);toast("Student records could not be loaded. Check Firestore rules.","error");});}
function open(student){const modal=$("studentModal"),form=$("studentForm");if(!modal||!form||!student)return;editingId=student.id;form.reset();$("studentName").value=student.name||student.fullName||"";$("studentEmail").value=student.email||"";$("studentPhone").value=student.phone||"";$("studentCourse").value=student.courseName||student.course||"";modal.classList.add("active");document.body.classList.add("modal-open");$("studentName")?.focus();}
function close(){ $("studentModal")?.classList.remove("active");document.body.classList.remove("modal-open");editingId=null;}
$("addStudentBtn")?.addEventListener("click",()=>{window.location.href="admissions.html";});$("closeStudentModal")?.addEventListener("click",close);$("studentModal")?.addEventListener("click",e=>{if(e.target===$("studentModal"))close();});
$("studentForm")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!editingId)return toast("Create student accounts through the admissions workflow.","warning");
 const name=$("studentName")?.value.trim(),phone=$("studentPhone")?.value.trim(),course=$("studentCourse")?.value.trim();
 if(!name||!course)return toast("Complete the required student fields.","warning");
 try{
  await updateDoc(doc(db,"students",editingId),{name,fullName:name,phone,courseName:course,course,updatedAt:serverTimestamp()});
  close();toast("Student record updated.");window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Student record edited"});
 }catch(err){console.error(err);toast(err.message||"Unable to save student.","error");}
});
$("studentsTableBody")?.addEventListener("click",async e=>{
 const b=e.target.closest("button[data-id]");if(!b)return;
 const s=students.find(x=>x.id===b.dataset.id);if(!s)return;
 if(b.dataset.action==="edit")return open(s);
 if(b.dataset.action==="graduate"){
  const confirmed=await window.ssaConfirm?.(`Mark ${s.name||s.fullName||"this student"} as graduated?`,{title:"Confirm graduation",confirmText:"Mark graduated",cancelText:"Cancel"});
  if(!confirmed)return;
  try{await updateDoc(doc(db,"students",s.id),{status:"Graduated",graduatedAt:serverTimestamp(),graduatedBy:auth.currentUser?.uid||"",updatedAt:serverTimestamp()});window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Student marked graduated"});toast("Student marked as graduated.");}
  catch(err){toast(err.message||"Unable to update graduation status.","error");}
  return;
 }
 if(b.dataset.action==="toggle"){
  const suspend=String(s.status||"").toLowerCase()!=="suspended";
  const rawReason=await window.ssaPrompt?.(suspend?"Provide a reason for suspending this student account.":"Provide a reason for restoring this student account.",{title:suspend?"Suspend student":"Restore student",confirmText:"Continue",placeholder:suspend?"Reason for suspension…":"Reason for restoration…"});
  const reason=String(rawReason||"").trim().slice(0,500);
  if(!reason)return toast("A reason is required for this account status change.","warning");
  const confirmed=await window.ssaConfirm?.(`${suspend?"Suspend":"Restore"} ${s.name||s.fullName||"this student"}? The change will apply to the Student profile and login account.`,{title:suspend?"Confirm suspension":"Confirm restoration",confirmText:suspend?"Suspend account":"Restore account",cancelText:"Cancel",tone:suspend?"danger":"info"});
  if(!confirmed)return;
  const uid=s.uid||s.id;
  if(!uid)return toast("This student record is not linked to an account UID.","error");
  try{
   const studentRef=doc(db,"students",s.id),userRef=doc(db,"users",uid);
   await runTransaction(db,async tx=>{
    const [studentSnap,userSnap]=await Promise.all([tx.get(studentRef),tx.get(userRef)]);
    if(!studentSnap.exists()||!userSnap.exists())throw new Error("Student or linked login profile is missing. Repair the account link before changing access.");
    const userData=userSnap.data();
    if(userData.role!=="student")throw new Error("Linked account is not a student account.");
    const latest=String(studentSnap.data().status||"").toLowerCase();
    if(suspend&&latest==="suspended")throw new Error("Student is already suspended.");
    if(!suspend&&latest!=="suspended")throw new Error("Student is no longer suspended.");
    const next=suspend?"suspended":"active";
    tx.update(studentRef,{status:suspend?"Suspended":"Active",suspensionReason:suspend?reason:"",suspendedAt:suspend?serverTimestamp():null,suspendedBy:suspend?auth.currentUser?.uid||"":null,updatedAt:serverTimestamp()});
    tx.update(userRef,{status:next,active:!suspend,suspensionReason:suspend?reason:"",suspendedAt:suspend?serverTimestamp():null,suspendedBy:suspend?auth.currentUser?.uid||"":null,updatedAt:serverTimestamp()});
   });
   window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:suspend?"Student account suspended":"Student account restored"});
   toast(`Student account ${suspend?"suspended":"restored"}.`);
  }catch(err){console.error(err);toast(err.message||"Unable to change student access.","error");}
 }
});
["studentSearch","courseFilter","statusFilter","sortStudents"].forEach(id=>$(id)?.addEventListener("input",()=>{page=1;render()}));$("courseFilter")?.addEventListener("change",()=>{page=1;render()});$("statusFilter")?.addEventListener("change",()=>{page=1;render()});$("sortStudents")?.addEventListener("change",()=>{page=1;render()});$("refreshStudents")?.addEventListener("click",subscribe);$("prevPage")?.addEventListener("click",()=>{if(page>1){page--;render()}});$("nextPage")?.addEventListener("click",()=>{if(page<Math.ceil(filtered().length/size)){page++;render()}});
$("exportStudentsBtn")?.addEventListener("click",async()=>{const confirmed=await window.ssaConfirm?.("This CSV contains student personal information. Store it securely and do not share it publicly.",{title:"Export student data",confirmText:"Export CSV",cancelText:"Cancel"});if(!confirmed)return;window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Student directory exported"});const rows=[["Name","Email","Phone","Course","Status","Admission Number"],...filtered().map(s=>[s.name||s.fullName||"",s.email||"",s.phone||"",s.courseName||s.course||"",s.status||"",s.admissionNumber||""])];const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="spark-stack-students.csv";a.click();});
window.addEventListener("beforeunload",()=>stop?.());subscribe();
