import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $=id=>document.getElementById(id);
const state={user:null,notifications:[],filter:"all",unsubscribe:null,preferences:{},rules:{}};
const preferencesRef=doc(db,"settings","founderNotifications");
const sendBroadcastCall=httpsCallable(getFunctions(),"founderSendBroadcast");
const defaultPreferences={paymentAlerts:true,studentAlerts:true,instructorAlerts:true,securityAlerts:true,dashboardNotifications:true,emailNotifications:false,criticalMode:true};
const defaultRules={paymentRule:true,walletRule:true,securityRule:true,systemRule:true};

function setStatus(message,isError=false){
  const box=$("notificationsDataStatus"),label=$("notificationsDataStatusText");
  if(!box||!label)return;
  box.classList.toggle("has-error",isError);
  box.classList.toggle("is-ready",!isError);
  label.textContent=message;
}
function toast(message,type="success"){
  if(window.showFounderToast){window.showFounderToast(message,type);return;}
  const node=document.createElement("div");node.className=`founder-toast ${type}`;node.textContent=message;document.body.appendChild(node);setTimeout(()=>node.remove(),3500);
}
function timeAgo(timestamp){
  const date=timestamp?.toDate?timestamp.toDate():timestamp?new Date(timestamp):null;
  if(!date||Number.isNaN(date.getTime()))return "Date unavailable";
  const minutes=Math.max(0,Math.floor((Date.now()-date.getTime())/60000));
  return minutes<1?"Just now":minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:date.toLocaleString();
}
function safeCell(value){
  let text=String(value??"");
  if(/^[\\s\\u0000-\\u001f]*[=+@-]/.test(text))text="'"+text;
  return `"${text.replaceAll('"','""')}"`;
}
function visibleNotifications(){
  const search=$("notificationSearch")?.value.trim().toLowerCase()||"";
  const priority=$("notificationPriority")?.value||"all";
  return state.notifications.filter(item=>{
    if(item.archived===true)return false;
    const typeMatch=state.filter==="all"||item.type===state.filter;
    const priorityMatch=priority==="all"||item.priority===priority;
    const text=`${item.title||""} ${item.message||""}`.toLowerCase();
    return typeMatch&&priorityMatch&&(!search||text.includes(search));
  });
}
function renderNotifications(){
  const list=$("notificationList");if(!list)return;
  const items=visibleNotifications();list.replaceChildren();
  if(!items.length){
    const empty=document.createElement("div");empty.className="empty-state";
    const heading=document.createElement("h3");heading.textContent="No notifications found";
    const copy=document.createElement("p");copy.textContent="New academy activity will appear here.";
    empty.append(heading,copy);list.append(empty);return;
  }
  items.slice(0,100).forEach(item=>{
    const card=document.createElement("article");card.className=`notification-card ${item.read?"":"unread"}`;
    const icon=document.createElement("div");icon.className="notification-icon";icon.textContent=item.priority==="critical"?"!":item.type==="payment"?"KES":"•";
    const content=document.createElement("div");content.className="notification-content";
    const top=document.createElement("div");top.className="notification-top";
    const title=document.createElement("h3");title.className="notification-title";title.textContent=item.title||"Academy update";
    const time=document.createElement("span");time.className="notification-time";time.textContent=timeAgo(item.createdAt);
    const message=document.createElement("p");message.className="notification-message";message.textContent=item.message||"";
    const footer=document.createElement("div");footer.className="notification-footer";
    const type=document.createElement("span");type.className="notification-type";type.textContent=item.type||"system";
    const actions=document.createElement("div");actions.className="notification-actions";
    if(!item.read){const read=document.createElement("button");read.className="read-btn";read.textContent="Mark read";read.addEventListener("click",()=>markRead(item.id));actions.append(read);}
    top.append(title,time);footer.append(type,actions);content.append(top,message,footer);card.append(icon,content);list.append(card);
  });
}
function renderHistory(){
  const body=$("notificationHistoryTable");if(!body)return;
  body.replaceChildren();
  const records=state.notifications.slice(0,100);
  if(!records.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=7;cell.className="empty-table";cell.textContent="No notification history available.";row.append(cell);body.append(row);return;}
  records.forEach(item=>{
    const row=document.createElement("tr");
    const values=[timeAgo(item.createdAt),item.title||"Academy update",item.type||"system",item.priority||"normal",item.userId||"Founder",item.read?"Read":"Unread"];
    values.forEach((value,index)=>{const cell=document.createElement("td");cell.textContent=value;if(index===3)cell.className=`priority ${item.priority||"normal"}`;row.append(cell);});
    const action=document.createElement("td");action.textContent=item.type==="security"?"Protected record":item.read?"Read":"Pending";row.append(action);body.append(row);
  });
}
function renderSummary(){
  const records=state.notifications.filter(item=>item.archived!==true);
  const unread=records.filter(item=>!item.read).length;
  const financial=records.filter(item=>["payment","wallet"].includes(item.type)).length;
  const security=records.filter(item=>item.type==="security"||item.priority==="critical").length;
  $("totalNotifications").textContent=records.length.toLocaleString();
  $("unreadNotifications").textContent=unread.toLocaleString();
  $("financialNotifications").textContent=financial.toLocaleString();
  $("securityNotifications").textContent=security.toLocaleString();
  const critical=records.filter(item=>item.priority==="critical"&&!item.read);
  const list=$("criticalList");if(list){list.replaceChildren();if(!critical.length){list.textContent="No unread critical alerts."; }else critical.slice(0,20).forEach(item=>{const line=document.createElement("p");line.textContent=`${item.title||"Critical alert"}: ${item.message||""}`;list.append(line);});}
  const count=document.querySelector(".alert-count");if(count)count.textContent=`${critical.length} Active`;
  renderNotifications();renderHistory();
}
async function verifyFounder(user){
  const snap=await getDoc(doc(db,"founder",user.uid));
  const profile=snap.exists()?snap.data():{};
  if(!snap.exists()||profile.role!=="founder"||profile.status!=="active"||profile.active===false||profile.verified===false)throw new Error("Active Founder authorization required.");
}
async function markRead(id){
  try{await updateDoc(doc(db,"notifications",id),{read:true,readAt:serverTimestamp()});}
  catch(error){console.error(error);toast("Could not update this notification.","error");}
}
async function markAllRead(){
  const unread=state.notifications.filter(item=>!item.read&&item.archived!==true);
  if(!unread.length)return;
  try{
    for(let i=0;i<unread.length;i+=450){const batch=writeBatch(db);unread.slice(i,i+450).forEach(item=>batch.update(doc(db,"notifications",item.id),{read:true,readAt:serverTimestamp()}));await batch.commit();}
    toast("All notifications marked as read.");
  }catch(error){console.error(error);toast("Could not update notifications.","error");}
}
async function sendBroadcast(){
  const target=$("broadcastTarget")?.value||"all";
  const priority=$("broadcastPriority")?.value||"normal";
  const title=$("broadcastTitle")?.value.trim()||"";
  const message=$("broadcastMessage")?.value.trim()||"";
  if(!title||title.length>120||!message||message.length>4000){toast("Enter a title (up to 120 characters) and message (up to 4,000 characters).","error");return;}
  if(!window.SSAOnlineActionGuard?.requireOnline("Sending a Founder announcement"))return;
  const confirmed=await window.ssaConfirm?.(`Send this ${priority} announcement to ${target==="all"?"all users":target}? The server enforces a daily broadcast limit.`,{title:"Confirm announcement",confirmText:"Send announcement",cancelText:"Cancel",tone:priority==="critical"?"danger":"default"});
  if(!confirmed)return;
  const button=$("sendBroadcast");button.disabled=true;button.textContent="Sending…";
  try{
    const result=await sendBroadcastCall({target,priority,title,message});
    const count=Number(result.data?.recipientCount||0);
    $("broadcastTitle").value="";$("broadcastMessage").value="";
    window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Server-side announcement broadcast sent"});
    toast(`Announcement sent to ${count.toLocaleString()} recipients.`);
  }catch(error){console.error("[Founder Notifications] Broadcast failed:",error);toast(error.message||"Broadcast could not be sent.","error");}
  finally{button.disabled=false;button.textContent="📨 Send Announcement";}
}
function readPreferences(){
  for(const [id,value] of Object.entries({...defaultPreferences,...state.preferences,...defaultRules,...state.rules})){const input=$(id);if(input&&input.type==="checkbox")input.checked=value===true;}
}
async function loadPreferences(){
  const snap=await getDoc(preferencesRef);
  if(snap.exists()){const data=snap.data();state.preferences=data.preferences||{};state.rules=data.rules||{};}
  readPreferences();
}
async function savePreferences(){
  const preferences={},rules={};
  Object.keys(defaultPreferences).forEach(id=>preferences[id]=$(id)?.checked===true);
  Object.keys(defaultRules).forEach(id=>rules[id]=$(id)?.checked===true);
  await setDoc(preferencesRef,{preferences,rules,updatedAt:serverTimestamp(),updatedBy:state.user.uid},{merge:true});
  state.preferences=preferences;state.rules=rules;
  window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Notification preferences updated"});
  toast("Notification preferences saved.");
}
async function clearRead(){
  const removable=state.notifications.filter(item=>item.read&&item.type!=="security"&&item.priority!=="critical");
  if(!removable.length){toast("No read non-security notifications to clear.");return;}
  const confirmed=await window.ssaConfirm?.(`Delete ${removable.length} read non-security notifications? Security and critical alerts will be preserved.`,{title:"Clear read notifications",confirmText:"Delete read notifications",cancelText:"Cancel",tone:"danger"});
  if(!confirmed)return;
  try{for(let i=0;i<removable.length;i+=450){const batch=writeBatch(db);removable.slice(i,i+450).forEach(item=>batch.delete(doc(db,"notifications",item.id)));await batch.commit();}toast("Read non-security notifications cleared.");}
  catch(error){console.error(error);toast("Could not clear read notifications.","error");}
}
async function exportNotifications(){
  const confirmed=await window.ssaConfirm?.("Export the notification history, including security and financial alert metadata. Store this file securely.",{title:"Export notification history",confirmText:"Export CSV",cancelText:"Cancel"});
  if(!confirmed)return;
  const rows=[["Date","Title","Message","Type","Priority","Recipient","Read"],...state.notifications.map(item=>[timeAgo(item.createdAt),item.title,item.message,item.type,item.priority,item.userId,item.read?"Read":"Unread"])];
  const csv=rows.map(row=>row.map(safeCell).join(",")).join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="ssa-notification-history.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Notification history exported"});
}
async function backupNotifications(){
  const confirmed=await window.ssaConfirm?.("Create a local JSON backup of the currently loaded notification history?",{title:"Back up notifications",confirmText:"Create backup",cancelText:"Cancel"});
  if(!confirmed)return;
  const payload={exportedAt:new Date().toISOString(),count:state.notifications.length,notifications:state.notifications};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="ssa-notifications-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindControls(){
  document.querySelectorAll(".filter-btn").forEach(button=>button.addEventListener("click",()=>{state.filter=button.dataset.filter;document.querySelectorAll(".filter-btn").forEach(item=>item.classList.toggle("active",item===button));renderNotifications();}));
  $("notificationSearch")?.addEventListener("input",renderNotifications);
  $("notificationPriority")?.addEventListener("change",renderNotifications);
  $("markAllRead")?.addEventListener("click",markAllRead);
  $("refreshNotifications")?.addEventListener("click",()=>toast("The notification feed updates automatically."));
  $("refreshNotificationSystem")?.addEventListener("click",()=>toast("The notification feed updates automatically."));
  $("sendBroadcast")?.addEventListener("click",sendBroadcast);
  $("saveNotificationSettings")?.addEventListener("click",savePreferences);
  $("saveNotificationRules")?.addEventListener("click",savePreferences);
  $("saveAllNotificationSettings")?.addEventListener("click",savePreferences);
  $("clearReadNotifications")?.addEventListener("click",clearRead);
  $("exportNotifications")?.addEventListener("click",exportNotifications);
  $("backupNotifications")?.addEventListener("click",backupNotifications);
  $("printNotifications")?.addEventListener("click",()=>window.print());
  $("loadMoreNotifications")?.addEventListener("click",()=>toast("Showing the most recent 100 loaded notification records."));
}
onAuthStateChanged(auth,async user=>{
  if(!user){window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Unauthenticated access to notifications"});location.replace("../login.html");return;}
  state.user=user;
  try{
    await verifyFounder(user);
    await loadPreferences();
    bindControls();
    const feed=query(collection(db,"notifications"),where("userId","==",user.uid));
    state.unsubscribe=onSnapshot(feed,snapshot=>{
      state.notifications=snapshot.docs.map(entry=>({id:entry.id,...entry.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      renderSummary();
      setStatus(`Live notification feed connected · ${state.notifications.length} records`);
      $("notificationFirestoreStatus").textContent="Connected";
      $("notificationRealtimeStatus").textContent="Active";
      $("notificationAdmin").textContent=user.email||"Verified Founder";
      $("notificationSecurityCheck").textContent=new Date().toLocaleString();
    },error=>{
      console.error("[Founder Notifications] Feed listener failed:",error);
      setStatus("Notification feed unavailable. Check Founder permissions and Firestore connectivity.",true);
      $("notificationFirestoreStatus").textContent="Error";
      $("notificationRealtimeStatus").textContent="Unavailable";
      window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Founder notification feed listener denied"});
      toast("Notifications are temporarily unavailable.","error");
    });
  }catch(error){console.error("[Founder Notifications] Access check failed:",error);setStatus(error.message||"Founder access denied",true);toast(error.message||"Founder authorization failed.","error");location.replace("security.html");}
});
window.addEventListener("beforeunload",()=>state.unsubscribe?.());
window.addEventListener("DOMContentLoaded",()=>window.lucide?.createIcons());
