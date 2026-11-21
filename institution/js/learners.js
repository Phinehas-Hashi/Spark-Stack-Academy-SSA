import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $ = id => document.getElementById(id);
const functions = getFunctions();
const loadManager = httpsCallable(functions, "getInstitutionLearnerManagerData");
const enrolLearner = httpsCallable(functions, "enrollStudentInInstitutionCourse");
const revokeEnrolment = httpsCallable(functions, "revokeInstitutionCourseEnrollment");

let learners = [], courses = [], enrolments = [], searchTerm = "", filterMode = "all", busy = false;
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const activeFor = uid => enrolments.filter(item => item.studentUid === uid && item.status === "active");
const courseTitle = id => courses.find(course => course.id === id)?.title || "Institution course";

function setMessage(message, type = "") {
  const node = $("learnerFormMessage");
  node.textContent = message;
  node.className = type;
}
function updateStats() {
  $("learnerCount").textContent = learners.length.toLocaleString();
  $("enrolmentCount").textContent = enrolments.filter(item => item.status === "active").length.toLocaleString();
  $("publishedCourseCount").textContent = courses.length.toLocaleString();
}
function renderCourseOptions() {
  const select = $("learnerCourse");
  select.innerHTML = '<option value="">Choose a published course</option>' + courses.map(course =>
    '<option value="' + esc(course.id) + '">' + esc(course.title) + '</option>'
  ).join("");
  select.disabled = !courses.length;
}
function renderRoster() {
  const target = $("learnerRoster");
  const visible = learners.filter(learner => {
    const assigned = activeFor(learner.uid).length > 0;
    const haystack = (learner.fullName + " " + learner.email + " " + learner.phone).toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm))
      && (filterMode === "all" || (filterMode === "enrolled" && assigned) || (filterMode === "none" && !assigned));
  });
  $("rosterCount").textContent = visible.length + " of " + learners.length + " learners";
  if (!visible.length) {
    target.innerHTML = '<div class="roster-empty"><i data-lucide="users"></i><strong>No learners found</strong><span>Try another search or enrol a learner using their registered email.</span></div>';
    window.lucide?.createIcons();
    return;
  }
  target.innerHTML = visible.map(learner => {
    const assigned = activeFor(learner.uid);
    const courseRows = assigned.length ? assigned.map(item =>
      '<div class="assigned-course"><span><i data-lucide="book-open"></i>' + esc(courseTitle(item.courseId)) + '</span><button type="button" class="revoke-access" data-revoke-enrolment="' + esc(item.id) + '" aria-label="Revoke ' + esc(courseTitle(item.courseId)) + ' access">Revoke</button></div>'
    ).join("") : '<span class="no-assignment">No active course assignments</span>';
    const initials = (learner.fullName || "S").trim().split(/\s+/).slice(0,2).map(part => part[0] || "").join("").toUpperCase();
    return '<article class="learner-row"><div class="learner-identity"><span class="learner-avatar">' + esc(initials) + '</span><div><strong>' + esc(learner.fullName) + '</strong><small>' + esc(learner.email || "Email unavailable") + '</small></div></div><div class="learner-assignments">' + courseRows + '</div><span class="learner-active-pill"><i data-lucide="check-circle-2"></i> Active</span></article>';
  }).join("");
  window.lucide?.createIcons();
}
function renderCapacity(limits) {
  const maximum = Number(limits?.students || 5000);
  const current = Number(limits?.currentStudents ?? learners.length);
  $("capacityCount").textContent = current.toLocaleString() + " / " + maximum.toLocaleString();
}
async function refresh() {
  const target = $("learnerRoster");
  target.innerHTML = '<div class="roster-loading"><i data-lucide="loader-circle"></i><span>Refreshing secure learner data…</span></div>';
  window.lucide?.createIcons();
  try {
    const result = await loadManager();
    const data = result.data || {};
    learners = data.learners || [];
    courses = data.courses || [];
    enrolments = data.enrolments || [];
    updateStats();
    renderCourseOptions();
    renderCapacity(data.limits);
    renderRoster();
  } catch (error) {
    console.error("Institution learner manager load failed:", error);
    target.innerHTML = '<div class="roster-empty"><i data-lucide="alert-circle"></i><strong>Unable to load learner data</strong><span>' + esc(error.message || "Check your institution access and connection.") + '</span></div>';
    window.lucide?.createIcons();
  }
}
async function submitEnrolment(event) {
  event.preventDefault();
  if (busy) return;
  const email = $("learnerEmail").value.trim();
  const courseId = $("learnerCourse").value;
  if (!email || !courseId) { setMessage("Enter a learner email and select a published course.", "error"); return; }
  busy = true;
  const button = $("enrolLearnerBtn");
  button.disabled = true;
  button.innerHTML = '<i data-lucide="loader-circle"></i> Enrolling…';
  setMessage("Checking the learner account and creating a trusted institution grant…");
  try {
    const result = await enrolLearner({ studentEmail: email, courseId });
    setMessage(result.data?.message || "Learner enrolled successfully.", "success");
    $("learnerEmail").value = "";
    await refresh();
  } catch (error) {
    console.error("Institution learner enrolment failed:", error);
    setMessage(error.message || "The learner could not be enrolled.", "error");
  } finally {
    busy = false;
    button.disabled = false;
    button.innerHTML = '<i data-lucide="user-plus"></i> Enrol learner securely';
    window.lucide?.createIcons();
  }
}
async function handleRevoke(event) {
  const button = event.target.closest("[data-revoke-enrolment]");
  if (!button) return;
  const enrollmentId = button.dataset.revokeEnrolment;
  if (!enrollmentId) return;
  if (!window.confirm("Revoke this institution's course access for the learner? Any separate purchase or grant will remain unaffected.")) return;
  button.disabled = true;
  button.textContent = "Revoking…";
  try {
    await revokeEnrolment({ enrollmentId });
    setMessage("Institution course access revoked. Other valid access grants are preserved.", "success");
    await refresh();
  } catch (error) {
    console.error("Institution course access revocation failed:", error);
    window.alert(error.message || "The access grant could not be revoked.");
    button.disabled = false;
    button.textContent = "Revoke";
  }
}
$("learnerEnrolForm").addEventListener("submit", submitEnrolment);
$("refreshLearners").addEventListener("click", refresh);
$("learnerSearch").addEventListener("input", event => { searchTerm = event.target.value.trim().toLowerCase(); renderRoster(); });
$("enrolmentFilter").addEventListener("change", event => { filterMode = event.target.value; renderRoster(); });
$("learnerRoster").addEventListener("click", handleRevoke);

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("../login.html"); return; }
  await refresh();
});
