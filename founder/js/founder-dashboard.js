import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 });
const state = { students:0, instructors:0, courses:0, revenue:0, payments:[], activity:[] };
const $ = id => document.getElementById(id);
const text = (id,value) => { const el=$(id); if(el) el.textContent=value; };
const amount = p => Number(p.amount ?? p.total ?? p.price ?? 0) || 0;
const dateOf = v => v?.toDate ? v.toDate() : (v ? new Date(v) : null);
const completed = p => ["completed","success","successful","paid","succeeded"].includes(String(p.status ?? p.paymentStatus ?? "completed").toLowerCase());

function refresh(){
  text("totalStudents",state.students.toLocaleString());
  text("totalInstructors",state.instructors.toLocaleString());
  text("activeCourses",state.courses.toLocaleString());
  text("totalRevenue",money.format(state.revenue));
  text("platformActivity",state.activity.length.toLocaleString());
  text("studentGrowth",state.students ? "Live academy total" : "No students yet");
  text("revenueGrowth",state.revenue ? "Completed recorded payments" : "No completed payments");
  text("lastSystemSync",new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
  renderChart(); renderBrief(); renderActivity();
}
function renderBrief(){
  const message = state.students ? `${state.students.toLocaleString()} learners, ${state.instructors.toLocaleString()} instructors and ${state.courses.toLocaleString()} active courses are currently under your command.` : "Your Founder Console is connected. Student and instructor records will appear here as soon as they exist.";
  text("founderAiBrief",message);
}
function renderChart(){
  const chart=$("revenueChart"); if(!chart) return;
  const days=Math.min(365,Math.max(7,Number($("revenuePeriod")?.value||30)));
  const today=new Date(); today.setHours(0,0,0,0);
  const totals=Array.from({length:days},()=>0);
  state.payments.filter(completed).forEach(p=>{const d=dateOf(p.paidAt||p.createdAt||p.updatedAt); if(!d||Number.isNaN(d.getTime())) return; d.setHours(0,0,0,0); const age=Math.floor((today-d)/86400000); if(age>=0&&age<days) totals[days-1-age]+=amount(p);});
  const max=Math.max(...totals,1); chart.replaceChildren(); const bars=document.createElement("div"); bars.className="founder-revenue-bars";
  totals.forEach(v=>{const bar=document.createElement("div");bar.className="founder-revenue-bar";bar.style.height=`${Math.max(v?6:2,(v/max)*100)}%`;bars.appendChild(bar);}); chart.appendChild(bars);
}
function renderActivity(){
  const list=$("founderActivityList"); if(!list)return; list.replaceChildren();
  if(!state.activity.length){const empty=document.createElement("p");empty.className="founder-empty-state";empty.textContent="No recent platform activity yet.";list.appendChild(empty);return;}
  state.activity.slice(0,8).forEach(item=>{const row=document.createElement("article");row.className="founder-activity-item";row.innerHTML=`<span class="founder-activity-icon">${item.icon||"✦"}</span><div><strong>${item.title||item.type||"Platform activity"}</strong><p>${item.message||item.description||"An academy event was recorded."}</p></div>`;list.appendChild(row);});
}
function bind(id,url){ $(id)?.addEventListener("click",()=>location.href=url); }
function bindAdminModal(){
  const modal=$("createAdminModal"); const form=$("createAdminForm"); const message=$("createAdminMessage"); const submit=$("submitCreateAdmin");
  if(!modal||!form) return;
  const close=()=>{modal.classList.remove("show");modal.setAttribute("aria-hidden","true");form.reset();if(message){message.textContent="";message.className="founder-form-message";}};
  $("createAdminBtn")?.addEventListener("click",()=>{modal.classList.add("show");modal.setAttribute("aria-hidden","false");setTimeout(()=>$("adminFullName")?.focus(),80);});
  document.querySelectorAll("[data-close-admin-modal]").forEach(el=>el.addEventListener("click",close));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal.classList.contains("show"))close();});
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(message){message.textContent="";message.className="founder-form-message";}
    const fullName=$("adminFullName")?.value.trim(); const email=$("adminEmail")?.value.trim(); const password=$("adminPassword")?.value||"";
    if(!fullName||!email||password.length<8){if(message){message.textContent="Enter a full name, valid email and password of at least 8 characters.";message.classList.add("error");}return;}
    submit.disabled=true; submit.innerHTML='<i data-lucide="loader-circle"></i> Creating…'; window.lucide?.createIcons();
    try{
      const functions=getFunctions();
      const createAdmin=httpsCallable(functions,"createAdminAccount");
      const result=await createAdmin({fullName,email,password,status:"active"});
      if(message){message.textContent=result.data?.message||"Administrator created successfully.";message.classList.add("success");}
      form.reset();
      setTimeout(close,1300);
    }catch(error){
      console.error("Create admin:",error);
      const code=String(error?.code||"");
      const friendly=code.includes("functions/permission-denied")?"Only an active founder can create administrator accounts.":code.includes("functions/already-exists")?"An account with that email already exists.":code.includes("functions/failed-precondition")?"The admin creation service is not deployed yet.":(error?.message||"The administrator account could not be created.");
      if(message){message.textContent=friendly.replace(/^FirebaseError:\s*/i,"");message.classList.add("error");}
    }finally{submit.disabled=false;submit.innerHTML='<i data-lucide="user-plus"></i>Create Administrator';window.lucide?.createIcons();}
  });
}
function bindActions(){bind("manageStudentsBtn","students.html");bind("manageInstructorsBtn","instructors.html");bind("manageCoursesBtn","courses.html");bind("viewRevenueBtn","revenue.html");bind("viewReportsBtn","reports.html");bind("openSettingsBtn","platform-settings.html");bind("openSparkAiBtn","spark-ai.html");bind("viewAllActivityBtn","analytics.html");$("revenuePeriod")?.addEventListener("change",renderChart);bindAdminModal();}
function listen(path,callback){return onSnapshot(collection(db,path),callback,error=>console.error(`Founder ${path} listener failed`,error));}
function loadProfile(user){getDoc(doc(db,"founder",user.uid)).then(s=>{const p=s.exists()?s.data():{};const name=p.fullName||p.name||user.displayName||"Founder";text("founderName",name.split(" ")[0]);text("founderDisplayName",name);text("founderEmail",p.email||user.email||"—");text("founderAvatar",name.charAt(0).toUpperCase());}).catch(console.warn);}

onAuthStateChanged(auth,user=>{if(user)loadProfile(user);});
listen("users",snap=>{const docs=snap.docs.map(d=>d.data());state.students=docs.filter(d=>d.role==="student").length;state.instructors=docs.filter(d=>d.role==="instructor").length;refresh();});
listen("students",snap=>{const n=snap.size;if(n>state.students)state.students=n;refresh();});
listen("instructors",snap=>{const n=snap.size;if(n>state.instructors)state.instructors=n;refresh();});
listen("courses",snap=>{state.courses=snap.docs.filter(d=>d.data().status!=="archived").length;refresh();});
listen("payments",snap=>{state.payments=snap.docs.map(d=>d.data());state.revenue=state.payments.filter(completed).reduce((s,p)=>s+amount(p),0);refresh();});
listen("activity",snap=>{state.activity=snap.docs.map(d=>d.data());refresh();});
listen("reports",snap=>text("openReports",snap.docs.filter(d=>!["resolved","closed"].includes(String(d.data().status||"").toLowerCase())).length.toLocaleString()));
bindActions();
