import { db } from "../../js/firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const types = {
  course:["Course","book-open"], mentorship:["Mentorship","user-round-check"],
  professional_service:["Professional service","briefcase-business"], course_bundle:["Course bundle","layers"],
  bootcamp:["Boot camp","laptop"], digital_product:["Digital product","file-text"],
  addon:["Add-on","puzzle"], corporate_training:["Corporate training","building-2"],
  student_membership:["Student membership","id-card"], institution_onboarding:["Institution service","building"],
  institution_monthly:["Institution subscription","building-2"], institution_annual:["Institution subscription","building-2"],
  student_membership_monthly:["Student membership","id-card"], student_membership_annual:["Student membership","id-card"]
};
let items = [];
let activeType = "all";

function money(item) {
  const amount = Number(item.price ?? 0);
  if (!amount) return "Free";
  return esc(item.currency || "KES") + " " + amount.toLocaleString();
}
function seller(item) {
  if (item.institutionName) return item.institutionName;
  if (item.instructorName) return item.instructorName;
  if (item.ownerType === "institution") return "Verified institution";
  if (item.ownerType === "instructor") return "Independent instructor";
  return "Spark Stack Academy";
}
function render() {
  const term = ($("marketSearch")?.value || "").trim().toLowerCase();
  const shown = items.filter(item => {
    const matchesType = activeType === "all" || item.productType === activeType;
    const haystack = [item.title,item.description,item.category,item.instructorName,item.institutionName].join(" ").toLowerCase();
    return matchesType && (!term || haystack.includes(term));
  });
  $("marketCount").textContent = shown.length + (shown.length === 1 ? " offering" : " offerings");
  $("marketEmpty").hidden = shown.length > 0;
  $("marketItems").innerHTML = shown.map(item => {
    const meta = types[item.productType] || ["Academy offering","shopping-bag"];
    const isCourse = item.productType === "course" && item.sourceId;
    const source = item.ownerType === "institution" ? "Institution course" : item.ownerType === "instructor" ? "Independent instructor" : "Academy offering";
    const action = isCourse
      ? '<a class="market-action" href="course-details.html?id='+encodeURIComponent(item.sourceId)+'">View course <i data-lucide="arrow-up-right"></i></a>'
      : '<span class="market-unavailable">Details coming soon</span>';
    return '<article class="market-item">'+
      '<div class="market-item-cover"><span class="market-item-icon"><i data-lucide="'+meta[1]+'"></i></span><span class="market-item-kind">'+esc(meta[0])+'</span></div>'+
      '<div class="market-item-content"><div class="market-item-origin">'+esc(source)+'</div>'+
      '<h3>'+esc(item.title || "Untitled offering")+'</h3>'+
      '<p>'+esc(item.description || "Explore this offering from the Spark Stack learning ecosystem.")+'</p>'+
      '<div class="market-item-seller"><i data-lucide="store"></i>'+esc(seller(item))+'</div>'+
      '<div class="market-item-bottom"><strong class="market-price">'+money(item)+'</strong>'+action+'</div></div></article>';
  }).join("");
  window.lucide?.createIcons();
}
async function load() {
  $("marketItems").innerHTML = '<div class="market-loading"><i data-lucide="loader-circle"></i><strong>Loading global offerings</strong><span>Finding published courses and products</span></div>';
  try {
    const snap = await getDocs(query(collection(db,"marketplaceItems"),where("status","==","published")));
    items = snap.docs.map(d => ({id:d.id,...d.data()})).filter(x => x.published !== false);
    items.sort((a,b) => {
      const at = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bt = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bt-at;
    });
    render();
  } catch (error) {
    console.error("Marketplace catalogue failed:",error);
    $("marketItems").innerHTML = '<div class="market-loading"><strong>Marketplace temporarily unavailable</strong><span>Please refresh and try again.</span></div>';
    $("marketCount").textContent = "Catalogue unavailable";
  }
}
$("marketSearch")?.addEventListener("input",render);
$("marketFilters")?.addEventListener("click",event => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  activeType = button.dataset.type;
  $("marketFilters").querySelectorAll("button").forEach(b => {
    const active = b === button;
    b.classList.toggle("active",active);
    b.setAttribute("aria-pressed",String(active));
  });
  render();
});
load();
