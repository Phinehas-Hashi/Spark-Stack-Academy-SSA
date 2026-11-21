import { db } from "../js/firebase.js";
import { collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const getGlobalStats = httpsCallable(getFunctions(), "getFounderGlobalStats");

const money = new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 });
const $ = (id) => document.getElementById(id);
const state = { students:0, enrollments:[], courses:[], instructors:0, certificates:0, payments:[] };
let academyMap = null;
let countryGeoLayer = null;
let mapCountryStats = {};
const amount = (item) => Number(item.amount || item.total || item.price || 0) || 0;
const dateOf = (item) => { const value=item.paidAt || item.createdAt || item.updatedAt; return value?.toDate ? value.toDate() : value ? new Date(value) : null; };

function render() {
  const days = Number($("analyticsPeriod")?.value || 30); const start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0,0,0,0);
  const periodPayments = state.payments.filter((item) => { const status=String(item.status||"").toLowerCase(); const settled=["paid","success","successful","completed"].includes(status); if(!settled) return false; if(item.provider==="manual_safaricom_receipt" && item.verificationStatus!=="verified") return false; const date=dateOf(item); return date && !Number.isNaN(date) && date >= start; });
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
    const titleMap=new Map((data.topCourses||[]).map(x=>[x.courseId,x.title||x.courseId]));const popular=document.createElement("small");popular.textContent=(country.popularCourses||[]).map(x=>(titleMap.get(x.courseId)||x.courseId)+" ("+x.sales+")").join(" · ")||"No course sales recorded";
    row.append(title,detail,popular);countryList.append(row);
  });
  const top=$("globalTopCourses");top.replaceChildren();
  (data.topCourses||[]).forEach((course,index)=>{const row=document.createElement("div");row.className="global-role-row";const a=document.createElement("span");a.textContent=(index+1)+". "+(course.title||course.courseId);const b=document.createElement("strong");b.textContent=fmt(course.sales)+" sales";row.append(a,b);top.append(row);});
  if(!(data.topCourses||[]).length){const p=document.createElement("p");p.className="empty";p.textContent="No posted course sales yet.";top.append(p);}
  const scanned=data.scanned||{},limits=data.scanLimits||{};
  $("globalGrowthDataNote").textContent="Scanned "+fmt(scanned.users)+" user profiles, "+fmt(scanned.institutions)+" institutions, "+fmt(scanned.paymentLedger)+" posted-ledger records and "+fmt(scanned.institutionPayments)+" institution payment records. "+(data.scanLimitReached?"At least one scan reached its safety limit; totals may be partial. ":"")+fmt(data.unknownInstitutionCountry)+" institutions have no recognized country. Course labels currently use course IDs; revenue totals are shown in KES separately from other currencies.";
}

function normalizeCountryCode(data){
  const raw=String(data.countryCode||data.location?.countryCode||data.address?.countryCode||"").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw)?raw:"";
}
function aggregateBrowserCountryData(userDocs,institutionDocs){
  const countries={};let unknownUsers=0,unknownInstitutions=0;
  userDocs.forEach(doc=>{const data=doc.data();const code=normalizeCountryCode(data);if(!code){unknownUsers++;return;}countries[code]??={countryCode:code,users:0,activeUsers:0,institutions:0};countries[code].users++;if(data.active===true||data.status==="active")countries[code].activeUsers++;});
  institutionDocs.forEach(doc=>{const data=doc.data();const code=normalizeCountryCode(data);if(!code){unknownInstitutions++;return;}countries[code]??={countryCode:code,users:0,activeUsers:0,institutions:0};countries[code].institutions++;});
  return {countries:Object.values(countries).sort((a,b)=>(b.users+b.institutions)-(a.users+a.institutions)),totalUsers:userDocs.length,totalInstitutions:institutionDocs.length,unknownUsers,unknownInstitutions};
}
function mapColor(count,max){if(!count)return "#182b43";const intensity=Math.min(1,count/Math.max(max,1));return intensity>.7?"#12b8a6":intensity>.35?"#2878d0":"#526b9b";}
async function renderAcademyWorldMap(stats){
  mapCountryStats={};(stats.countries||[]).forEach(row=>{mapCountryStats[row.countryCode]=row;});
  const source=$("mapDataSource"),coverage=$("mapCoverageNote");
  if(!window.L){if(source)source.textContent="Map library unavailable";if(coverage)coverage.textContent="Country ranking remains available above.";return;}
  if(!academyMap){academyMap=L.map("academyWorldMap",{scrollWheelZoom:false,worldCopyJump:true}).setView([15,10],2);L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:6}).addTo(academyMap);}
  if(countryGeoLayer){countryGeoLayer.remove();countryGeoLayer=null;}
  try{
    const response=await fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson");
    if(!response.ok)throw new Error("Country boundary data unavailable");
    const geo=await response.json();
    const max=Math.max(...Object.values(mapCountryStats).map(x=>Number(x.users||0)+Number(x.institutions||0)),1);
    countryGeoLayer=L.geoJSON(geo,{style:feature=>{const p=feature.properties||{};const code=String(p.ISO_A2||p.ISO_A2_EH||"").toUpperCase();const row=mapCountryStats[code];return {color:"#8da3c1",weight:.55,fillColor:mapColor(row?Number(row.users||0)+Number(row.institutions||0):0,max),fillOpacity:(row && (Number(row.users||0)>0 || Number(row.institutions||0)>0))?0.65:0.16};},onEachFeature:(feature,layer)=>{const p=feature.properties||{};const code=String(p.ISO_A2||p.ISO_A2_EH||"").toUpperCase();const row=mapCountryStats[code];const name=p.ADMIN||p.name||code;layer.bindPopup("<strong>"+name+"</strong><br>Users: "+Number(row?.users||0).toLocaleString()+"<br>Institutions: "+Number(row?.institutions||0).toLocaleString());}}).addTo(academyMap);
    if(source)source.textContent="Live profile data";
    if(coverage)coverage.textContent=Object.keys(mapCountryStats).length+" countries represented · no IP-based location inference";
    setTimeout(()=>academyMap.invalidateSize(),100);
  }catch(error){console.warn("World map boundary load failed:",error);if(source)source.textContent="Map boundaries unavailable";if(coverage)coverage.textContent="Country totals remain available in the ranking above.";}
}
async function loadBrowserCountryFallback(){
  const [users,institutions]=await Promise.all([getDocs(collection(db,"users")),getDocs(collection(db,"institutions"))]);
  const stats=aggregateBrowserCountryData(users.docs,institutions.docs);
  const rows=stats.countries;
  renderGlobalStats({countries:rows,countriesTracked:rows.length,activeUsers:users.docs.filter(x=>x.data().active===true||x.data().status==="active").length,unknownCountry:stats.unknownUsers+stats.unknownInstitutions,roles:{},generatedAt:new Date().toISOString(),scanLimitReached:false});
  renderAcademyWorldMap({countries:rows});
  $("globalDataNote").textContent="Browser-only fallback: "+stats.totalUsers.toLocaleString()+" user profiles and "+stats.totalInstitutions.toLocaleString()+" institution records read under existing Founder permissions. Unknown country records: "+(stats.unknownUsers+stats.unknownInstitutions)+". Revenue and payment metrics are intentionally unavailable without trusted server-side aggregation.";
  $("globalGrowthDataNote").textContent="Server-side growth and verified revenue metrics are unavailable until a trusted backend is deployed. The map shows profile and institution counts only.";
}
async function loadGlobalStats(){
  const button=$("refreshGlobalStats");if(button)button.disabled=true;
  $("globalStatsUpdated").textContent="Refreshing…";
  try{const result=await getGlobalStats();renderGlobalStats(result.data||{});renderGrowthStats(result.data||{});await renderAcademyWorldMap(result.data||{});}
  catch(error){console.warn("Server-side global stats unavailable; trying Founder-authorized browser fallback:",error);try{await loadBrowserCountryFallback();$("globalStatsUpdated").textContent="Browser-only data";}catch(fallbackError){console.error("Browser country fallback failed:",fallbackError);$("globalCountryRows").innerHTML='<p class="empty">Country analytics unavailable. Check Founder Firestore read permissions and network access.</p>';$("globalStatsUpdated").textContent="Refresh failed";$("mapDataSource").textContent="No map data";}}
  finally{if(button)button.disabled=false;}
}
$("refreshGlobalStats")?.addEventListener("click",loadGlobalStats);
loadGlobalStats();
