// Spark Stack Academy — Institution Learning Library
// Reads trusted entitlements first, then compatible legacy enrolment records.
// No Cloud Function is required just to display existing learning records.
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const validStatus = value => ["active","approved","completed"].includes(String(value || "active").toLowerCase());

function showLoading() {
  empty.hidden = true; error.hidden = true; grid.hidden = false;
  grid.innerHTML = '<div class="library-state loading-card"><div class="state-icon"><i data-lucide="loader-circle"></i></div><h3>Loading your institution courses</h3><p>Checking your current enrolments.</p></div>';
  window.lucide?.createIcons();
}
function showEmpty(noMatches = false) {
  grid.innerHTML = ""; grid.hidden = true; error.hidden = true; empty.hidden = false;
  const heading = empty.querySelector("h3"), paragraph = empty.querySelector("p");
  if (heading) heading.textContent = noMatches ? "No matching institution courses" : "No institution courses yet";
  if (paragraph) paragraph.textContent = noMatches
    ? "Try a different search or reset the course filters."
    : "Institution course enrolments will appear here. Browse public offerings in the Academy Marketplace.";
  const action = empty.querySelector("#resetCourseFilters");
  if (action) {
    action.textContent = noMatches ? "Clear search and filters" : "Explore Academy Marketplace";
    action.onclick = noMatches ? () => {
      term = ""; filter = "all"; if (search) search.value = "";
      filters.forEach(button => { const active = button.dataset.filter === "all"; button.classList.toggle("active",active); button.setAttribute("aria-pressed",String(active)); });
      render();
    } : () => { window.location.href = "marketplace.html"; };
  }
}
function showError() { grid.hidden = true; empty.hidden = true; error.hidden = false; }

async function loadInstitutionCourses() {
  if (!user) return;
  showLoading();
  try {
    const records = new Map();
    const addRecord = (courseId, record) => {
      const id = String(courseId || "");
      if (!id || records.has(id) || !validStatus(record.status)) return;
      if (!record.institutionId && !record.institutionName) return;
      records.set(id, { courseId:id, ...record });
    };

    // 1. Canonical trusted grants. A failed entitlement read must not block legacy fallback.
    try {
      const ref = query(collection(db,"courseEntitlements"),where("studentUid","==",user.uid));
      const snap = await getDocs(ref);
      snap.docs.forEach(item => {
        const data = item.data() || {};
        if (data.status !== "active") return;
        const grant = Object.values(data.grants || {}).find(g =>
          g?.status === "active" && g?.source === "institution_enrollment"
        );
        if (!grant) return;
        if (data.expiresAt && time(data.expiresAt) > 0 && time(data.expiresAt) <= Date.now()) return;
        addRecord(data.courseId,{status:"active",institutionId:grant.institutionId || "",institutionName:grant.institutionName || "",progress:Number(grant.progress ?? data.progress ?? 0),enrolledAt:data.createdAt || data.updatedAt || null,source:"entitlement"});
      });
    } catch (grantError) {
      console.warn("Course entitlements unavailable; trying compatible enrolments.",grantError);
    }

    // 2. Legacy nested enrolments used by earlier institution workflows.
    try {
      const snap = await getDocs(collection(db,"students",user.uid,"enrollments"));
      snap.docs.forEach(item => {
        const data = item.data() || {};
        const courseId = data.courseId || item.id;
        if (!validStatus(data.status)) return;
        addRecord(courseId,{...data,status:data.status || "active",institutionId:data.institutionId || "",institutionName:data.institutionName || "",progress:Number(data.progress || 0),enrolledAt:data.joinedAt || data.createdAt || null,source:"legacy"});
      });
    } catch (legacyError) {
      console.warn("Nested enrolment fallback unavailable.",legacyError);
    }

    // 3. Canonical enrolment records, queried separately so rules can prove ownership.
    for (const field of ["userId","studentId"]) {
      try {
        const ref = query(collection(db,"enrollments"),where(field,"==",user.uid));
        const snap = await getDocs(ref);
        snap.docs.forEach(item => {
          const data = item.data() || {};
          if (!validStatus(data.status)) return;
          addRecord(data.courseId,{...data,status:data.status || "active",institutionId:data.institutionId || "",institutionName:data.institutionName || "",progress:Number(data.progress || 0),enrolledAt:data.enrolledAt || data.createdAt || null,source:"canonical"});
        });
      } catch (enrolmentError) {
        console.warn("Canonical enrolment lookup failed for "+field,enrolmentError);
      }
    }

    const hydrated = await Promise.all([...records.values()].map(async record => {
      try {
        const snap = await getDoc(doc(db,"courses",record.courseId));
        if (!snap.exists()) return null;
        const course = snap.data() || {};
        const status = String(course.status || "").toLowerCase();
        if (course.published !== true && status !== "published") return null;
        return {
          id:record.courseId,...course,
          institutionId:record.institutionId || course.institutionId || "",
          institutionName:record.institutionName || course.institutionName || "Your institution",
          enrollmentStatus:record.status || "active",
          progress:Math.min(100,Math.max(0,Number(record.progress)||0)),
          enrolledAt:record.enrolledAt || null
        };
      } catch (courseError) {
        console.warn("Course details unavailable:",record.courseId,courseError);
        return null;
      }
    }));
    courses = hydrated.filter(Boolean).sort((a,b)=>time(b.enrolledAt)-time(a.enrolledAt));
    if (!courses.length && records.size === 0) {
      showEmpty();
      count.textContent = "0 courses";
      return;
    }
    render();
  } catch (loadError) {
    console.error("Institution course library failed:",loadError);
    showError();
  }
}

function render() {
  const shown = courses.filter(c=>{
    const progress = Math.min(100,Math.max(0,Number(c.progress)||0));
    const matchesFilter = filter==="all" || (filter==="completed" && (progress>=100 || c.enrollmentStatus==="completed")) || (filter==="progress" && progress<100 && c.enrollmentStatus!=="completed");
    const text = [c.title,c.description,c.category,c.instructorName,c.institutionName].join(" ").toLowerCase();
    return matchesFilter && (!term || text.includes(term));
  });
  count.textContent = shown.length+" "+(shown.length===1?"course":"courses");
  if (!shown.length) { showEmpty(courses.length > 0); return; }
  empty.hidden = true; error.hidden = true; grid.hidden = false;
  grid.innerHTML = shown.map(c=>{
    const p = Math.min(100,Math.max(0,Number(c.progress)||0));
    const title = esc(c.title || "Untitled course");
    const image = c.thumbnail || c.image || "";
    const completed = p>=100 || c.enrollmentStatus==="completed";
    return '<article class="library-course-card institution-course-card"><div class="course-cover">'+(image?'<img src="'+esc(image)+'" alt="'+title+'" loading="lazy">':'<div class="course-cover-placeholder"><i data-lucide="book-open"></i></div>')+'<span class="institution-course-origin"><i data-lucide="building-2"></i>'+esc(c.institutionName)+'</span></div><div class="course-card-body"><div class="institution-course-meta"><span>'+esc(c.category || "Institution course")+'</span><span>'+esc(c.level || "All levels")+'</span></div><h3>'+title+'</h3><p>'+esc(c.description || "Continue your institution learning programme.")+'</p><div class="institution-course-owner">Instructor: '+esc(c.instructorName || c.instructor || "Assigned instructor")+'</div><div class="course-progress-block"><div class="progress-label"><span>'+(completed?"Completed":"Your progress")+'</span><strong>'+p+'%</strong></div><div class="progress-track"><span class="progress-fill" style="width:'+p+'%"></span></div></div><a class="primary-btn institution-course-open" href="course-player.html?id='+encodeURIComponent(c.id)+'">'+(completed?"Review course":"Continue learning")+' <i data-lucide="arrow-right"></i></a></div></article>';
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
