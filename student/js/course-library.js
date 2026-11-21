// Spark Stack Academy — Institution Learning Library
// Lists only courses with a valid institution-scoped enrolment.
// Global discovery and independent purchases belong in Marketplace / My Courses.
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(getApp());
const syncCourseEntitlements = httpsCallable(functions, "syncMyCourseEntitlements");

const $ = id => document.getElementById(id);
const grid = $("libraryCourses");
const search = $("courseSearch");
const count = $("courseLibraryCount");
const empty = $("libraryEmptyState");
const error = $("libraryErrorState");
const reset = $("resetCourseFilters");
const retry = $("retryCoursesBtn");
const filters = [...document.querySelectorAll(".filter-btn")];

let user = null;
let courses = [];
let filter = "all";
let term = "";

const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const time = value => value?.toMillis?.() || value?.toDate?.()?.getTime?.() || (Date.parse(value)||0);
const validInstitutionEnrollment = record => {
  const status = String(record.status || "").toLowerCase();
  return Boolean(record.institutionId) && ["active","approved","completed"].includes(status);
};

function showLoading() {
  empty.hidden = true; error.hidden = true;
  grid.hidden = false;
  grid.innerHTML = '<div class="library-state loading-card"><div class="state-icon"><i data-lucide="loader-circle"></i></div><h3>Loading your institution courses</h3><p>Checking your current enrolments.</p></div>';
  window.lucide?.createIcons();
}
function showEmpty(noMatches = false) {
  grid.innerHTML = "";
  grid.hidden = true;
  error.hidden = true;
  empty.hidden = false;
  const heading = empty.querySelector("h3");
  const paragraph = empty.querySelector("p");
  if (heading) heading.textContent = noMatches ? "No matching institution courses" : "No institution courses yet";
  if (paragraph) paragraph.textContent = noMatches
    ? "Try a different search or reset the course filters."
    : "When an institution you belong to enrols you in a course, it will appear here. Browse global offerings in the Academy Marketplace.";
  const action = empty.querySelector("#resetCourseFilters");
  if (action) {
    action.textContent = noMatches ? "Clear search and filters" : "Explore Academy Marketplace";
    action.onclick = noMatches ? () => {
      term = ""; filter = "all";
      if (search) search.value = "";
      filters.forEach(button => { const active = button.dataset.filter === "all"; button.classList.toggle("active",active); button.setAttribute("aria-pressed",String(active)); });
      render();
    } : () => { window.location.href = "marketplace.html"; };
  }
}
function showError() {
  grid.hidden = true; empty.hidden = true; error.hidden = false;
}
async function loadInstitutionCourses() {
  if (!user) return;
  showLoading();
  try {
    await syncCourseEntitlements();
    const entitlementRef = query(
      collection(db,"courseEntitlements"),
      where("studentUid","==",user.uid)
    );
    const snap = await getDocs(entitlementRef);
    const institutionEntitlements = snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(item=>{
        if(item.status!=="active") return false;
        return Object.values(item.grants || {}).some(grant =>
          grant?.status==="active" && grant?.source==="institution_enrollment"
        );
      });

    const unique = new Map();
    for (const entitlement of institutionEntitlements) {
      const courseId = String(entitlement.courseId || "");
      if (!courseId || unique.has(courseId)) continue;
      const courseSnap = await getDoc(doc(db,"courses",courseId));
      if (!courseSnap.exists()) continue;
      const course = courseSnap.data();
      const status = String(course.status || "").toLowerCase();
      if (course.published !== true && status !== "published") continue;
      const grant = Object.values(entitlement.grants || {}).find(item =>
        item?.status==="active" && item?.source==="institution_enrollment"
      );
      unique.set(courseId,{
        id:courseId,...course,
        institutionId:grant?.institutionId || "",
        institutionName:grant?.institutionName || course.institutionName || "Your institution",
        enrollmentStatus:"active",
        progress:Number(grant?.progress || 0),
        enrolledAt:entitlement.createdAt || entitlement.updatedAt || null
      });
    }
    courses = [...unique.values()].sort((a,b)=>time(b.enrolledAt)-time(a.enrolledAt));
    render();
  } catch (e) {
    console.error("Institution course library failed:",e);
    showError();
  }
}

function render() {
  const shown = courses.filter(c=>{
    const progress = Math.min(100,Math.max(0,c.progress));
    const matchesFilter = filter==="all" || (filter==="completed" && (progress>=100 || c.enrollmentStatus==="completed")) || (filter==="progress" && progress<100 && c.enrollmentStatus!=="completed");
    const text = [c.title,c.description,c.category,c.instructorName,c.institutionName].join(" ").toLowerCase();
    return matchesFilter && (!term || text.includes(term));
  });
  count.textContent = shown.length+" "+(shown.length===1?"course":"courses");
  if (!shown.length) { showEmpty(courses.length > 0); return; }
  empty.hidden = true; error.hidden = true; grid.hidden = false;
  grid.innerHTML = shown.map(c=>{
    const p = Math.min(100,Math.max(0,c.progress));
    const title = esc(c.title || "Untitled course");
    const image = c.thumbnail || c.image || "";
    const completed = p>=100 || c.enrollmentStatus==="completed";
    return '<article class="library-course-card institution-course-card">'+
      '<div class="course-cover">'+(image?'<img src="'+esc(image)+'" alt="'+title+'" loading="lazy">':'<div class="course-cover-placeholder"><i data-lucide="book-open"></i></div>')+
      '<span class="institution-course-origin"><i data-lucide="building-2"></i>'+esc(c.institutionName)+'</span></div>'+
      '<div class="course-card-body"><div class="institution-course-meta"><span>'+esc(c.category || "Institution course")+'</span><span>'+esc(c.level || "All levels")+'</span></div>'+
      '<h3>'+title+'</h3><p>'+esc(c.description || "Continue your institution learning programme.")+'</p>'+
      '<div class="institution-course-owner">Instructor: '+esc(c.instructorName || c.instructor || "Assigned instructor")+'</div>'+
      '<div class="course-progress-block"><div class="progress-label"><span>'+(completed?"Completed":"Your progress")+'</span><strong>'+p+'%</strong></div><div class="progress-track"><span class="progress-fill" style="width:'+p+'%"></span></div></div>'+
      '<a class="primary-btn institution-course-open" href="course-player.html?id='+encodeURIComponent(c.id)+'">'+(completed?"Review course":"Continue learning")+' <i data-lucide="arrow-right"></i></a></div></article>';
  }).join("");
  window.lucide?.createIcons();
}
onAuthStateChanged(auth,async current=>{
  if (!current) { window.location.replace("../login.html"); return; }
  user = current;
  await loadInstitutionCourses();
});
search?.addEventListener("input",()=>{term=search.value.trim().toLowerCase();render();});
$("clearCourseSearch")?.addEventListener("click",()=>{if(search)search.value="";term="";render();});
filters.forEach(button=>button.addEventListener("click",()=>{
  filter=button.dataset.filter || "all";
  filters.forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));});
  render();
}));
reset?.addEventListener("click",()=>{window.location.href="marketplace.html";});
retry?.addEventListener("click",loadInstitutionCourses);
