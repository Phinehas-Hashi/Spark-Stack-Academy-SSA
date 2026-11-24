// Spark Stack Academy — unified student Course Library
// Includes independent Academy enrolments and institution-assigned courses.
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const grid=$("libraryCourses"), search=$("courseSearch"), count=$("courseLibraryCount");
const empty=$("libraryEmptyState"), error=$("libraryErrorState");
const filters=[...document.querySelectorAll(".filter-btn")];
let user=null,courses=[],filter="all",term="";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const time=v=>{if(v?.toMillis)return v.toMillis();if(v?.toDate)return v.toDate().getTime();const n=Date.parse(v||"");return Number.isFinite(n)?n:0;};
const progressOf=r=>Math.min(100,Math.max(0,Number(r.progress??r.progressPercent??r.completion??0)||0));
function hasCourseAccess(r){
 const s=String(r.status||"").trim().toLowerCase(),p=String(r.paymentStatus||"").trim().toLowerCase();
 if(["pending","rejected","revoked","suspended","cancelled","canceled","deleted"].includes(s))return false;
 const institution=Boolean(r.institutionId)&&["active","approved","completed"].includes(s);
 const academy=(["active","approved","completed"].includes(s)&&["paid","free"].includes(p))||(s==="paid"&&["","paid"].includes(p));
 return institution||academy;
}
function showLoading(){empty.hidden=true;error.hidden=true;grid.hidden=false;grid.innerHTML='<div class="library-state loading-card"><div class="state-icon"><i data-lucide="loader-circle"></i></div><h3>Loading your courses</h3><p>Checking your active enrolments.</p></div>';window.lucide?.createIcons();}
function resetFilters(){term="";filter="all";if(search)search.value="";filters.forEach(b=>{const a=b.dataset.filter==="all";b.classList.toggle("active",a);b.setAttribute("aria-pressed",String(a));});render();}
function showEmpty(noMatches=false){
 grid.innerHTML="";grid.hidden=true;error.hidden=true;empty.hidden=false;
 const h=empty.querySelector("h3"),p=empty.querySelector("p"),action=$("resetCourseFilters");
 if(h)h.textContent=noMatches?"No matching courses":"Your library is empty";
 if(p)p.textContent=noMatches?"Try another search or clear your filters.":"Courses you enrol in independently or through an institution will appear here. Explore the Academy Marketplace to find your next course.";
 if(action){action.textContent=noMatches?"Clear search and filters":"Explore Academy Marketplace";action.onclick=noMatches?resetFilters:()=>{location.href="marketplace.html";};}
}
function showError(){grid.hidden=true;empty.hidden=true;error.hidden=false;}
async function loadCourseLibrary(){
 if(!user)return;showLoading();
 try{
  const refs=[
   getDocs(collection(db,"students",user.uid,"enrollments")),
   getDocs(query(collection(db,"enrollments"),where("userId","==",user.uid))),
   getDocs(query(collection(db,"enrollments"),where("studentId","==",user.uid)))
  ];
  const results=await Promise.allSettled(refs),successful=results.filter(r=>r.status==="fulfilled");
  if(!successful.length)throw results.find(r=>r.status==="rejected")?.reason||new Error("No enrolment source could be read.");
  const records=new Map();
  results.forEach((result,index)=>{
   if(result.status!=="fulfilled"){console.warn("[SSA Course Library] Enrolment source unavailable:",index,result.reason);return;}
   result.value.docs.forEach(snap=>{
    const r={id:snap.id,...snap.data()};if(!hasCourseAccess(r))return;
    const id=String(r.courseId||r.courseID||r.courseUid||r.course||"");if(!id)return;
    const candidate={...r,courseId:id,source:index===0||r.institutionId?"institution":"academy"};
    const prev=records.get(id);
    if(!prev||time(candidate.updatedAt||candidate.enrolledAt||candidate.createdAt)>=time(prev.updatedAt||prev.enrolledAt||prev.createdAt))records.set(id,candidate);
   });
  });
  const loaded=await Promise.allSettled([...records.values()].map(async enrollment=>{
   const snap=await getDoc(doc(db,"courses",enrollment.courseId));if(!snap.exists())return null;
   const course=snap.data();if(String(course.status||"").toLowerCase()==="deleted"||course.deletedAt)return null;
   return {id:enrollment.courseId,...course,enrollmentId:enrollment.id,enrollmentSource:enrollment.source,
    institutionId:enrollment.institutionId||"",institutionName:enrollment.institutionName||enrollment.schoolName||course.institutionName||"",
    enrollmentStatus:String(enrollment.status||"").toLowerCase(),paymentStatus:String(enrollment.paymentStatus||"").toLowerCase(),
    progress:progressOf(enrollment),enrolledAt:enrollment.enrolledAt||enrollment.joinedAt||enrollment.createdAt||null};
  }));
  courses=loaded.filter(r=>r.status==="fulfilled"&&r.value).map(r=>r.value);
  loaded.filter(r=>r.status==="rejected").forEach(r=>console.warn("[SSA Course Library] Course could not be loaded:",r.reason));
  courses.sort((a,b)=>time(b.enrolledAt)-time(a.enrolledAt));render();
 }catch(e){console.error("[SSA Course Library] Failed to load courses:",e);showError();}
}
function render(){
 const shown=courses.filter(c=>{
  const p=progressOf(c),done=p>=100||c.enrollmentStatus==="completed";
  const match=filter==="all"||(filter==="completed"&&done)||(filter==="progress"&&!done);
  const hay=[c.title,c.description,c.category,c.instructorName,c.instructor,c.institutionName].join(" ").toLowerCase();
  return match&&(!term||hay.includes(term));
 });
 count.textContent=shown.length+(shown.length===1?" course":" courses");
 if(!shown.length){showEmpty(courses.length>0);return;}
 empty.hidden=true;error.hidden=true;grid.hidden=false;
 grid.innerHTML=shown.map(c=>{
  const p=progressOf(c),done=p>=100||c.enrollmentStatus==="completed",title=esc(c.title||"Untitled course");
  const image=c.thumbnail||c.image||c.coverImage||"",origin=c.institutionId?(c.institutionName||"Institution course"):"Academy enrolment";
  const originIcon=c.institutionId?"building-2":"graduation-cap";
  return '<article class="library-course-card institution-course-card"><div class="course-cover">'+
   (image?'<img src="'+esc(image)+'" alt="'+title+'" loading="lazy">':'<i data-lucide="book-open" aria-hidden="true"></i>')+
   '<span class="institution-course-origin"><i data-lucide="'+originIcon+'"></i>'+esc(origin)+'</span></div>'+
   '<div class="course-card-body"><div class="institution-course-meta"><span>'+esc(c.category||"Technology")+'</span><span>'+esc(c.level||"All levels")+'</span></div>'+
   '<h3>'+title+'</h3><p>'+esc(c.description||"Continue your learning journey with Spark Stack Academy.")+'</p>'+
   '<div class="institution-course-owner">Instructor: '+esc(c.instructorName||c.instructor||"SSA Instructor")+'</div>'+
   '<div class="course-progress-block"><div class="progress-label"><span>'+(done?"Completed":"Your progress")+'</span><strong>'+p+'%</strong></div>'+
   '<div class="progress-track" role="progressbar" aria-label="'+title+' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p+'"><span class="progress-fill" style="width:'+p+'%"></span></div></div>'+
   '<a class="primary-btn institution-course-open" href="course-player.html?id='+encodeURIComponent(c.id)+'">'+(done?"Review course":"Continue learning")+' <i data-lucide="arrow-right"></i></a></div></article>';
 }).join("");
 grid.setAttribute("aria-busy","false");window.lucide?.createIcons();
}
onAuthStateChanged(auth,async current=>{if(!current){location.replace("../login.html");return;}user=current;await loadCourseLibrary();});
search?.addEventListener("input",()=>{term=search.value.trim().toLowerCase();render();});
$("clearCourseSearch")?.addEventListener("click",()=>{if(search)search.value="";term="";render();});
filters.forEach(button=>button.addEventListener("click",()=>{filter=button.dataset.filter||"all";filters.forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));});render();}));
$("resetCourseFilters")?.addEventListener("click",resetFilters);
$("retryCoursesBtn")?.addEventListener("click",loadCourseLibrary);
