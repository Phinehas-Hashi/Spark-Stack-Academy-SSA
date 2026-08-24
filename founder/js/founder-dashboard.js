import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
  totals.forEach((v,i)=>{const bar=document.createElement("div");bar.className="founder-revenue-bar";bar.style.height=`${Math.max(v?6:2,(v/max)*100)}%`;bars.appendChild(bar);}); chart.appendChild(bars);
}
function renderActivity(){
  const list=$("founderActivityList"); if(!list)return; list.replaceChildren();
  if(!state.activity.length){const empty=document.createElement("p");empty.className="founder-empty-state";empty.textContent="No recent platform activity yet.";list.appendChild(empty);return;}
  state.activity.slice(0,8).forEach(item=>{const row=document.createElement("article");row.className="founder-activity-item";row.innerHTML=`<span class="founder-activity-icon">${item.icon||"✦"}</span><div><strong>${item.title||item.type||"Platform activity"}</strong><p>${item.message||item.description||"An academy event was recorded."}</p></div>`;list.appendChild(row);});
}
function bind(id,url){ $(id)?.addEventListener("click",()=>location.href=url); }
function bindActions(){bind("manageStudentsBtn","students.html");bind("manageInstructorsBtn","instructors.html");bind("manageCoursesBtn","courses.html");bind("viewRevenueBtn","revenue.html");bind("viewReportsBtn","reports.html");bind("openSettingsBtn","platform-settings.html");bind("openSparkAiBtn","spark-ai.html");bind("viewAllActivityBtn","analytics.html");$("revenuePeriod")?.addEventListener("change",renderChart);}
function listen(path,callback){return onSnapshot(collection(db,path),callback,error=>console.error(`Founder ${path} listener failed`,error));}
function loadProfile(user){getDoc(doc(db,"users",user.uid)).then(s=>{const p=s.exists()?s.data():{};const name=p.fullName||p.name||user.displayName||"Founder";text("founderName",name.split(" ")[0]);text("founderDisplayName",name);text("founderEmail",user.email||"—");text("founderAvatar",name.charAt(0).toUpperCase());}).catch(console.warn);}

onAuthStateChanged(auth,user=>{if(user)loadProfile(user);});
listen("users",snap=>{const docs=snap.docs.map(d=>d.data());state.students=docs.filter(d=>d.role==="student").length;state.instructors=docs.filter(d=>d.role==="instructor").length;refresh();});
listen("students",snap=>{const n=snap.size;if(n>state.students)state.students=n;refresh();});
listen("instructors",snap=>{const n=snap.size;if(n>state.instructors)state.instructors=n;refresh();});
listen("courses",snap=>{state.courses=snap.docs.filter(d=>d.data().status!=="archived").length;refresh();});
listen("payments",snap=>{state.payments=snap.docs.map(d=>d.data());state.revenue=state.payments.filter(completed).reduce((s,p)=>s+amount(p),0);refresh();});
listen("activity",snap=>{state.activity=snap.docs.map(d=>d.data());refresh();});
listen("reports",snap=>text("openReports",snap.docs.filter(d=>!["resolved","closed"].includes(String(d.data().status||"").toLowerCase())).length.toLocaleString()));
bindActions();
