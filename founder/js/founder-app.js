import "../../js/ui-runtime.js";
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const componentCache = new Map();
const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function loadCSS(path){
  if(document.querySelector(`link[href="${path}"]`)) return;
  const link=document.createElement("link"); link.rel="stylesheet"; link.href=path; document.head.appendChild(link);
}

function ensureFounderShell(){
  document.body.classList.add("founder-shell-ready");
  loadCSS("founder-unified.css");
  loadCSS("founder-complete.css");
  if(!document.getElementById("sidebarOverlay")){
    const overlay=document.createElement("div"); overlay.id="sidebarOverlay"; overlay.className="sidebar-overlay"; document.body.appendChild(overlay);
  }
  let sidebar=document.getElementById("sidebarContainer");
  if(!sidebar){
    sidebar=document.createElement("aside"); sidebar.id="sidebarContainer"; sidebar.className="founder-sidebar";
    const layout=document.querySelector(".dashboard-layout,.founder-app");
    layout ? layout.insertBefore(sidebar,layout.firstChild) : document.body.insertBefore(sidebar,document.body.firstChild);
  }
  let topbar=document.getElementById("topbarContainer");
  if(!topbar){
    topbar=document.createElement("header"); topbar.id="topbarContainer"; topbar.className="founder-topbar";
    const main=document.querySelector("main,.main-content,.founder-main");
    main ? main.insertBefore(topbar,main.firstChild) : document.body.insertBefore(topbar,sidebar.nextSibling);
  }
  document.querySelectorAll(".loading-overlay").forEach(el=>el.remove());
}

async function fetchComponent(path){
  if(componentCache.has(path)) return componentCache.get(path);
  const response=await fetch(path); if(!response.ok) throw new Error(`Failed to load ${path}`);
  const html=await response.text(); componentCache.set(path,html); return html;
}

async function loadComponent({containerId,html,css,callback}){
  loadCSS(css); const container=document.getElementById(containerId); if(!container) return;
  try{ container.innerHTML=await fetchComponent(html); window.lucide?.createIcons(); callback?.(); }
  catch(error){ console.error(`Failed to load ${html}`,error); }
}

async function loadSidebar(){ await loadComponent({containerId:"sidebarContainer",html:"components/sidebar.html",css:"components/sidebar.css",callback:highlightActivePage}); }
async function loadTopbar(){ await loadComponent({containerId:"topbarContainer",html:"components/topbar.html",css:"components/topbar.css",callback:setupTopbar}); }

ensureFounderShell();
window.addEventListener("DOMContentLoaded",async()=>{
  try{ ensureFounderShell(); await Promise.all([loadSidebar(),loadTopbar()]); setupSidebar(); highlightActivePage(); initSearch(); loadFounder(); }
  catch(error){ console.error("Founder shell initialization failed:",error); }
});

function setupSidebar(){
  const menuBtn=document.getElementById("menuBtn"), sidebar=document.querySelector("#sidebarContainer .sidebar"), overlay=document.getElementById("sidebarOverlay");
  if(!menuBtn||!sidebar) return;
  const close=()=>{sidebar.classList.remove("open","active");document.body.classList.remove("sidebar-open","menu-open");overlay?.classList.remove("active");};
  menuBtn.onclick=()=>{const open=!sidebar.classList.contains("open");sidebar.classList.toggle("open",open);document.body.classList.toggle("sidebar-open",open);overlay?.classList.toggle("active",open);};
  overlay?.addEventListener("click",close); document.querySelectorAll(".sidebar-menu a").forEach(link=>link.addEventListener("click",close));
}

function setupTopbar(){
  const button=document.getElementById("notificationsBtn"), dropdown=document.getElementById("notificationDropdown"), viewAll=document.getElementById("viewAllNotifications");
  button?.addEventListener("click",e=>{e.stopPropagation();dropdown?.classList.toggle("active");});
  document.addEventListener("click",e=>{if(dropdown&&!dropdown.contains(e.target)&&!button?.contains(e.target))dropdown.classList.remove("active");});
  viewAll?.addEventListener("click",()=>window.location.href="notifications.html");
}

function loadFounder(){
  onAuthStateChanged(auth,async user=>{
    if(!user){window.location.href="../login.html";return;}
    listenToNotifications(user.uid); loadTopNotifications(user.uid);
    try{
      const cached=sessionStorage.getItem("founderProfile"); if(cached){updateFounderUI(JSON.parse(cached));return;}
      const snapshot=await getDoc(doc(db,"founder",user.uid)); if(!snapshot.exists()) return;
      const founder=snapshot.data(); sessionStorage.setItem("founderProfile",JSON.stringify(founder)); updateFounderUI(founder);
    }catch(error){console.error("Founder profile error:",error);}
  });
}

function updateFounderUI(founder){
  const name=founder.name||"Founder", role=founder.role||"Founder";
  const profileName=document.getElementById("profileName"), avatar=document.getElementById("profileAvatar"), profileRole=document.getElementById("profileRole"), ai=document.getElementById("aiStatusText");
  if(profileName)profileName.textContent=name; if(avatar)avatar.textContent=name.charAt(0).toUpperCase(); if(profileRole)profileRole.textContent=role; if(ai)ai.textContent=`Online • ${name}'s Assistant`; window.founderData=founder;
}

function listenToNotifications(uid){
  const badge=document.getElementById("notificationCount"); if(!badge)return;
  onSnapshot(query(collection(db,"notifications"),where("userId","==",uid)),snapshot=>{let unread=0;snapshot.forEach(item=>{if(item.data().read===false)unread++;});badge.textContent=unread;badge.style.display=unread?"flex":"none";},error=>console.error("Notification badge error:",error));
}

function loadTopNotifications(uid){
  const list=document.getElementById("topNotificationsList"), unread=document.getElementById("dropdownUnread"); if(!list)return;
  onSnapshot(query(collection(db,"notifications"),where("userId","==",uid),orderBy("createdAt","desc"),limit(5)),snapshot=>{
    list.replaceChildren(); let count=0;
    if(snapshot.empty){list.innerHTML='<p class="empty-notifications">No new notifications</p>';if(unread)unread.textContent="0";return;}
    snapshot.forEach(item=>{const data=item.data();if(data.read===false)count++;const node=document.createElement("div");node.className="top-notification-item";node.innerHTML=`<div class="top-notification-icon">🔔</div><div class="top-notification-content"><h4>${escapeHTML(data.title||"Notification")}</h4><p>${escapeHTML(data.message||"")}</p></div>`;list.appendChild(node);});
    if(unread)unread.textContent=count;
  },error=>console.error("Top notifications error:",error));
}

function highlightActivePage(){
  const current=window.location.pathname.split("/").pop()||"dashboard.html";
  document.querySelectorAll(".sidebar-menu a").forEach(link=>{const page=(link.getAttribute("href")||"").split("/").pop();const active=page===current;link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});
}

document.addEventListener("click",async event=>{const logout=event.target.closest("#logoutBtn");if(!logout)return;try{await signOut(auth);sessionStorage.removeItem("founderProfile");window.location.href="../login.html";}catch(error){console.error("Logout failed:",error);}});

function initSearch(){
  const input=document.getElementById("globalSearch"),results=document.getElementById("searchResults"); if(!input||!results)return;
  const pages=[...document.querySelectorAll(".sidebar-menu a[href]")].map(link=>({title:link.querySelector("span")?.textContent?.trim()||link.textContent.trim(),url:link.getAttribute("href")})).filter(p=>p.title&&p.url&&!p.url.startsWith("#"));
  input.addEventListener("input",()=>{const value=input.value.trim().toLowerCase();results.replaceChildren();if(!value){results.style.display="none";return;}pages.filter(p=>p.title.toLowerCase().includes(value)).forEach(page=>{const item=document.createElement("button");item.type="button";item.className="search-result";item.textContent=page.title;item.onclick=()=>window.location.href=page.url;results.appendChild(item);});results.style.display=results.childElementCount?"block":"none";});
}
