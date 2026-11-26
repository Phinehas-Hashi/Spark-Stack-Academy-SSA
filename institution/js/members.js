import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions();
const createMember = httpsCallable(functions, "createInstitutionTeamAccount");
const updateMember = httpsCallable(functions, "updateInstitutionMember");
const $ = id => document.getElementById(id);
const ROLE_LABELS = {
  institution_owner: "Owner", owner: "Owner", institution_admin: "Administrator",
  institution_moderator: "Moderator", department_manager: "Department manager",
  institution_staff: "Other staff", instructor: "Instructor", student: "Student"
};
let context = null;
let members = [];
let currentUid = null;

function safe(value) { return String(value ?? "").trim(); }
function dateLabel(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"numeric"}).format(date);
}
function initials(name) {
  return safe(name).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase() || "M";
}
function roleBucket(role) {
  if (role === "student") return "students";
  if (role === "instructor") return "instructors";
  if (["institution_owner","owner","institution_admin"].includes(role)) return "admins";
  if (role === "institution_moderator") return "moderators";
  return "staff";
}
function renderCounts() {
  const counts = {total:members.length,students:0,instructors:0,admins:0,moderators:0,staff:0};
  members.forEach(member => {
    if (member.status === "active") counts[roleBucket(safe(member.role))] += 1;
  });
  $("countTotal").textContent = counts.total.toLocaleString();
  $("countStudents").textContent = counts.students.toLocaleString();
  $("countInstructors").textContent = counts.instructors.toLocaleString();
  $("countAdmins").textContent = counts.admins.toLocaleString();
  $("countModerators").textContent = counts.moderators.toLocaleString();
  $("countStaff").textContent = counts.staff.toLocaleString();
}
function filteredMembers() {
  const search = safe($("memberSearch").value).toLowerCase();
  const role = $("roleFilter").value;
  const status = $("statusFilter").value;
  return members.filter(member => {
    const matchesSearch = !search || [member.fullName,member.email,member.uid,member.admissionNumber,member.staffNumber]
      .some(value=>safe(value).toLowerCase().includes(search));
    return matchesSearch && (!role || member.role === role) && (!status || member.status === status);
  });
}
function canManageTarget(member) {
  if (!context?.canManageMembers || member.uid === currentUid || ["institution_owner","owner"].includes(member.role)) return false;
  if (!context.isOwner && ["institution_admin","institution_moderator","department_manager"].includes(member.role)) return false;
  return true;
}
function renderTable() {
  const body = $("membersTableBody");
  const visible = filteredMembers();
  $("directoryTotal").textContent = visible.length + " of " + members.length + " members";
  body.replaceChildren();
  if (!visible.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5; cell.className = "table-state";
    cell.textContent = members.length ? "No members match these filters." : "No members have been added to this institution yet.";
    row.append(cell); body.append(row); return;
  }
  visible.forEach(member => {
    const row = document.createElement("tr");
    const identityCell = document.createElement("td");
    const identity = document.createElement("div"); identity.className = "member-identity";
    const avatar = document.createElement("span"); avatar.className = "member-avatar"; avatar.textContent = initials(member.fullName);
    const copy = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = member.fullName || "Institution member";
    const email = document.createElement("small"); email.textContent = member.email || member.uid || "";
    copy.append(name,email); identity.append(avatar,copy); identityCell.append(identity);

    const roleCell = document.createElement("td"); roleCell.className = "role-label"; roleCell.textContent = ROLE_LABELS[member.role] || member.role || "Member";
    const statusCell = document.createElement("td");
    const status = document.createElement("span"); status.className = "status-pill " + safe(member.status); status.textContent = safe(member.status).replaceAll("_"," ") || "Unknown"; statusCell.append(status);
    const joinedCell = document.createElement("td"); joinedCell.textContent = dateLabel(member.createdAt);
    const actionsCell = document.createElement("td");
    if (canManageTarget(member)) {
      const actions = document.createElement("div"); actions.className = "member-actions";
      const roleSelect = document.createElement("select"); roleSelect.setAttribute("aria-label","Change role for "+(member.fullName||"member"));
      const roles = ["student","instructor","institution_staff"];
      if (context.isOwner) roles.push("institution_moderator","department_manager","institution_admin");
      roles.forEach(value=>{const option=document.createElement("option");option.value=value;option.textContent=ROLE_LABELS[value];option.selected=value===member.role;roleSelect.append(option);});
      const saveRole = document.createElement("button"); saveRole.type="button";saveRole.textContent="Save role";saveRole.addEventListener("click",()=>runMemberAction(member.uid,{action:"change_role",role:roleSelect.value},saveRole));
      const statusButton = document.createElement("button");statusButton.type="button";statusButton.textContent=member.status==="active"?"Suspend":"Activate";
      statusButton.addEventListener("click",()=>runMemberAction(member.uid,{action:"set_status",status:member.status==="active"?"suspended":"active"},statusButton));
      const revoke = document.createElement("button");revoke.type="button";revoke.className="danger";revoke.textContent="Revoke";
      revoke.addEventListener("click",()=>{if(window.confirm("Revoke this member's access to this institution? Their Academy account will not be deleted."))runMemberAction(member.uid,{action:"revoke"},revoke);});
      actions.append(roleSelect,saveRole,statusButton,revoke);actionsCell.append(actions);
    } else {
      const note=document.createElement("span");note.className="muted";note.textContent=member.uid===currentUid?"You": "Restricted";actionsCell.append(note);
    }
    row.append(identityCell,roleCell,statusCell,joinedCell,actionsCell);body.append(row);
  });
}
async function loadMembers() {
  const body=$("membersTableBody");
  body.innerHTML='<tr><td colspan="5" class="table-state">Loading institution members…</td></tr>';
  try {
    const snapshot=await getDocs(query(collection(db,"institutions",context.institutionId,"members"),orderBy("createdAt","desc")));
    members=snapshot.docs.map(item=>({uid:item.id,...item.data()}));
    renderCounts();renderTable();
  } catch(error) {
    console.error("[Institution Members] Load failed:",error);
    body.innerHTML='<tr><td colspan="5" class="table-state">The directory could not be loaded. Check your institution permissions and try again.</td></tr>';
  }
}
async function runMemberAction(memberUid,payload,button) {
  button.disabled=true;
  try {
    await updateMember({institutionId:context.institutionId,memberUid,...payload});
    await loadMembers();
  } catch(error) {
    console.error("[Institution Members] Update failed:",error);
    window.alert(error.message||"The member could not be updated.");
  } finally {button.disabled=false;}
}
function setupForm() {
  const panel=$("memberCreatePanel");
  $("toggleMemberForm").hidden=!context.canManageMembers;
  $("toggleMemberForm").addEventListener("click",()=>{panel.hidden=!panel.hidden;});
  $("closeMemberForm").addEventListener("click",()=>{panel.hidden=true;});
  if(!context.canManageMembers){panel.hidden=true;return;}
  if(!context.isOwner){
    ["institution_moderator","department_manager","institution_admin"].forEach(value=>{
      const option=$("newMemberRole").querySelector('option[value="'+value+'"]');if(option)option.remove();
    });
  }
  $("memberForm").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!window.SSAOnlineActionGuard?.requireOnline("Creating an institution member"))return;
    const form=event.currentTarget;const values=new FormData(form);const button=$("createMemberBtn");const message=$("memberFormMessage");
    button.disabled=true;message.className="";message.textContent="Creating account and institution membership…";
    try{
      await createMember({
        institutionId:context.institutionId,
        fullName:safe(values.get("fullName")),
        email:safe(values.get("email")).toLowerCase(),
        role:safe(values.get("role")),
        temporaryPassword:String(values.get("temporaryPassword")||"")
      });
      form.reset();message.className="success";message.textContent="Member account created and added to this institution.";
      await loadMembers();
    }catch(error){
      console.error("[Institution Members] Create failed:",error);
      message.className="error";message.textContent=error.message||"The member account could not be created.";
    }finally{button.disabled=false;}
  });
}
function init(contextValue) {
  if(context) return;
  context=contextValue;
  currentUid = context.profile?.uid || auth.currentUser?.uid || currentUid;
  const requestedRole = new URLSearchParams(window.location.search).get("role");
  if (requestedRole && $("roleFilter").querySelector('option[value="'+requestedRole+'"]')) $("roleFilter").value = requestedRole;
  setupForm();
  const pageTitle = document.querySelector(".topbar-left strong");
  if (pageTitle) pageTitle.textContent = "People & access";
  const activeMemberHref = requestedRole ? "members.html?role=" + requestedRole : "members.html";
  document.querySelectorAll(".navigation .nav-link").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === activeMemberHref);
  });
  ["memberSearch","roleFilter","statusFilter"].forEach(id=>$(id).addEventListener(id==="memberSearch"?"input":"change",renderTable));
  loadMembers();
  window.lucide?.createIcons();
}
onAuthStateChanged(auth,user=>{currentUid=user?.uid||null;});
window.addEventListener("ssa-institution-context-ready",event=>init(event.detail));
if(window.SSAInstitutionContext)init(window.SSAInstitutionContext);
