import { db } from "../js/firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 });
const $ = (id) => document.getElementById(id);
const state = {
  students:0, enrollments:[], courses:[], instructors:0, certificates:[], payments:[],
  ready:new Set(), errors:new Map()
};
const sources = ["students","enrollments","courses","instructors","certificates","payments"];
const amount = item => {
  const value=Number(item.amount ?? item.total ?? item.price ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const dateOf = item => {
  const value=item.paidAt || item.createdAt || item.updatedAt;
  if (!value) return null;
  const date=value?.toDate ? value.toDate() : new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
};
const enrollmentCount = course => Number(course.enrollmentCount || course.students || 0) || 0;

function setDataStatus() {
  const status=$("analyticsDataStatus");
  const label=$("analyticsDataStatusText");
  if (!status || !label) return;
  status.classList.toggle("has-error",state.errors.size>0);
  status.classList.toggle("is-ready",state.ready.size===sources.length && state.errors.size===0);
  if (state.errors.size) {
    label.textContent=`Data access issue: ${[...state.errors.keys()].join(", ")}. Some figures may be incomplete.`;
  } else if (state.ready.size===sources.length) {
    label.textContent="Live Academy data connected";
  } else {
    label.textContent=`Connecting to Academy data… ${state.ready.size}/${sources.length} sources ready`;
  }
}

function render() {
  const days=Number($("analyticsPeriod")?.value || 30);
  const start=new Date();
  start.setDate(start.getDate()-days+1);
  start.setHours(0,0,0,0);
  const periodPayments=state.payments.filter(item=>{
    const date=dateOf(item);
    return date && date>=start && date<=new Date();
  });
  const total=periodPayments.reduce((sum,item)=>sum+amount(item),0);
  const activeCourses=state.courses.filter(course=>String(course.status||"").toLowerCase()!=="archived");
  const enrollments=state.enrollments.length;
  const conversion=state.students ? Math.round((enrollments/state.students)*100) : null;

  $("analyticsStudents").textContent=state.students.toLocaleString();
  $("analyticsEnrollments").textContent=enrollments.toLocaleString();
  $("analyticsConversion").textContent=conversion===null?"—":`${conversion}%`;
  $("analyticsRevenue").textContent=money.format(total);
  $("chartTotal").textContent=money.format(total);
  $("analyticsCourses").textContent=activeCourses.length.toLocaleString();
  $("analyticsInstructors").textContent=state.instructors.toLocaleString();
  $("analyticsCertificates").textContent=state.certificates.length.toLocaleString();
  $("studentTrend").textContent=state.students?"Current learner records":"No learner records yet";
  $("revenueTrend").textContent=`${days}-day reporting window`;
  $("revenueChartCaption").textContent=`Daily recorded payments · Last ${days} days · ${periodPayments.length} payment records`;
  $("analyticsBrief").textContent=state.students
    ? `The Academy currently has ${state.students.toLocaleString()} learner records and ${activeCourses.length.toLocaleString()} active courses. ${total ? `${money.format(total)} is recorded in the selected period.` : "No payments are recorded in the selected period."}`
    : "Learner activity will appear here after the first student account is created.";

  renderBars(days,periodPayments);
  renderCourses();
  setDataStatus();
}

function renderBars(days,payments) {
  const chart=$("revenueBars");
  if (!chart) return;
  chart.replaceChildren();
  const count=Math.min(days,30);
  const buckets=Array.from({length:count},()=>0);
  const today=new Date();
  today.setHours(0,0,0,0);
  payments.forEach(payment=>{
    const date=dateOf(payment);
    if (!date) return;
    date.setHours(0,0,0,0);
    const age=Math.floor((today-date)/86400000);
    if (age>=0 && age<count) buckets[count-1-age]+=amount(payment);
  });
  const max=Math.max(...buckets,1);
  buckets.forEach((value,index)=>{
    const bar=document.createElement("span");
    bar.className="chart-bar";
    bar.style.height=`${Math.max(3,(value/max)*100)}%`;
    bar.title=`${money.format(value)} · Day ${index+1}`;
    bar.setAttribute("aria-label",bar.title);
    chart.append(bar);
  });
  if (!payments.length) {
    const empty=document.createElement("span");
    empty.className="chart-empty";
    empty.textContent="No recorded payments in this period";
    chart.append(empty);
  }
}

function renderCourses() {
  const list=$("coursePerformance");
  if (!list) return;
  list.replaceChildren();
  const ranked=state.courses
    .filter(course=>String(course.status||"").toLowerCase()!=="archived")
    .slice()
    .sort((a,b)=>enrollmentCount(b)-enrollmentCount(a))
    .slice(0,5);
  if (!ranked.length) {
    const empty=document.createElement("p");
    empty.className="empty";
    empty.textContent="No active courses are available to rank.";
    list.append(empty);
    return;
  }
  const maximum=Math.max(...ranked.map(enrollmentCount),1);
  ranked.forEach((course,index)=>{
    const count=enrollmentCount(course);
    const row=document.createElement("div");
    row.className="ranked-row";
    const copy=document.createElement("div");
    const name=document.createElement("strong");
    name.textContent=course.title || course.name || "Untitled course";
    const line=document.createElement("span");
    line.textContent=`${count.toLocaleString()} enrollments`;
    const progress=document.createElement("div");
    progress.className="progress";
    progress.setAttribute("role","meter");
    progress.setAttribute("aria-label",`${name.textContent} enrollment performance`);
    progress.setAttribute("aria-valuemin","0");
    progress.setAttribute("aria-valuemax",String(maximum));
    progress.setAttribute("aria-valuenow",String(count));
    const fill=document.createElement("i");
    fill.style.width=`${(count/maximum)*100}%`;
    progress.append(fill);
    copy.append(name,line,progress);
    const rank=document.createElement("span");
    rank.className="course-rank";
    rank.textContent=`#${index+1}`;
    row.append(copy,rank);
    list.append(row);
  });
}

const setters={
  students:docs=>state.students=docs.length,
  enrollments:docs=>state.enrollments=docs,
  courses:docs=>state.courses=docs,
  instructors:docs=>state.instructors=docs.length,
  certificates:docs=>state.certificates=docs,
  payments:docs=>state.payments=docs
};
const unsubscribers=sources.map(name=>onSnapshot(
  collection(db,name),
  snapshot=>{
    setters[name](snapshot.docs.map(entry=>entry.data()));
    state.ready.add(name);
    state.errors.delete(name);
    render();
  },
  error=>{
    console.error(`Analytics ${name} listener failed:`,error);
    state.errors.set(name,error.code||"permission/network error");
    setDataStatus();
    window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:`Analytics data listener denied: ${name}`});
  }
));
$("analyticsPeriod")?.addEventListener("change",render);
window.addEventListener("beforeunload",()=>unsubscribers.forEach(unsubscribe=>unsubscribe()),{once:true});
window.addEventListener("DOMContentLoaded",()=>window.lucide?.createIcons());
