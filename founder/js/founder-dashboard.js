import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 });
const state = { students:0, instructors:0, courses:0, revenue:0, payments:[], activity:[] };
const $ = id => document.getElementById(id);
const text = (id,value) => { const el=$(id); if(el) el.textContent=value; };
const amount = p => Number(p.amount ?? p.total ?? p.price ?? 0) || 0;
const dateOf = v => v?.toDate ? v.toDate() : (v ? new Date(v) : null);
const completed = p => ["completed","success","successful","paid","succeeded"].includes(String(p.status ?? p.paymentStatus ?? "").toLowerCase());
const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

function refresh(){
  text("totalStudents",state.students.toLocaleString());
  text("totalInstructors",state.instructors.toLocaleString());
  text("activeCourses",state.courses.toLocaleString());
  text("totalRevenue",money.format(state.revenue));
  const todayStart=new Date(); todayStart.setHours(0,0,0,0);
  const activeToday=state.activity.filter(item=>{const d=dateOf(item.createdAt||item.timestamp||item.date);return d&&d>=todayStart;}).length;
  text("platformActivity",activeToday.toLocaleString());
  text("studentGrowth",state.students ? "Live academy total" : "No students yet");
  text("revenueGrowth",state.revenue ? "Completed recorded payments" : "No completed payments");
  text("lastSystemSync",new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
  renderChart(); renderBrief(); renderActivity();
}

function renderBrief(){
  const message=state.students?`${state.students.toLocaleString()} learners, ${state.instructors.toLocaleString()} instructors and ${state.courses.toLocaleString()} active courses are currently under your command.`:"Your Founder Console is connected. Student and instructor records will appear here as soon as they exist.";
  text("founderAiBrief",message);
}

function renderChart(){
  const chart=$("revenueChart"); if(!chart)return;
  const days=Math.min(365,Math.max(7,Number($("revenuePeriod")?.value||30)));
  const today=new Date(); today.setHours(0,0,0,0);
  const totals=Array.from({length:days},()=>0);
  state.payments.filter(completed).forEach(p=>{const d=dateOf(p.paidAt||p.createdAt||p.updatedAt);if(!d||Number.isNaN(d.getTime()))return;d.setHours(0,0,0,0);const age=Math.floor((today-d)/86400000);if(age>=0&&age<days)totals[days-1-age]+=amount(p);});
  const max=Math.max(...totals,1);chart.replaceChildren();const bars=document.createElement("div");bars.className="founder-revenue-bars";
  totals.forEach(v=>{const bar=document.createElement("div");bar.className="founder-revenue-bar";bar.style.height=`${Math.max(v?6:2,(v/max)*100)}%`;bar.title=money.format(v);bars.appendChild(bar);});chart.appendChild(bars);
}

function renderActivity(){
  const list=$("founderActivityList");if(!list)return;list.replaceChildren();
  if(!state.activity.length){const empty=document.createElement("p");empty.className="founder-empty-state";empty.textContent="No recent platform activity yet.";list.appendChild(empty);return;}
  state.activity.slice().sort((a,b)=>(dateOf(b.createdAt||b.timestamp)?.getTime()||0)-(dateOf(a.createdAt||a.timestamp)?.getTime()||0)).slice(0,8).forEach(item=>{const row=document.createElement("article");row.className="founder-activity-item";row.innerHTML=`<span class="founder-activity-icon">${escapeHTML(item.icon||"✦")}</span><div><strong>${escapeHTML(item.title||item.type||"Platform activity")}</strong><p>${escapeHTML(item.message||item.description||"An academy event was recorded.")}</p></div>`;list.appendChild(row);});
}

function bind(id,url){$(id)?.addEventListener("click",()=>{window.location.href=url;});}
function bindActions(){bind("manageStudentsBtn","students.html");bind("manageInstructorsBtn","instructors.html");bind("manageCoursesBtn","courses.html");bind("viewRevenueBtn","revenue.html");bind("viewReportsBtn","reports.html");bind("openSettingsBtn","platform-settings.html");bind("openSparkAiBtn","spark-ai.html");bind("viewAllActivityBtn","analytics.html");$("revenuePeriod")?.addEventListener("change",renderChart);}

function listen(path,callback){return onSnapshot(collection(db,path),callback,error=>console.error(`Founder ${path} listener failed`,error));}

async function loadProfile(user){
  try{
    // Founder records are authoritative in founder/{uid}; users/{uid} is only a fallback.
    let snapshot=await getDoc(doc(db,"founder",user.uid));
    let profile=snapshot.exists()?snapshot.data():null;
    if(!profile){snapshot=await getDoc(doc(db,"users",user.uid));profile=snapshot.exists()?snapshot.data():null;}
    const name=profile?.name||profile?.fullName||profile?.displayName||user.displayName||"Founder";
    text("founderName",name.split(" ")[0]);text("founderDisplayName",name);text("founderEmail",profile?.email||user.email||"—");text("founderAvatar",name.charAt(0).toUpperCase());
  }catch(error){console.error("Founder profile error:",error);}
}

onAuthStateChanged(auth,user=>{if(user)loadProfile(user);});
listen("users",snap=>{const docs=snap.docs.map(d=>d.data());state.students=docs.filter(d=>d.role==="student").length;state.instructors=docs.filter(d=>d.role==="instructor").length;refresh();});
listen("students",snap=>{state.students=Math.max(state.students,snap.size);refresh();});
listen("instructors",snap=>{state.instructors=Math.max(state.instructors,snap.size);refresh();});
listen("courses",snap=>{state.courses=snap.docs.filter(d=>String(d.data().status||"").toLowerCase()!=="archived").length;refresh();});
listen("payments",snap=>{state.payments=snap.docs.map(d=>d.data());state.revenue=state.payments.filter(completed).reduce((sum,p)=>sum+amount(p),0);refresh();});
listen("activity",snap=>{state.activity=snap.docs.map(d=>d.data());refresh();});
listen("reports",snap=>text("openReports",snap.docs.filter(d=>!["resolved","closed","dismissed"].includes(String(d.data().status||"").toLowerCase())).length.toLocaleString()));
bindActions();
