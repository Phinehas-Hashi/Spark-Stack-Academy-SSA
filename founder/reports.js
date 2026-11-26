import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, limit, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const root=document.getElementById("reports");
const state={items:[],unsubscribe:null};
const $=id=>document.getElementById(id);
function setStatus(message,isError=false){
  const box=$("reportsDataStatus"),label=$("reportsDataStatusText");
  if(!box||!label)return;
  box.classList.toggle("has-error",isError);box.classList.toggle("is-ready",!isError);label.textContent=message;
}
function safeDate(value){
  const date=value?.toDate?value.toDate():value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date.toLocaleString():"Time unavailable";
}
function textNode(tag,className,value){
  const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(value??"");return node;
}
function incidentLocation(item){
  const location=item.location||item.geo||{};
  const parts=[location.city,location.region,location.country].filter(Boolean);
  return parts.length?parts.join(", "):item.locationLabel||item.geoLocation||"Location unavailable";
}
function actorLabel(item){
  return item.actorEmail||item.actorName||item.reporterEmail||item.reporterName||item.actorId||item.reporterUid||"Unknown / unauthenticated";
}
function matches(item){
  const search=String($("reportSearch")?.value||"").trim().toLowerCase();
  const priority=$("reportPriority")?.value||"all";
  const status=$("reportStatus")?.value||"all";
  const itemPriority=String(item.priority||"normal").toLowerCase();
  const itemStatus=String(item.status||"pending").toLowerCase();
  const hay=[item.reportId,item.id,item.title,item.description,item.category,item.eventType,item.actorEmail,item.actorName,item.reporterEmail,item.reporterName,item.actorId,incidentLocation(item)].join(" ").toLowerCase();
  return (priority==="all"||itemPriority===priority)&&(status==="all"||itemStatus===status)&&(!search||hay.includes(search));
}
function render(){
  if(!root)return;
  const items=state.items.filter(matches);
  $("reportCount").textContent=state.items.length.toLocaleString();
  root.replaceChildren();
  if(!items.length){root.append(textNode("p","empty",state.items.length?"No reports match the selected filters.":"No critical or system reports have been recorded."));return;}
  items.forEach(item=>{
    const priority=String(item.priority||"normal").toLowerCase();
    const card=document.createElement("article");card.className=`report-card ${priority==="critical"?"critical":priority==="high"?"high":"system"}`;
    const header=document.createElement("div");header.className="report-header";
    const identity=document.createElement("div");
    identity.append(textNode("span","report-id",item.reportId||item.id),textNode("h2","",item.title||item.eventType||"System report"));
    const badge=textNode("span",`priority-badge ${priority}`,priority);
    header.append(identity,badge);
    const description=textNode("p","report-description",item.description||item.message||"No description was supplied.");
    const metadata=document.createElement("div");metadata.className="report-metadata";
    const facts=[
      ["Occurred",safeDate(item.occurredAt||item.createdAt||item.timestamp)],
      ["Actor",actorLabel(item)],
      ["Approximate location",incidentLocation(item)],
      ["Category",item.category||item.eventType||"General"],
      ["Status",item.status||"Pending"],
      ["Source",item.source||item.portal||"Not specified"]
    ];
    facts.forEach(([label,value])=>{const fact=document.createElement("div");fact.className="report-fact";fact.append(textNode("span","",label),textNode("strong","",value));metadata.append(fact);});
    if(item.ipAddress||item.clientIp){const ip=document.createElement("div");ip.className="report-ip";ip.textContent=`Network address: ${item.ipAddress||item.clientIp} · Network metadata is not proof of personal identity.`;metadata.append(ip);}
    card.append(header,description,metadata);root.append(card);
  });
}
async function verifyFounder(user){
  const snap=await getDoc(doc(db,"founder",user.uid));
  const profile=snap.exists()?snap.data():{};
  if(!snap.exists()||profile.role!=="founder"||profile.status!=="active"||profile.active===false||profile.verified===false)throw new Error("Active Founder authorization required.");
  const token=await user.getIdTokenResult();
  if(token.claims.firebase?.sign_in_second_factor!=="totp")throw new Error("Complete Founder authenticator verification first.");
}
onAuthStateChanged(auth,async user=>{
  if(!user){window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Unauthenticated access to critical reports"});location.replace("../login.html");return;}
  try{
    await verifyFounder(user);
    const reportsQuery=query(collection(db,"reports"),limit(500));
    state.unsubscribe=onSnapshot(reportsQuery,snapshot=>{
      state.items=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
        const date=value=>value?.toMillis?.()||(value?.toDate?.().getTime())||(value?new Date(value).getTime():0)||0;
        return date(b.occurredAt||b.createdAt||b.timestamp)-date(a.occurredAt||a.createdAt||a.timestamp);
      });
      setStatus(`Live incident feed connected · ${state.items.length} reports`);
      render();
    },error=>{
      console.error("[Founder Reports] Listener failed:",error);
      setStatus("Reports could not be loaded. Check Founder permissions and Firestore connectivity.",true);
      root.replaceChildren(textNode("p","empty","Reports are temporarily unavailable."));
      window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Critical reports listener denied"});
    });
    ["reportSearch","reportPriority","reportStatus"].forEach(id=>$(id)?.addEventListener(id==="reportSearch"?"input":"change",render));
  }catch(error){
    console.error("[Founder Reports] Access check failed:",error);
    setStatus(error.message||"Founder access denied",true);
    location.replace("security.html");
  }
});
window.addEventListener("beforeunload",()=>state.unsubscribe?.());
