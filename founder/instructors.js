import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, onSnapshot, doc, getDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const toast = (message,type="success") => window.showFounderToast?.(message,type) || window.showToast?.(message,type);
let users = [], profiles = [], page = 1, stopUsers = null, stopProfiles = null;
const pageSize = 10;

function normalizeStatus(value) {
  const status = String(value || "pending_review").toLowerCase();
  return ["active","suspended","inactive","pending_review","rejected"].includes(status) ? status : "pending_review";
}
function allInstructors() {
  const profileMap = new Map(profiles.map(p => [p.uid || p.id, p]));
  return users.filter(user => user.role === "instructor").map(user => {
    const profile = profileMap.get(user.uid || user.id) || {};
    return {
      id: user.id, uid: user.uid || user.id,
      name: profile.name || profile.fullName || user.fullName || user.name || "Unnamed Instructor",
      email: user.email || profile.email || "",
      phone: profile.phone || user.phone || "",
      specialization: profile.expertise || profile.specialization || user.expertise || "Not specified",
      bio: profile.bio || user.bio || "",
      courses: Array.isArray(profile.courses) ? profile.courses : Array.isArray(user.courses) ? user.courses : [],
      studentsCount: Number(profile.studentsCount ?? profile.studentCount ?? user.studentsCount ?? 0),
      rating: Number(profile.rating || user.rating || 0),
      createdAt: user.createdAt || profile.createdAt || null,
      status: normalizeStatus(user.status),
      active: user.active !== false,
      verified: user.verified === true
    };
  });
}
function stats() {
  const items=allInstructors();
  const active=items.filter(i=>i.status==="active"&&i.active).length;
  const suspended=items.filter(i=>i.status==="suspended"||!i.active).length;
  const now=new Date();
  const fresh=items.filter(i=>{const d=i.createdAt?.toDate?i.createdAt.toDate():new Date(i.createdAt||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;
  $("instructorCount").textContent=items.length;
  $("activeInstructorCount").textContent=active;
  $("suspendedInstructorCount").textContent=suspended;
  $("newInstructorCount").textContent=fresh;
  $("assignedCourseCount").textContent=items.reduce((n,i)=>n+i.courses.length,0);
  $("managedStudentCount").textContent=items.reduce((n,i)=>n+i.studentsCount,0);
  $("instructorTotal").textContent=items.length+" Instructor"+(items.length===1?"":"s");
}
function filtered() {
  const term=String($("instructorSearch")?.value||"").trim().toLowerCase();
  const specialization=$("specializationFilter")?.value||"";
  const status=$("statusFilter")?.value||"";
  const result=allInstructors().filter(i=>
    (!term||[i.name,i.email,i.phone,i.specialization,i.bio].join(" ").toLowerCase().includes(term))
    &&(!specialization||i.specialization===specialization)
    &&(!status||i.status===status)
  );
  const sort=$("sortInstructors")?.value||"newest";
  result.sort((a,b)=>{
    const ta=a.createdAt?.toDate?a.createdAt.toDate().getTime():new Date(a.createdAt||0).getTime();
    const tb=b.createdAt?.toDate?b.createdAt.toDate().getTime():new Date(b.createdAt||0).getTime();
    return sort==="name"?a.name.localeCompare(b.name):sort==="oldest"?ta-tb:tb-ta;
  });
  return result;
}
function render() {
  const body=$("instructorsTableBody"); if(!body)return;
  const result=filtered(), pages=Math.max(1,Math.ceil(result.length/pageSize));
  page=Math.min(page,pages);
  const slice=result.slice((page-1)*pageSize,page*pageSize);
  if(!slice.length) {
    body.innerHTML='<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">👨‍🏫</div><h3>No instructor accounts found</h3><p>Approved instructors appear here. Pending applications are reviewed separately.</p></div></td></tr>';
  } else {
    body.innerHTML=slice.map(i=>{
      const pending=i.status==="pending_review";
      const suspended=i.status==="suspended"||!i.active;
      const action=pending
        ? '<button class="action-btn review-instructor" data-id="'+esc(i.id)+'" title="Review application"><i data-lucide="clipboard-check"></i></button>'
        : '<button class="action-btn toggle-instructor" data-id="'+esc(i.id)+'" title="'+(suspended?"Restore account":"Suspend account")+'"><i data-lucide="'+(suspended?"user-check":"user-x")+'"></i></button>';
      return '<tr>'+
        '<td><div class="instructor-info"><div class="instructor-avatar">'+esc(i.name.charAt(0).toUpperCase())+'</div><div class="instructor-details"><span class="instructor-name">'+esc(i.name)+'</span><span class="instructor-specialization">'+esc(i.specialization)+'</span></div></div></td>'+
        '<td>'+esc(i.specialization)+'</td><td>'+i.courses.length+'</td><td>'+i.studentsCount+'</td>'+
        '<td>'+esc(i.email||"—")+'</td><td><span class="status '+esc(i.status)+'">'+esc(i.status.replaceAll("_"," "))+'</span></td>'+
        '<td>'+(i.createdAt?.toDate?i.createdAt.toDate().toLocaleDateString():i.createdAt?new Date(i.createdAt).toLocaleDateString():"—")+'</td>'+
        '<td><div class="action-buttons"><button class="action-btn view-instructor" data-id="'+esc(i.id)+'" title="View profile"><i data-lucide="eye"></i></button><button class="action-btn edit-instructor" data-id="'+esc(i.id)+'" title="Edit profile"><i data-lucide="pencil"></i></button>'+action+'</div></td></tr>';
    }).join("");
  }
  $("pageInfo").textContent="Page "+page+" of "+pages;
  $("prevPage").disabled=page<=1; $("nextPage").disabled=page>=pages;
  window.lucide?.createIcons();
}
function refresh() {
  stats();
  const select=$("specializationFilter"), current=select?.value||"";
  if(select) {
    const values=[...new Set(allInstructors().map(i=>i.specialization).filter(x=>x&&x!=="Not specified"))].sort();
    select.innerHTML='<option value="">All Specializations</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if(values.includes(current))select.value=current;
  }
  render();
}
async function verifyFounder(user) {
  const snap=await getDoc(doc(db,"founder",user.uid));
  const profile=snap.exists()?snap.data():{};
  if(!snap.exists()||profile.role!=="founder"||profile.status!=="active"||profile.active===false||profile.verified===false)throw new Error("Active Founder authorization required.");
  const token=await user.getIdTokenResult();
  if(token.claims.firebase?.sign_in_second_factor!=="totp")throw new Error("Complete Founder authenticator verification first.");
}
async function setInstructorAccess(instructor) {
  const suspended=instructor.status!=="suspended"&&instructor.active;
  if(!suspended&&instructor.status!=="suspended")return toast("Only active or suspended instructors can be changed here.","warning");
  const raw=await window.ssaPrompt?.(suspended?"Provide a reason for suspending this instructor.":"Provide a reason for restoring this instructor.",{title:suspended?"Suspend instructor":"Restore instructor",confirmText:"Continue",placeholder:suspended?"Reason for suspension…":"Reason for restoration…"});
  const reason=String(raw||"").trim().slice(0,500);
  if(!reason)return toast("A reason is required for this access change.","warning");
  const confirmed=await window.ssaConfirm?.((suspended?"Suspend ":"Restore ")+instructor.name+"? This will update the actual login account.",{title:suspended?"Confirm suspension":"Confirm restoration",confirmText:suspended?"Suspend account":"Restore account",cancelText:"Cancel",tone:suspended?"danger":"info"});
  if(!confirmed)return;
  const userRef=doc(db,"users",instructor.uid),profileRef=doc(db,"instructors",instructor.uid);
  await runTransaction(db,async tx=>{
    const [userSnap,profileSnap]=await Promise.all([tx.get(userRef),tx.get(profileRef)]);
    if(!userSnap.exists()||userSnap.data().role!=="instructor")throw new Error("Instructor login profile is missing or invalid.");
    const latest=normalizeStatus(userSnap.data().status);
    if(suspended&&latest!=="active")throw new Error("Instructor is no longer active.");
    if(!suspended&&latest!=="suspended")throw new Error("Instructor is no longer suspended.");
    const next=suspended?"suspended":"active";
    tx.update(userRef,{status:next,active:!suspended,suspensionReason:suspended?reason:"",suspendedAt:suspended?serverTimestamp():null,suspendedBy:suspended?auth.currentUser.uid:null,updatedAt:serverTimestamp()});
    tx.set(profileRef,{uid:instructor.uid,status:next,active:!suspended,suspensionReason:suspended?reason:"",suspendedAt:suspended?serverTimestamp():null,suspendedBy:suspended?auth.currentUser.uid:null,updatedAt:serverTimestamp()},{merge:true});
  });
  window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:suspended?"Instructor account suspended":"Instructor account restored"});
  toast(suspended?"Instructor suspended.":"Instructor restored.");
}
function exportInstructors() {
  const rows=[["Name","Email","Phone","Specialization","Status"],...filtered().map(i=>[i.name,i.email,i.phone,i.specialization,i.status])];
  const csv=rows.map(row=>row.map(value=>'"'+String(value??"").replaceAll('"','""')+'"').join(",")).join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  const a=document.createElement("a");a.href=url;a.download="ssa-instructors.csv";a.click();URL.revokeObjectURL(url);
  window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Instructor directory exported"});
}

$("addInstructorBtn")?.addEventListener("click",()=>{window.location.href="instructor-admissions.html";});
$("instructorsTableBody")?.addEventListener("click",async event=>{
  const button=event.target.closest("button[data-id]");if(!button)return;
  const instructor=allInstructors().find(item=>item.id===button.dataset.id);if(!instructor)return;
  if(button.classList.contains("view-instructor")){window.location.href="instructors-profile.html?id="+encodeURIComponent(instructor.uid);return;}
  if(button.classList.contains("edit-instructor")){window.location.href="instructors-profile.html?id="+encodeURIComponent(instructor.uid)+"&edit=1";return;}
  if(button.classList.contains("review-instructor")){window.location.href="instructor-admissions.html";return;}
  if(button.classList.contains("toggle-instructor")){try{await setInstructorAccess(instructor);}catch(error){console.error(error);toast(error.message||"Unable to change instructor access.","error");}}
});
["instructorSearch","specializationFilter","statusFilter","sortInstructors"].forEach(id=>$(id)?.addEventListener("input",()=>{page=1;render();}));
["specializationFilter","statusFilter","sortInstructors"].forEach(id=>$(id)?.addEventListener("change",()=>{page=1;render();}));
$("refreshInstructors")?.addEventListener("click",refresh);
$("prevPage")?.addEventListener("click",()=>{if(page>1){page--;render();}});
$("nextPage")?.addEventListener("click",()=>{if(page<Math.ceil(filtered().length/pageSize)){page++;render();}});
$("exportInstructorBtn")?.addEventListener("click",async()=>{
  const confirmed=await window.ssaConfirm?.("This export contains instructor personal information. Store it securely.",{title:"Export instructor directory",confirmText:"Export CSV",cancelText:"Cancel"});
  if(confirmed)exportInstructors();
});

onAuthStateChanged(auth,async user=>{
  if(!user){window.location.replace("../login.html");return;}
  try{
    await verifyFounder(user);
    stopUsers=onSnapshot(collection(db,"users"),snapshot=>{users=snapshot.docs.map(d=>({id:d.id,...d.data()}));refresh();},error=>{console.error(error);toast("Instructor account directory could not be loaded.","error");});
    stopProfiles=onSnapshot(collection(db,"instructors"),snapshot=>{profiles=snapshot.docs.map(d=>({id:d.id,...d.data()}));refresh();},error=>{console.error(error);toast("Instructor profile records could not be loaded.","error");});
  }catch(error){console.error(error);toast(error.message||"Founder authorization failed.","error");window.location.replace("security.html");}
});
window.addEventListener("beforeunload",()=>{stopUsers?.();stopProfiles?.();});