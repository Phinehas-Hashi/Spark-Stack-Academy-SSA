import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const grid = $("myLearningGrid");
const errorPanel = $("myLearningError");
const searchInput = $("myLearningSearch");
const countLabel = $("myLearningCount");
let currentUser = null;
let allCourses = [];
let activeFilter = "all";
let searchTerm = "";

const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const clampProgress = value => Math.max(0,Math.min(100,Number(value)||0));
const toMillis = value => value?.toMillis?.() ?? value?.toDate?.()?.getTime?.() ?? (Date.parse(value)||0);

function setStat(id,value){const node=$(id);if(node)node.textContent=String(value);}
function showLoading(){
  errorPanel.hidden=true;grid.hidden=false;
  grid.innerHTML='<div class="my-learning-state"><i data-lucide="loader-circle"></i><h3>Preparing your learning space</h3><p>Loading your active course access.</p></div>';
  window.lucide?.createIcons();
}
function showEmpty(message="No active courses found"){
  grid.innerHTML='<div class="my-learning-state"><i data-lucide="book-open"></i><h3>'+escapeHTML(message)+'</h3><p>Courses you purchase or receive through an institution will appear here once access is active.</p><a class="my-learning-explore" href="marketplace.html">Explore the Academy Marketplace</a></div>';
  countLabel.textContent="0 courses";
  setStat("myLearningTotal",0);setStat("myLearningActive",0);setStat("myLearningCompleted",0);setStat("myLearningAverage","0%");
}
async function loadMyLearning(){
  if(!currentUser)return;
  showLoading();
  try{
    const records=new Map();
    // Canonical access source: active, student-owned course entitlements.
    const entitlementQuery=query(collection(db,"courseEntitlements"),where("studentUid","==",currentUser.uid));
    const entitlementSnap=await getDocs(entitlementQuery);
    for(const item of entitlementSnap.docs){
      const data=item.data()||{};
      if(data.status!=="active")continue;
      if(data.expiresAt && toMillis(data.expiresAt)>0 && toMillis(data.expiresAt)<=Date.now())continue;
      const grants=Object.values(data.grants||{}).filter(grant=>grant?.status==="active");
      if(!grants.length)continue;
      const courseId=String(data.courseId||"");
      if(!courseId)continue;
      const preferred=grants.find(grant=>grant.source==="marketplace_purchase")||grants.find(grant=>grant.source==="institution_enrollment")||grants[0];
      records.set(courseId,{courseId,progress:clampProgress(preferred.progress??data.progress),source:preferred.source||"enrolment",institutionName:preferred.institutionName||"",grantedAt:data.createdAt||data.updatedAt||null});
    }
    // Compatibility bridge for older enrolments not yet migrated to entitlements.
    const legacySnap=await getDocs(collection(db,"students",currentUser.uid,"enrollments"));
    for(const item of legacySnap.docs){
      const data=item.data()||{};
      const courseId=String(data.courseId||item.id);
      if(!courseId||records.has(courseId))continue;
      const status=String(data.status||"active").toLowerCase();
      if(["revoked","cancelled","inactive","expired"].includes(status))continue;
      records.set(courseId,{courseId,progress:clampProgress(data.progress),source:"legacy_enrolment",institutionName:data.institutionName||"",grantedAt:data.joinedAt||data.createdAt||null,legacy:data});
    }
    const hydrated=await Promise.all([...records.values()].map(async record=>{
      try{
        const snap=await getDoc(doc(db,"courses",record.courseId));
        const course=snap.exists()?snap.data():{};
        const fallback=record.legacy||{};
        return {...record,...course,title:course.title||fallback.courseTitle||fallback.courseName||"Course",description:course.description||"Continue your learning journey.",category:course.category||"Learning",level:course.level||"All levels",thumbnail:course.thumbnail||course.image||"",progress:clampProgress(record.progress),instructorName:course.instructorName||course.instructor||"Spark Stack Academy"};
      }catch(err){
        console.warn("Course details unavailable:",record.courseId,err);
        return {...record,title:record.legacy?.courseTitle||record.legacy?.courseName||"Enrolled course",description:"Your course access is recorded. Course details are temporarily unavailable.",category:"Learning",level:"",thumbnail:"",progress:clampProgress(record.progress)};
      }
    }));
    allCourses=hydrated.sort((a,b)=>toMillis(b.grantedAt)-toMillis(a.grantedAt));
    errorPanel.hidden=true;
    if(!allCourses.length){showEmpty();return;}
    renderCourses();
  }catch(error){
    console.error("My Learning load failed:",error);
    grid.hidden=true;errorPanel.hidden=false;countLabel.textContent="Unavailable";
  }
}
function renderCourses(){
  const filtered=allCourses.filter(course=>{
    const completed=course.progress>=100;
    const matches=activeFilter==="all"||(activeFilter==="completed"&&completed)||(activeFilter==="progress"&&!completed);
    const searchable=[course.title,course.description,course.category,course.instructorName,course.institutionName].join(" ").toLowerCase();
    return matches&&(!searchTerm||searchable.includes(searchTerm));
  });
  const total=allCourses.length,completed=allCourses.filter(course=>course.progress>=100).length;
  setStat("myLearningTotal",total);setStat("myLearningActive",total-completed);setStat("myLearningCompleted",completed);
  setStat("myLearningAverage",total?Math.round(allCourses.reduce((sum,course)=>sum+course.progress,0)/total)+"%":"0%");
  countLabel.textContent=filtered.length+" "+(filtered.length===1?"course":"courses");
  if(!filtered.length){grid.innerHTML='<div class="my-learning-state"><i data-lucide="search-x"></i><h3>No courses match these filters</h3><p>Try another search or switch to All courses.</p></div>';window.lucide?.createIcons();return;}
  grid.innerHTML=filtered.map(course=>{
    const progress=clampProgress(course.progress),completed=progress>=100;
    const source=course.source==="institution_enrollment"?"Institution access":course.source==="marketplace_purchase"?"Marketplace purchase":course.source==="legacy_enrolment"?"Existing enrolment":"Course access";
    const image=course.thumbnail?'<img src="'+escapeHTML(course.thumbnail)+'" alt="'+escapeHTML(course.title)+'" loading="lazy">':'<div class="my-learning-cover-placeholder"><i data-lucide="book-open"></i></div>';
    return '<article class="my-learning-card"><div class="my-learning-cover">'+image+'<span class="my-learning-source">'+escapeHTML(source)+'</span></div><div class="my-learning-card-body"><div class="my-learning-meta"><span>'+escapeHTML(course.category)+'</span><span>'+escapeHTML(course.level)+'</span></div><h3>'+escapeHTML(course.title)+'</h3><p>'+escapeHTML(course.description)+'</p><div class="my-learning-progress"><div class="my-learning-progress-label"><span>'+(completed?"Course completed":"Your progress")+'</span><strong>'+progress+'%</strong></div><div class="my-learning-progress-track"><span style="width:'+progress+'%"></span></div></div><a class="my-learning-open" href="course-player.html?courseId='+encodeURIComponent(course.courseId)+'">'+(completed?"Review course":"Continue learning")+' <i data-lucide="arrow-right"></i></a></div></article>';
  }).join("");
  window.lucide?.createIcons();
}
onAuthStateChanged(auth,async user=>{
  if(!user){window.location.replace("../login.html");return;}
  currentUser=user;await loadMyLearning();
});
searchInput?.addEventListener("input",()=>{searchTerm=searchInput.value.trim().toLowerCase();renderCourses();});
document.querySelectorAll(".my-learning-filters button").forEach(button=>button.addEventListener("click",()=>{
  activeFilter=button.dataset.filter||"all";
  document.querySelectorAll(".my-learning-filters button").forEach(item=>{const selected=item===button;item.classList.toggle("active",selected);item.setAttribute("aria-pressed",String(selected));});
  renderCourses();
}));
$("myLearningRetry")?.addEventListener("click",loadMyLearning);
