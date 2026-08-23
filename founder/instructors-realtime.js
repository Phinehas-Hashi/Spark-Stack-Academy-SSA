import { db } from "../js/firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const table = document.getElementById("instructorsTableBody");
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const toDate = value => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = value => { const date = toDate(value); return date ? date.toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}) : "—"; };

let instructors = [];
let unsubscribe = null;

function filtered() {
    const search = (document.getElementById("instructorSearch")?.value || "").trim().toLowerCase();
    const specialization = document.getElementById("specializationFilter")?.value || "";
    const status = document.getElementById("statusFilter")?.value || "";
    const sort = document.getElementById("sortInstructors")?.value || "newest";
    const result = instructors.filter(item => {
        const haystack = [item.name,item.email,item.phone,item.specialization,item.bio].join(" ").toLowerCase();
        return (!search || haystack.includes(search)) && (!specialization || item.specialization === specialization) && (!status || String(item.status || "active").toLowerCase() === status);
    });
    result.sort((a,b) => {
        if (sort === "name") return String(a.name||"").localeCompare(String(b.name||""));
        const ta = toDate(a.createdAt)?.getTime() || 0, tb = toDate(b.createdAt)?.getTime() || 0;
        return sort === "oldest" ? ta-tb : tb-ta;
    });
    return result;
}

function renderLive() {
    if (!table) return;
    const result = filtered();
    const pageSize = 10;
    const page = Number(window.__founderInstructorPage || 1);
    const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
    const safePage = Math.min(page, totalPages);
    window.__founderInstructorPage = safePage;
    const rows = result.slice((safePage-1)*pageSize, safePage*pageSize);

    const active = instructors.filter(i => String(i.status||"active").toLowerCase()==="active").length;
    const suspended = instructors.filter(i => String(i.status||"").toLowerCase()==="suspended").length;
    const assigned = instructors.reduce((n,i)=>n+(Array.isArray(i.courses)?i.courses.length:0),0);
    const managed = instructors.reduce((n,i)=>n+Number(i.studentsCount ?? i.studentCount ?? 0),0);
    const now = new Date();
    const newThisMonth = instructors.filter(i=>{const d=toDate(i.createdAt);return d&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;

    ["instructorCount","activeInstructorCount","assignedCourseCount","newInstructorCount","managedStudentCount","suspendedInstructorCount"].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.textContent=[instructors.length,active,assigned,newThisMonth,managed,suspended][i];});
    const total = document.getElementById("instructorTotal"); if(total) total.textContent=`${result.length} Instructor${result.length===1?"":"s"}`;
    const info=document.getElementById("pageInfo"); if(info) info.textContent=`Page ${safePage} of ${totalPages}`;

    if (!rows.length) { table.innerHTML=`<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">👨‍🏫</div><h3>No instructors found</h3><p>Try changing your filters or add a new instructor.</p></div></td></tr>`; return; }
    table.innerHTML=rows.map(item=>{
        const name=item.name||"Unnamed Instructor", status=String(item.status||"active").toLowerCase();
        return `<tr><td><div class="instructor-info"><div class="instructor-avatar">${esc(name.charAt(0).toUpperCase())}</div><div class="instructor-details"><span class="instructor-name">${esc(name)}</span><span class="instructor-specialization">${esc(item.specialization||"No specialization")}</span></div></div></td><td>${esc(item.specialization||"—")}</td><td>${Array.isArray(item.courses)?item.courses.length:0}</td><td>${Number(item.studentsCount??item.studentCount??0)}</td><td>${esc(item.email||"—")}</td><td><span class="status ${esc(status)}">${esc(status)}</span></td><td>${esc(formatDate(item.createdAt))}</td><td><div class="action-buttons"><button class="action-btn view-instructor" data-id="${esc(item.id)}" title="View"><i data-lucide="eye"></i></button><button class="action-btn edit-instructor" data-id="${esc(item.id)}" title="Edit"><i data-lucide="pencil"></i></button><button class="action-btn delete-instructor" data-id="${esc(item.id)}" title="Suspend"><i data-lucide="user-x"></i></button></div></td></tr>`;
    }).join("");
    if(window.lucide?.createIcons) window.lucide.createIcons();
}

function subscribe(){
    unsubscribe?.();
    unsubscribe=onSnapshot(collection(db,"instructors"),snapshot=>{instructors=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderLive();},error=>console.error("Founder instructors realtime listener failed:",error));
}

["instructorSearch","specializationFilter","statusFilter","sortInstructors"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{window.__founderInstructorPage=1;renderLive();}));
["specializationFilter","statusFilter","sortInstructors"].forEach(id=>document.getElementById(id)?.addEventListener("change",()=>{window.__founderInstructorPage=1;renderLive();}));
document.getElementById("prevPage")?.addEventListener("click",()=>{window.__founderInstructorPage=Math.max(1,Number(window.__founderInstructorPage||1)-1);renderLive();});
document.getElementById("nextPage")?.addEventListener("click",()=>{window.__founderInstructorPage=Number(window.__founderInstructorPage||1)+1;renderLive();});
window.addEventListener("beforeunload",()=>unsubscribe?.());
subscribe();
