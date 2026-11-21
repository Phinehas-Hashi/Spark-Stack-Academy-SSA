// Spark Stack Academy — Student Learning Progress
// Read-only progress aggregation across canonical grants and legacy enrolments.
// This screen never creates completion records or issues certificates.
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const nodes = {
  total:$("totalCourses"), active:$("activeCourses"), completed:$("completedCourses"),
  overall:$("overallProgress"), lessons:$("completedLessons"), certificates:$("certificatesEarned"),
  streak:$("learningStreak"), list:$("courseProgressList"), message:$("progressMessage")
};
const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const clamp = value => Math.max(0,Math.min(100,Number(value)||0));
const millis = value => value?.toMillis?.() ?? value?.toDate?.()?.getTime?.() ?? (Date.parse(value)||0);
const activeStatus = value => !["revoked","cancelled","inactive","expired","rejected"].includes(String(value||"active").toLowerCase());

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("../login.html"); return; }
  await loadLearningProgress(user.uid);
});

async function loadLearningProgress(uid) {
  showLoading();
  try {
    const records = new Map();
    const add = (courseId,data,source) => {
      const id = String(courseId||"");
      if (!id || !activeStatus(data.status)) return;
      const old = records.get(id) || {courseId:id,progress:0,completedLessons:[],lastAccessedAt:null};
      const completed = Array.isArray(data.completedLessons) ? data.completedLessons : [];
      records.set(id,{
        ...old,
        ...data,
        courseId:id,
        progress:Math.max(clamp(old.progress),clamp(data.progress)),
        completedLessons:[...new Set([...(old.completedLessons||[]),...completed])],
        lastAccessedAt:millis(data.lastAccessedAt||data.lastAccessed||data.updatedAt||data.joinedAt)>millis(old.lastAccessedAt)
          ? (data.lastAccessedAt||data.lastAccessed||data.updatedAt||data.joinedAt) : old.lastAccessedAt,
        source:source||old.source
      });
    };

    // Canonical access records. If rules/backend are not ready, continue to legacy sources.
    try {
      const snap=await getDocs(query(collection(db,"courseEntitlements"),where("studentUid","==",uid)));
      snap.docs.forEach(d=>{
        const data=d.data()||{};
        if(data.status!=="active")return;
        const grants=Object.values(data.grants||{}).filter(g=>g?.status==="active");
        if(!grants.length)return;
        const preferred=grants.find(g=>g.source==="marketplace_purchase")||grants.find(g=>g.source==="institution_enrollment")||grants[0];
        if(data.expiresAt && millis(data.expiresAt)>0 && millis(data.expiresAt)<=Date.now())return;
        add(data.courseId,{status:"active",progress:preferred.progress??data.progress,completedLessons:data.completedLessons||[],lastAccessedAt:data.lastAccessedAt||data.updatedAt}, "entitlement");
      });
    } catch(e) { console.warn("Entitlement progress lookup unavailable; using legacy records.",e); }

    // Earlier institution enrolment model.
    try {
      const snap=await getDocs(collection(db,"students",uid,"enrollments"));
      snap.docs.forEach(d=>{const x=d.data()||{};add(x.courseId||d.id,x,"legacy");});
    } catch(e) { console.warn("Nested enrolments unavailable.",e); }

    // Earlier canonical top-level enrolment model.
    for(const field of ["userId","studentId"]) {
      try {
        const snap=await getDocs(query(collection(db,"enrollments"),where(field,"==",uid)));
        snap.docs.forEach(d=>{const x=d.data()||{};add(x.courseId,x,"canonical");});
      } catch(e) { console.warn("Top-level enrolment lookup unavailable for "+field,e); }
    }

    // Progress documents can refine progress where an active entitlement exists.
    try {
      const snap=await getDocs(query(collection(db,"courseProgress"),where("userId","==",uid)));
      snap.docs.forEach(d=>{
        const x=d.data()||{};
        if(!records.has(String(x.courseId||"")))return;
        add(x.courseId,x,"course_progress");
      });
    } catch(e) { console.warn("Course progress records unavailable.",e); }

    const hydrated=await Promise.all([...records.values()].map(async record=>{
      try {
        const snap=await getDoc(doc(db,"courses",record.courseId));
        if(!snap.exists())return null;
        const course=snap.data()||{};
        return { ...record,course, title:course.title||record.courseTitle||record.courseName||"Untitled course",
          totalLessons:Number(course.totalLessons||course.lessonCount||record.totalLessons||0) };
      } catch(e) {
        console.warn("Course details unavailable:",record.courseId,e);
        return {...record,course:{},title:record.courseTitle||record.courseName||"Enrolled course",totalLessons:Number(record.totalLessons||0)};
      }
    }));
    const rows=hydrated.filter(Boolean).sort((a,b)=>millis(b.lastAccessedAt||b.joinedAt||b.createdAt)-millis(a.lastAccessedAt||a.joinedAt||a.createdAt));
    renderRows(rows);
    await loadCertificateCount(uid);
    updateStreak(rows);
  } catch(e) {
    console.error("Learning progress failed:",e);
    showError();
  }
}

function showLoading(){
  if(nodes.message)nodes.message.style.display="none";
  if(nodes.list)nodes.list.innerHTML='<div class="progress-loading"><i data-lucide="loader-circle"></i><p>Loading your learning progress…</p></div>';
  window.lucide?.createIcons();
}
function renderRows(rows){
  if(!nodes.list)return;
  nodes.list.innerHTML="";
  if(!rows.length){
    nodes.list.innerHTML='<div class="progress-loading"><i data-lucide="book-open"></i><p>No enrolled courses found yet. Your learning progress will appear here when course access is active.</p><a class="continue-learning-btn" href="marketplace.html">Explore courses</a></div>';
    updateStats(0,0,0,0,0);
    if(nodes.message)nodes.message.style.display="flex";
    window.lucide?.createIcons();
    return;
  }
  let total=0,completed=0,lessons=0;
  rows.forEach(row=>{
    const progress=clamp(row.progress);
    const done=Array.isArray(row.completedLessons)?row.completedLessons.length:0;
    total+=progress;lessons+=done;if(progress>=100)completed++;
    const card=document.createElement("article");
    card.className="course-progress-card";
    const lessonLabel=row.totalLessons>0?done+" / "+row.totalLessons+" lessons":done+" lessons completed";
    card.innerHTML='<div class="course-progress-top"><div class="course-progress-info"><h3>'+esc(row.title)+'</h3><p>'+(progress>=100?"Course completed":"Continue building your skills")+'</p></div><div class="course-progress-percent">'+progress+'%</div></div><div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress+'"><div class="progress-bar-fill" style="width:'+progress+'%"></div></div><div class="course-progress-bottom"><span>'+esc(lessonLabel)+'</span><a class="continue-learning-btn" href="course-player.html?id='+encodeURIComponent(row.courseId)+'">'+(progress>=100?"Review course":"Continue learning")+'</a></div>';
    nodes.list.appendChild(card);
  });
  updateStats(rows.length,rows.length-completed,completed,Math.round(total/rows.length),lessons);
  if(nodes.message)nodes.message.style.display="none";
}
function updateStats(total,active,completed,average,lessons){
  if(nodes.total)nodes.total.textContent=total;
  if(nodes.active)nodes.active.textContent=active;
  if(nodes.completed)nodes.completed.textContent=completed;
  if(nodes.overall)nodes.overall.textContent=average+"%";
  if(nodes.lessons)nodes.lessons.textContent=lessons;
}
async function loadCertificateCount(uid){
  if(!nodes.certificates)return;
  try {
    const snap=await getDocs(query(collection(db,"certificates"),where("studentId","==",uid)));
    nodes.certificates.textContent=String(snap.size);
  } catch(e) {
    console.warn("Certificate count unavailable.",e);
    nodes.certificates.textContent="—";
  }
}
function updateStreak(rows){
  if(!nodes.streak)return;
  const days=new Set(rows.map(r=>{
    const value=r.lastAccessedAt||r.lastAccessed||r.updatedAt||r.joinedAt;
    const ms=millis(value);return ms?new Date(ms).toISOString().slice(0,10):null;
  }).filter(Boolean));
  nodes.streak.textContent=days.size+" days";
}
function showError(){
  if(nodes.list)nodes.list.innerHTML='<div class="progress-loading"><i data-lucide="alert-circle"></i><p>Unable to load your learning progress. Please retry.</p><button class="continue-learning-btn" id="retryProgress">Try again</button></div>';
  $("retryProgress")?.addEventListener("click",()=>{const u=auth.currentUser;if(u)loadLearningProgress(u.uid);});
  window.lucide?.createIcons();
}
