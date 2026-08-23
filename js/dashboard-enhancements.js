import { auth, db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import "./ssa-ui.js";

const role = location.pathname.split("/")[1] || "student";
const dashboard = location.pathname.endsWith("dashboard.html");

if (dashboard) {
    const splashStyle = `#ssaSplash{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:linear-gradient(135deg,#f8fbff,#eef4ff);transition:opacity .35s ease,visibility .35s ease}#ssaSplash.hide{opacity:0;visibility:hidden;pointer-events:none}.ssa-splash-card{text-align:center}.ssa-splash-mark{width:76px;height:76px;margin:auto;display:grid;place-items:center;border-radius:24px;background:#081c3a;color:#ffc107;font-size:30px;box-shadow:0 18px 45px rgba(8,28,58,.2);animation:ssaPulse 1.3s infinite}.ssa-splash-card strong{display:block;margin-top:18px;color:#081c3a;font:800 18px Inter,Poppins,sans-serif}.ssa-splash-card span{display:block;margin-top:6px;color:#64748b;font:500 12px Inter,Poppins,sans-serif}@keyframes ssaPulse{50%{transform:translateY(-5px) scale(1.03)}}`;
    const style = document.createElement("style");
    style.textContent = splashStyle;
    document.head.appendChild(style);

    const splash = document.createElement("div");
    splash.id = "ssaSplash";
    splash.innerHTML = '<div class="ssa-splash-card"><div class="ssa-splash-mark">⚡</div><strong>Spark Stack Academy</strong><span>Loading your workspace…</span></div>';
    document.body.prepend(splash);

    let splashClosed = false;

    function removeSplash(){
        if(splashClosed) return;
        splashClosed = true;
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 450);
    }

    // Hard safety limit: the workspace screen can never remain stuck longer than 3 seconds.
    const splashSafetyTimer = setTimeout(removeSplash, 3000);

    function finish(){
        clearTimeout(splashSafetyTimer);
        removeSplash();
    }

    function addReportShortcut(){
        if(document.getElementById("ssaReportShortcut")) return;
        const b=document.createElement("button");
        b.id="ssaReportShortcut";
        b.type="button";
        b.textContent="⚑ Report an Issue";
        Object.assign(b.style,{position:"fixed",right:"18px",bottom:"18px",zIndex:"1200",border:"1px solid #dbe4f0",borderRadius:"999px",padding:"11px 15px",background:"#fff",color:"#081c3a",fontWeight:"700",fontSize:"12px",boxShadow:"0 12px 30px rgba(15,23,42,.12)"});
        b.onclick=()=>location.href=`/report.html?portal=${encodeURIComponent(role)}`;
        document.body.appendChild(b);
    }

    function animateFounder(){
        if(role!=="founder") return;
        const style=document.createElement("style");
        style.textContent='.founder-page{animation:ssaFounderIn .55s ease}.founder-stat-card,.founder-panel,.founder-ai-panel{animation:ssaFounderFloat .65s ease both}.founder-stat-card:nth-child(2){animation-delay:.06s}.founder-stat-card:nth-child(3){animation-delay:.12s}.founder-stat-card:nth-child(4){animation-delay:.18s}.founder-stat-card:nth-child(5){animation-delay:.24s}@keyframes ssaFounderIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes ssaFounderFloat{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}';
        document.head.appendChild(style);
    }

    document.addEventListener("DOMContentLoaded", async()=>{
        animateFounder();
        addReportShortcut();

        try{
            const user=auth.currentUser;
            if(user) await Promise.race([
                getDoc(doc(db,"users",user.uid)),
                new Promise(resolve=>setTimeout(resolve,1200))
            ]);
        }catch(e){
            console.warn("Dashboard enhancement profile check skipped",e);
        }finally{
            finish();
        }
    }, { once:true });
}
