import { db } from "../../js/firebase.js";
import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $=id=>document.getElementById(id), esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let instructor=null;
function set(id,v){const el=$(id);if(el)el.textContent=v;}
function icons(){window.lucide?.createIcons?.();}
async function wait(){for(let i=0;i<100;i++){if(window.currentInstructor)return window.currentInstructor;await new Promise(r=>setTimeout(r,100));}return null;}
async function load(){instructor=await wait();if(!instructor)return;set("instructorName",instructor.displayName||instructor.name||instructor.email?.split("@")[0]||"Instructor");
 const [coursesSnap,enrollSnap,submissionSnap,earnSnap]=await Promise.allSettled([
  getDocs(query(collection(db,"courses"),where("instructorId","==",instructor.uid))),
  getDocs(query(collection(db,"enrollments"),where("instructorId","==",instructor.uid))),
  getDocs(query(collection(db,"submissions"),where("instructorId","==",instructor.uid),limit(200))),
  getDocs(query(collection(db,"instructorEarnings"),where("instructorId","==",instructor.uid)))
 ]);
 const courses=coursesSnap.status==="fulfilled"?coursesSnap.value.docs.map(d=>({id:d.id,...d.data()})):[];
 const enrollments=enrollSnap.status==="fulfilled"?enrollSnap.value.docs.map(d=>d.data()):[];
 const submissions=submissionSnap.status==="fulfilled"?submissionSnap.value.docs.map(d=>d.data()):[];
 const earnings=earnSnap.status==="fulfilled"?earnSnap.value.docs.map(d=>d.data()):[];
 set("statCourses",courses.filter(c=>String(c.status||"").toLowerCase()!=="archived").length);
 set("statStudents",new Set(enrollments.map(e=>e.studentId).filter(Boolean)).size);
 const progressValues=enrollments.map(e=>Number(e.progress)).filter(Number.isFinite);
 const avg=progressValues.length?Math.round(progressValues.reduce((a,b)=>a+b,0)/progressValues.length):0;
 set("statProgress",`${avg}%`);set("engagementPercent",`${avg}%`);if($("engagementBar"))$("engagementBar").style.width=`${avg}%`;
 const completed=submissions.filter(s=>["completed","graded","approved"].includes(String(s.status||"").toLowerCase())).length;set("statCompletions",completed);
 const completionRate=enrollments.length?Math.round(enrollments.filter(e=>Number(e.progress||0)>=100||e.completed===true).length/enrollments.length*100):0;set("completionPercent",`${completionRate}%`);if($("completionBar"))$("completionBar").style.width=`${completionRate}%`;
 set("satisfactionPercent","N/A");if($("satisfactionBar"))$("satisfactionBar").style.width="0%";
 const total=earnings.reduce((sum,e)=>sum+Number(e.amount||e.total||e.earnings||0),0);set("statEarnings",new Intl.NumberFormat("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:0}).format(total));
 renderCourses(courses);renderActivity(enrollments);renderTasks(submissions);icons();}
function renderCourses(courses){const box=$("courseList");if(!box)return;if(!courses.length)return;box.innerHTML=courses.slice(0,5).map(c=>`<article class="course-item"><div class="course-item-icon"><i data-lucide="book-open"></i></div><div class="course-item-info"><h3>${esc(c.title||c.name||"Untitled Course")}</h3><p>${esc(c.status||"Draft")}</p></div><a class="course-item-action" href="courses.html?id=${encodeURIComponent(c.id)}"><i data-lucide="arrow-up-right"></i></a></article>`).join("");}
function renderActivity(enrollments){const box=$("activityList");if(!box)return;if(!enrollments.length)return;box.innerHTML=enrollments.slice(-5).reverse().map(e=>`<div class="activity-item"><div class="activity-icon"><i data-lucide="user-plus"></i></div><div class="activity-content"><h4>${esc(e.studentName||e.name||"Student")}</h4><p>Enrollment activity</p></div></div>`).join("");}
function renderTasks(submissions){const box=$("upcomingTasks");if(!box)return;const pending=submissions.filter(s=>!["graded","completed","approved"].includes(String(s.status||"").toLowerCase())).length;box.innerHTML=`<div class="empty-state small"><div class="empty-icon"><i data-lucide="${pending?"clipboard-list":"check-circle"}"></i></div><p>${pending?`${pending} submission${pending===1?"":"s"} awaiting review.`:"No pending tasks."}</p></div>`;}
function actions(){document.getElementById("createCourseBtn")?.addEventListener("click",()=>location.href="course-builder.html");document.getElementById("emptyCreateCourseBtn")?.addEventListener("click",()=>location.href="course-builder.html");document.getElementById("viewStudentsBtn")?.addEventListener("click",()=>location.href="students.html");document.querySelectorAll(".quick-action").forEach(btn=>btn.addEventListener("click",()=>{const routes={course:"course-builder.html",lesson:"course-builder.html",assignment:"assignments.html",quiz:"quizzes.html",announcement:"announcements.html"};const route=routes[btn.dataset.action];if(route)location.href=route;}));}
actions();document.addEventListener("instructor:ready",load,{once:true});if(window.currentInstructor)load();
