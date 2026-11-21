import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $ = id => document.getElementById(id);
const functions = getFunctions();
const createCourse = httpsCallable(functions, "createInstitutionCourse");
const submitCourse = httpsCallable(functions, "submitInstitutionCourseForReview");
let institutionId = null, courses = [], instructors = [];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const statusLabel = value => String(value || "draft").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

function message(text,type=""){const node=$("courseFormMessage");node.textContent=text;node.className="course-message "+type;}
function renderStats(){ $("courseCount").textContent=courses.length; $("draftCount").textContent=courses.filter(c=>c.status==="draft").length; $("reviewCount").textContent=courses.filter(c=>c.status==="pending_review"||c.reviewStatus==="awaiting_admin_review").length; $("publishedCount").textContent=courses.filter(c=>c.status==="published"||c.published===true).length; }
function renderCourses(){
 const q=$("institutionCourseSearch").value.trim().toLowerCase(),status=$("institutionCourseStatus").value;
 const items=courses.filter(c=>(!q||[c.title,c.description,c.category].join(" ").toLowerCase().includes(q))&&(status==="all"||String(c.status||"draft")===status));
 const target=$("institutionCourseList");
 if(!items.length){target.innerHTML='<p class="course-empty">No courses match this view.</p>';return;}
 target.innerHTML=items.map(c=>{
  const st=String(c.status||"draft"),canSubmit=["draft","rejected"].includes(st);
  const assigned=instructors.find(i=>(i.uid||i.id)===c.instructorId);
  const assignment=c.instructorId?"Assigned instructor: "+esc(assigned?.fullName||assigned?.name||"Team member"):"No instructor assigned — assign one to build course content.";
  const builder=c.instructorId?'<a class="course-action" href="../instructor/course-builder.html?id='+encodeURIComponent(c.id)+'" title="Open using the assigned instructor account">Build content</a>':"";
  return '<article class="institution-course-row"><div><h3>'+esc(c.title||"Untitled course")+'</h3><p>'+esc(c.category||"Uncategorised")+' · '+esc(c.currency||"KES")+' '+Number(c.price||0).toLocaleString()+'</p><span class="course-status-pill '+esc(st)+'">'+esc(statusLabel(st))+'</span><small class="course-assignment-note">'+assignment+'</small></div><div class="course-row-actions">'+builder+'<button class="course-action" data-submit-course="'+esc(c.id)+'" '+(canSubmit?"":"disabled")+'>Submit for review</button></div></article>';
 }).join("");
}
async function loadCourses(){const target=$("institutionCourseList");target.innerHTML='<p class="course-loading">Loading courses…</p>';try{const snap=await getDocs(query(collection(db,"courses"),where("institutionId","==",institutionId)));courses=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));renderStats();renderCourses();}catch(error){console.error(error);target.innerHTML='<p class="course-empty">Could not load institution courses. Check your connection and Firestore permissions.</p>';}}
async function loadInstructors(){try{const snap=await getDocs(collection(db,"institutions",institutionId,"members"));instructors=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.role==="instructor");const select=$("institutionInstructorSelect");select.innerHTML='<option value="">Unassigned</option>'+instructors.map(i=>'<option value="'+esc(i.uid||i.id)+'">'+esc(i.fullName||i.name||i.email||"Instructor")+'</option>').join("");}catch(error){console.warn("Institution instructor list unavailable",error);}}
function loadSampleCourse(){
 const form=$("institutionCourseForm");
 form.elements.title.value="Introduction to Digital Skills";
 form.elements.category.value="Technology";
 form.elements.level.value="Beginner";
 form.elements.currency.value="KES";
 form.elements.price.value="0";
 form.elements.description.value="Build practical digital skills for study, work and everyday life. This beginner-friendly course introduces computer fundamentals, internet safety, productivity tools, online communication and responsible digital citizenship. Learners will complete guided activities and a short knowledge check.";
 const select=$("institutionInstructorSelect");
 if(select.options.length>1) select.selectedIndex=1;
 message("Sample course details loaded. Review the instructor assignment, then save the draft.");
}
function bind(){ $("loadSampleCourse")?.addEventListener("click",loadSampleCourse); $("institutionCourseForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=$("createInstitutionCourseBtn"),v=new FormData(form);button.disabled=true;message("Saving draft securely…");try{await createCourse({title:String(v.get("title")).trim(),description:String(v.get("description")).trim(),category:v.get("category"),level:v.get("level"),price:Number(v.get("price")),currency:v.get("currency"),instructorId:v.get("instructorId")||""});form.reset();message("Course draft saved. It is not yet visible to students.","success");await loadCourses();}catch(error){console.error(error);message(error.message||"Course could not be saved.", "error");}finally{button.disabled=false;}});$("institutionCourseList").addEventListener("click",async event=>{const button=event.target.closest("[data-submit-course]");if(!button)return;button.disabled=true;try{await submitCourse({courseId:button.dataset.submitCourse});await loadCourses();message("Course submitted to the Spark Stack Admin review queue.","success");}catch(error){console.error(error);message(error.message||"Course could not be submitted.","error");button.disabled=false;}});$("institutionCourseSearch").addEventListener("input",renderCourses);$("institutionCourseStatus").addEventListener("change",renderCourses);$("refreshInstitutionCourses").addEventListener("click",loadCourses);}
onAuthStateChanged(auth,async user=>{if(!user)return;try{const snap=await getDoc(doc(db,"users",user.uid));if(!snap.exists())return;const profile=snap.data();institutionId=profile.institutionId;if(!institutionId)return;bind();if(profile.institutionRole==="owner" || profile.role==="institution") await loadInstructors();await loadCourses();window.lucide?.createIcons();}catch(error){console.error("Institution course manager failed",error);}});
