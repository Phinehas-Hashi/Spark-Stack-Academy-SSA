import { db } from "../js/firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const getGlobalStats = httpsCallable(getFunctions(), "getFounderGlobalStats");

const money = new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 });
const $ = (id) => document.getElementById(id);
const state = { students:0, enrollments:[], courses:[], instructors:0, certificates:0, payments:[] };
const amount = (item) => Number(item.amount || item.total || item.price || 0) || 0;
const dateOf = (item) => { const value=item.paidAt || item.createdAt || item.updatedAt; return value?.toDate ? value.toDate() : value ? new Date(value) : null; };

function render() {
  const days = Number($("analyticsPeriod")?.value || 30); const start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0,0,0,0);
  const periodPayments = state.payments.filter((item) => { const date=dateOf(item); return date && !Number.isNaN(date) && date >= start; });
  const total = periodPayments.reduce((sum,item) => sum + amount(item), 0);
  $("analyticsStudents").textContent = state.students.toLocaleString(); $("analyticsEnrollments").textContent = state.enrollments.length.toLocaleString();
  $("analyticsConversion").textContent = state.students ? `${Math.round((state.enrollments.length / state.students) * 100)}%` : "—"; $("analyticsRevenue").textContent = money.format(total); $("chartTotal").textContent = money.format(total);
  $("analyticsCourses").textContent = state.courses.filter((course) => course.status !== "archived").length.toLocaleString(); $("analyticsInstructors").textContent=state.instructors.toLocaleString(); $("analyticsCertificates").textContent=state.certificates.toLocaleString();
  $("studentTrend").textContent = state.students ? "Live learner total" : "Ready for your first learner"; $("revenueTrend").textContent = `${days}-day reporting window`;
  $("analyticsBrief").textContent = state.students ? `Your academy has ${state.students.toLocaleString()} learners across ${state.courses.length.toLocaleString()} courses. ${total ? `${money.format(total)} was recorded in the selected period.` : "No payments have been recorded in this period."}` : "Start by publishing a course and inviting learners. This page will turn their activity into founder-ready signals.";
  renderBars(days, periodPayments); renderCourses();
}

function renderBars(days, payments) { const chart=$("revenueBars"); chart.replaceChildren(); const buckets=Array.from({length:Math.min(days,30)},()=>0); const today=new Date(); today.setHours(0,0,0,0); payments.forEach((payment)=>{const d=dateOf(payment); d.setHours(0,0,0,0); const age=Math.floor((today-d)/86400000); if(age>=0 && age<buckets.length) buckets[buckets.length-1-age]+=amount(payment);}); const max=Math.max(...buckets,1); buckets.forEach((value)=>{const bar=document.createElement("span");bar.className="chart-bar";bar.style.height=`${Math.max(4,(value/max)*100)}%`;bar.title=money.format(value);chart.append(bar);}); }
function renderCourses() { const list=$("coursePerformance"); list.replaceChildren(); const ranked=state.courses.slice(0,5); if(!ranked.length){list.innerHTML='<p class="empty">Publish courses to begin measuring catalog performance.</p>';return;} const maximum=Math.max(...ranked.map((course)=>Number(course.enrollmentCount || course.students || 0)),1); ranked.forEach((course)=>{const count=Number(course.enrollmentCount || course.students || 0);const row=document.createElement("div");row.className="ranked-row";const copy=document.createElement("div");const name=document.createElement("strong");name.textContent=course.title || course.name || "Untitled course";const line=document.createElement("span");line.textContent=`${count.toLocaleString()} enrollments`;const progress=document.createElement("div");progress.className="progress";const fill=document.createElement("i");fill.style.width=`${(count/maximum)*100}%`;progress.append(fill);copy.append(name,line,progress);const value=document.createElement("span");value.textContent=course.status || "active";row.append(copy,value);list.append(row);}); }
[["students",(docs)=>state.students=docs.length],["enrollments",(docs)=>state.enrollments=docs],["courses",(docs)=>state.courses=docs],["instructors",(docs)=>state.instructors=docs.length],["certificates",(docs)=>state.certificates=docs.length],["payments",(docs)=>state.payments=docs]].forEach(([name,apply])=>onSnapshot(collection(db,name),(snapshot)=>{apply(snapshot.docs.map((entry)=>entry.data()));render();}));
$("analyticsPeriod")?.addEventListener("change",render); window.addEventListener("DOMContentLoaded",()=>window.lucide?.createIcons());

const countryNames = new Intl.DisplayNames(["en"], { type:"region" });
function renderGlobalStats(data) {
  const rows = data.countries || [];
  const located = rows.reduce((sum,row)=>sum+Number(row.users||0),0);
  $("globalCountries").textContent=Number(data.countriesTracked||0).toLocaleString();
  $("globalLocatedUsers").textContent=located.toLocaleString();
  $("globalActiveUsers").textContent=Number(data.activeUsers||0).toLocaleString();
  $("globalUnknownUsers").textContent=Number(data.unknownCountry||0).toLocaleString();
  $("globalStatsUpdated").textContent=data.generatedAt?new Date(data.generatedAt).toLocaleString():"Updated just now";
  const max=Math.max(...rows.map(row=>Number(row.users||0)),1);
  $("globalCountryRows").replaceChildren();
  if(!rows.length){$("globalCountryRows").innerHTML='<p class="empty">No country information has been supplied in user profiles yet.</p>';}
  rows.forEach(row=>{
    const name=countryNames.of(row.countryCode)||row.countryCode;
    const item=document.createElement("div");item.className="global-country-row";
    const top=document.createElement("div");top.className="global-country-top";
    const label=document.createElement("strong");label.textContent=name+" ("+row.countryCode+")";
    const counts=document.createElement("span");counts.textContent=Number(row.users||0).toLocaleString()+" users · "+Number(row.activeUsers||0).toLocaleString()+" active";
    top.append(label,counts);
    const track=document.createElement("div");track.className="global-country-track";
    const fill=document.createElement("i");fill.style.width=(Number(row.users||0)/max*100)+"%";track.append(fill);
    item.append(top,track);$("globalCountryRows").append(item);
  });
  const roles=data.roles||{};$("globalRoleRows").replaceChildren();
  Object.entries(roles).sort((a,b)=>b[1]-a[1]).forEach(([role,count])=>{
    const line=document.createElement("div");line.className="global-role-row";
    const label=document.createElement("span");label.textContent=role.replace(/_/g," ");
    const value=document.createElement("strong");value.textContent=Number(count).toLocaleString();
    line.append(label,value);$("globalRoleRows").append(line);
  });
  $("globalDataNote").textContent=(data.scanLimitReached?"One or more data scans reached a safety limit. ":"")+Number(data.unknownCountry||0).toLocaleString()+" accounts have no recognized country field. No location is inferred from IP addresses.";
}

function renderGrowthStats(data){
  const fmt=n=>Number(n||0).toLocaleString();
  $("globalInstitutions").textContent=fmt(data.institutions);
  $("globalActiveInstitutions").textContent=fmt(data.activeInstitutions);
  $("globalCourseSales").textContent=fmt(data.verifiedCourseSales);
  $("globalOnboardingPayments").textContent=fmt(data.verifiedOnboardingPayments);
  const months=data.monthlyRegistrations||[];
  const max=Math.max(...months.map(x=>Number(x.count||0)),1);
  const trend=$("registrationTrend");trend.replaceChildren();
  if(!months.length){const p=document.createElement("p");p.className="empty";p.textContent="No valid account creation dates were found.";trend.append(p);}
  months.forEach(item=>{
    const row=document.createElement("div");row.className="registration-month";
    const label=document.createElement("span");label.textContent=item.month;
    const track=document.createElement("div");track.className="registration-track";
    const fill=document.createElement("i");fill.style.width=(Number(item.count||0)/max*100)+"%";track.append(fill);
    const value=document.createElement("strong");value.textContent=fmt(item.count);
    row.append(label,track,value);trend.append(row);
  });
  const revenue=$("verifiedRevenueBreakdown");revenue.replaceChildren();
  const streams=[
    ["Course sales · KES",data.verifiedCourseRevenueKES],
    ["Institution onboarding · KES",data.verifiedOnboardingRevenueKES]
  ];
  streams.forEach(([label,value])=>{const row=document.createElement("div");row.className="global-role-row";const a=document.createElement("span");a.textContent=label;const b=document.createElement("strong");b.textContent=money.format(Number(value||0));row.append(a,b);revenue.append(row);});
  [["Course sales",data.courseRevenueByCurrency],["Onboarding",data.onboardingRevenueByCurrency]].forEach(([label,values])=>{
    Object.entries(values||{}).filter(([code])=>code!=="KES").forEach(([code,value])=>{const row=document.createElement("div");row.className="global-role-row";const a=document.createElement("span");a.textContent=label+" · "+code;const b=document.createElement("strong");b.textContent=Number(value).toLocaleString(undefined,{maximumFractionDigits:2})+" "+code;row.append(a,b);revenue.append(row);});
  });
  const countryList=$("countryCommerceRows");countryList.replaceChildren();
  (data.countries||[]).filter(x=>x.users||x.institutions||x.courseSales).forEach(country=>{
    const row=document.createElement("div");row.className="country-commerce-row";
    const title=document.createElement("strong");title.textContent=(countryNames.of(country.countryCode)||country.countryCode)+" ("+country.countryCode+")";
    const detail=document.createElement("span");detail.textContent=fmt(country.institutions)+" institutions · "+fmt(country.courseSales)+" verified course sales · "+money.format(Number(country.courseRevenueKES||0))+" course revenue · "+money.format(Number(country.onboardingRevenueKES||0))+" onboarding";
    const popular=document.createElement("small");popular.textContent=(country.popularCourses||[]).map(x=>x.courseId+" ("+x.sales+")").join(" · ")||"No course sales recorded";
    row.append(title,detail,popular);countryList.append(row);
  });
  const top=$("globalTopCourses");top.replaceChildren();
  (data.topCourses||[]).forEach((course,index)=>{const row=document.createElement("div");row.className="global-role-row";const a=document.createElement("span");a.textContent=(index+1)+". "+course.courseId;const b=document.createElement("strong");b.textContent=fmt(course.sales)+" sales";row.append(a,b);top.append(row);});
  if(!(data.topCourses||[]).length){const p=document.createElement("p");p.className="empty";p.textContent="No posted course sales yet.";top.append(p);}
  const scanned=data.scanned||{},limits=data.scanLimits||{};
  $("globalGrowthDataNote").textContent="Scanned "+fmt(scanned.users)+" user profiles, "+fmt(scanned.institutions)+" institutions, "+fmt(scanned.paymentLedger)+" posted-ledger records and "+fmt(scanned.institutionPayments)+" institution payment records. "+(data.scanLimitReached?"At least one scan reached its safety limit; totals may be partial. ":"")+fmt(data.unknownInstitutionCountry)+" institutions have no recognized country. Course labels currently use course IDs; revenue totals are shown in KES separately from other currencies.";
}
async function loadGlobalStats(){
  const button=$("refreshGlobalStats");if(button)button.disabled=true;
  $("globalStatsUpdated").textContent="Refreshing…";
  try{const result=await getGlobalStats();renderGlobalStats(result.data||{});renderGrowthStats(result.data||{});}
  catch(error){console.error("Global country analytics failed:",error);$("globalCountryRows").innerHTML='<p class="empty">Global statistics unavailable: '+String(error.message||"permission or network error")+'</p>';$("globalStatsUpdated").textContent="Refresh failed";}
  finally{if(button)button.disabled=false;}
}
$("refreshGlobalStats")?.addEventListener("click",loadGlobalStats);
loadGlobalStats();
