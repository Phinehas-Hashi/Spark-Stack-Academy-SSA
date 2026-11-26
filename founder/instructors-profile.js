import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const instructorId=params.get("id");
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const toast=(message,type="success")=>window.showFounderToast?.(message,type)||window.showToast?.(message,type);
let instructor=null,profileData={},userData={};

function safeImageUrl(value) {
  try { const url=new URL(String(value||""),location.href); return ["https:","http:"].includes(url.protocol)?url.href:"../assets/images/course-placeholder.jpg"; }
  catch { return "../assets/images/course-placeholder.jpg"; }
}
function formatDate(value) {
  if(!value)return "—";
  const date=value?.toDate?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?"—":date.toLocaleDateString();
}
function showModal(id){$(id)?.classList.add("active");}
function hideModal(id){$(id)?.classList.remove("active");}
function buildInstructor(profile,account) {
  return {
    uid:instructorId,
    name:profile.name||profile.fullName||account.fullName||account.name||"Unnamed Instructor",
    email:account.email||profile.email||"",
    phone:profile.phone||account.phone||"",
    expertise:profile.expertise||profile.specialization||account.expertise||"Not specified",
    bio:profile.bio||account.bio||"",
    status:account.status||"pending_review",
    active:account.active!==false,
    verified:account.verified===true,
    createdAt:account.createdAt||profile.createdAt||null,
    rating:profile.rating||0,
    courses:Array.isArray(profile.courses)?profile.courses:[]
  };
}
function renderInstructor() {
  const name=instructor.name||"Instructor";
  $("profileAvatar").textContent=name.charAt(0).toUpperCase();
  $("profileName").textContent=name;
  $("profileExpertise").textContent=instructor.expertise||"No expertise recorded";
  const status=String(instructor.status||"unknown").replaceAll("_"," ");
  $("profileStatus").textContent=status+(instructor.active?"":" · access disabled");
  $("infoName").textContent=name;
  $("infoEmail").textContent=instructor.email||"—";
  $("infoPhone").textContent=instructor.phone||"—";
  $("infoExpertise").textContent=instructor.expertise||"—";
  $("infoStatus").textContent=status;
  $("infoBio").textContent=instructor.bio||"No biography added.";
  $("ratingCount").textContent=Number(instructor.rating||0).toFixed(1);
  $("joinedDate").textContent=formatDate(instructor.createdAt);
  $("editName").value=name;
  $("editEmail").value=instructor.email||"";
  $("editExpertise").value=instructor.expertise||"";
  $("editBio").value=instructor.bio||"";
}
async function requireFounder(user) {
  const snap=await getDoc(doc(db,"founder",user.uid));
  const profile=snap.exists()?snap.data():{};
  if(!snap.exists()||profile.role!=="founder"||profile.status!=="active"||profile.active===false||profile.verified===false)throw new Error("Active Founder authorization required.");
  const token=await user.getIdTokenResult();
  if(token.claims.firebase?.sign_in_second_factor!=="totp")throw new Error("Complete Founder authenticator verification first.");
}
async function loadInstructor() {
  if(!instructorId)throw new Error("No instructor account ID was supplied.");
  const [userSnap,profileSnap]=await Promise.all([
    getDoc(doc(db,"users",instructorId)),
    getDoc(doc(db,"instructors",instructorId))
  ]);
  if(!userSnap.exists()||userSnap.data().role!=="instructor")throw new Error("Instructor account not found.");
  userData=userSnap.data();
  profileData=profileSnap.exists()?profileSnap.data():{};
  instructor=buildInstructor(profileData,userData);
  renderInstructor();
  await loadCourses();
}
async function loadCourses() {
  const grid=$("coursesGrid");
  grid.replaceChildren();
  const snapshot=await getDocs(query(collection(db,"courses"),where("instructorId","==",instructorId)));
  $("courseCount").textContent=snapshot.size;
  let totalStudents=0;
  if(snapshot.empty) {
    const empty=document.createElement("p");empty.className="profile-empty";empty.textContent="No courses assigned yet.";grid.appendChild(empty);
    $("studentCount").textContent="0";await loadStudentSummary([]);return;
  }
  snapshot.docs.forEach(courseDoc=>{
    const course=courseDoc.data();totalStudents+=Number(course.students||0);
    const card=document.createElement("article");card.className="course-card glass-card";
    const image=document.createElement("div");image.className="course-image";
    const img=document.createElement("img");img.src=safeImageUrl(course.thumbnail);img.alt=String(course.title||"Course");img.loading="lazy";
    img.addEventListener("error",()=>{img.src="../assets/images/course-placeholder.jpg";},{once:true});
    const status=document.createElement("span");status.className="course-status";status.textContent=String(course.status||"Draft");
    image.append(img,status);
    const body=document.createElement("div");body.className="course-body";
    const title=document.createElement("h3");title.textContent=String(course.title||"Untitled Course");
    const description=document.createElement("p");description.textContent=String(course.description||"No description available");
    const meta=document.createElement("div");meta.className="course-meta";
    const category=document.createElement("span");category.textContent="Category · "+String(course.category||"General");
    const level=document.createElement("span");level.textContent="Level · "+String(course.level||"Beginner");
    meta.append(category,level);
    const footer=document.createElement("div");footer.className="course-footer";
    const price=document.createElement("span");price.className="price";price.textContent="KSh "+Number(course.price||0).toLocaleString("en-KE");
    const view=document.createElement("button");view.type="button";view.className="action-btn";view.textContent="View";view.addEventListener("click",()=>location.href="courses.html?id="+encodeURIComponent(courseDoc.id));
    footer.append(price,view);
    body.append(title,description,meta,footer);card.append(image,body);grid.appendChild(card);
  });
  $("studentCount").textContent=totalStudents;
  await loadStudentSummary(snapshot.docs);
}
async function loadStudentSummary(courseDocs) {
  const list=$("studentsList");list.replaceChildren();
  if(!courseDocs.length){list.textContent="No students assigned yet.";return;}
  courseDocs.forEach(courseDoc=>{
    const course=courseDoc.data();
    const row=document.createElement("div");row.className="student-row";
    const content=document.createElement("div");
    const title=document.createElement("h4");title.textContent=String(course.title||"Course");
    const count=document.createElement("p");count.textContent=Number(course.students||0)+" students enrolled";
    content.append(title,count);
    const status=document.createElement("span");status.textContent=String(course.status||"Unknown");
    row.append(content,status);list.appendChild(row);
  });
}
async function loadAvailableCourses() {
  const select=$("courseSelect");if(!select)return;
  select.innerHTML='<option value="">Loading available courses…</option>';
  const snapshot=await getDocs(collection(db,"courses"));
  const available=snapshot.docs.filter(d=>!d.data().instructorId);
  select.replaceChildren();
  if(!available.length){const option=document.createElement("option");option.value="";option.textContent="No unassigned courses available";select.appendChild(option);return;}
  const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Select a course";select.appendChild(placeholder);
  available.forEach(d=>{const option=document.createElement("option");option.value=d.id;option.textContent=String(d.data().title||"Untitled course");select.appendChild(option);});
}
async function saveInstructorProfile(event) {
  event.preventDefault();
  const name=$("editName").value.trim(),expertise=$("editExpertise").value.trim(),bio=$("editBio").value.trim();
  if(!name||!expertise)return toast("Name and expertise are required.","warning");
  try{
    const userRef=doc(db,"users",instructorId),profileRef=doc(db,"instructors",instructorId);
    await runTransaction(db,async tx=>{
      const [userSnap,profileSnap]=await Promise.all([tx.get(userRef),tx.get(profileRef)]);
      if(!userSnap.exists()||userSnap.data().role!=="instructor")throw new Error("Instructor account is missing or invalid.");
      tx.update(userRef,{fullName:name,expertise,bio,updatedAt:serverTimestamp()});
      tx.set(profileRef,{uid:instructorId,name,expertise,bio,phone:instructor.phone||"",updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true});
    });
    window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Instructor profile edited"});
    hideModal("editModal");await loadInstructor();toast("Instructor profile updated.");
  }catch(error){console.error(error);toast(error.message||"Unable to update instructor profile.","error");}
}
async function assignCourse(event) {
  event.preventDefault();
  const courseId=$("courseSelect").value;
  if(!courseId)return toast("Select a course first.","warning");
  const courseRef=doc(db,"courses",courseId),profileRef=doc(db,"instructors",instructorId),userRef=doc(db,"users",instructorId);
  try{
    await runTransaction(db,async tx=>{
      const [courseSnap,profileSnap,userSnap]=await Promise.all([tx.get(courseRef),tx.get(profileRef),tx.get(userRef)]);
      if(!courseSnap.exists())throw new Error("Course no longer exists.");
      if(!userSnap.exists()||userSnap.data().role!=="instructor"||userSnap.data().status!=="active"||userSnap.data().active===false||userSnap.data().verified!==true)throw new Error("Only active, verified instructors can receive courses.");
      if(courseSnap.data().instructorId)throw new Error("This course has already been assigned. Refresh the course list.");
      const existing=profileSnap.exists()?profileSnap.data():{};
      const courseIds=Array.isArray(existing.courses)?existing.courses:[];
      tx.update(courseRef,{instructorId,instructorName:instructor.name,updatedAt:serverTimestamp()});
      tx.set(profileRef,{uid:instructorId,name:instructor.name,email:instructor.email,expertise:instructor.expertise,courses:[...new Set([...courseIds,courseId])],updatedAt:serverTimestamp()},{merge:true});
    });
    window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Course assigned to instructor"});
    hideModal("assignCourseModal");await loadInstructor();toast("Course assigned successfully.");
  }catch(error){console.error(error);toast(error.message||"Course assignment failed.","error");}
}

$("editInstructorBtn")?.addEventListener("click",()=>showModal("editModal"));
$("closeEditModal")?.addEventListener("click",()=>hideModal("editModal"));
$("closeAssignModal")?.addEventListener("click",()=>hideModal("assignCourseModal"));
$("assignCourseBtn")?.addEventListener("click",async()=>{showModal("assignCourseModal");try{await loadAvailableCourses();}catch(error){toast(error.message||"Could not load courses.","error");}});
$("editInstructorForm")?.addEventListener("submit",saveInstructorProfile);
$("assignCourseForm")?.addEventListener("submit",assignCourse);
document.querySelectorAll(".modal").forEach(modal=>modal.addEventListener("click",event=>{if(event.target===modal)hideModal(modal.id);}));
document.querySelectorAll(".tab-btn").forEach(tab=>tab.addEventListener("click",()=>{
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.toggle("active",btn===tab));
  document.querySelectorAll(".tab-content").forEach(content=>content.classList.toggle("active",content.id===tab.dataset.tab+"Tab"));
}));

window.addEventListener("beforeunload",()=>{});
onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../login.html");return;}
  try{await requireFounder(user);await loadInstructor();if(params.get("edit")==="1")showModal("editModal");}
  catch(error){console.error("[Founder Instructor Profile]",error);toast(error.message||"Unable to load instructor profile.","error");location.replace("security.html");}
});