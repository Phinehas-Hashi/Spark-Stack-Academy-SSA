// Spark Stack Academy — Smart Connectivity Recovery Engine
// Shared full-screen recovery UI. The interrupted document remains alive; no page reload or protected-action replay.
(() => {
  if (window.__SSA_SMART_CONNECTIVITY__) return;
  window.__SSA_SMART_CONNECTIVITY__ = true;

  const style = document.createElement("style");
  style.textContent = `
    #ssa-connectivity-status{position:fixed;top:12px;right:12px;z-index:2147482500;display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(214,183,121,.3);border-radius:999px;background:rgba(15,20,25,.95);color:#eaf4f8;box-shadow:0 8px 24px #0003;font:600 12px system-ui,sans-serif;backdrop-filter:blur(14px);cursor:pointer}
    .ssa-net-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#67e6b1;box-shadow:0 0 10px currentColor}
    #ssa-connectivity-status[data-state="offline"] .ssa-net-dot{background:#ff718d}
    #ssa-connectivity-status[data-state="checking"] .ssa-net-dot,#ssa-connectivity-status[data-state="reconnecting"] .ssa-net-dot,#ssa-connectivity-status[data-state="weak"] .ssa-net-dot{background:#56e0ff}
    #ssa-connectivity-panel[hidden],#ssa-connectivity-recovery[hidden]{display:none!important}
    #ssa-connectivity-panel{position:fixed;top:54px;right:12px;z-index:2147482501;width:min(350px,calc(100vw - 24px));padding:16px;border:1px solid #29445a;border-radius:16px;background:#101a2a;color:#eaf4f8;box-shadow:0 16px 44px #0006;font:13px/1.45 system-ui,sans-serif}
    #ssa-connectivity-panel .head{display:flex;justify-content:space-between;align-items:center}#ssa-connectivity-panel h2{margin:0;font-size:15px}
    #ssa-connectivity-panel button{border:0;cursor:pointer}#ssa-connectivity-panel .close{background:transparent;color:#eee;font-size:22px}
    #ssa-connectivity-panel dl{display:grid;grid-template-columns:1fr auto;gap:8px 12px;margin:14px 0}#ssa-connectivity-panel dt{color:#a9bac8}#ssa-connectivity-panel dd{margin:0;text-align:right;font-weight:600}
    #ssa-connectivity-panel .check{width:100%;padding:10px;border-radius:10px;background:#56e0ff;color:#07111d;font-weight:700}
    #ssa-connectivity-recovery{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow-y:auto;padding:22px;background:radial-gradient(ellipse at 50% 22%,#30435280,transparent 48%),linear-gradient(145deg,#070b16,#101a2b 55%,#0b1020);color:#edf7fb;font:14px/1.5 system-ui,sans-serif}
    #ssa-connectivity-recovery *{box-sizing:border-box}#ssa-connectivity-recovery .shell{width:min(740px,100%);margin:auto}
    #ssa-connectivity-recovery .top{display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;border-bottom:1px solid #56e0ff30}
    #ssa-connectivity-recovery .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.12em}
    #ssa-connectivity-recovery .mark{display:grid;place-items:center;width:38px;height:38px;border:1px solid #267d91;border-radius:12px;color:#56e0ff;background:#162638;font-size:20px}
    #ssa-connectivity-recovery small{display:block;color:#91a7b9;font-size:9px;letter-spacing:.16em}
    #ssa-connectivity-recovery .mode{padding:6px 10px;border:1px solid #ff718d60;border-radius:99px;color:#ffb0bd;font-size:10px;font-weight:800;letter-spacing:.12em}
    #ssa-connectivity-recovery .hero{text-align:center;padding:22px 0 12px}#ssa-connectivity-recovery .eyebrow{color:#56e0ff;font-size:10px;font-weight:800;letter-spacing:.2em}
    #ssa-connectivity-recovery .gear-stage{position:relative;width:min(245px,68vw);aspect-ratio:1;margin:10px auto;display:grid;place-items:center}
    #ssa-connectivity-recovery .orbit{position:absolute;inset:7%;border:1px dashed #9c8cff75;border-radius:50%;box-shadow:inset 0 0 24px #9c8cff12;animation:ssa-orbit 28s linear infinite}
    #ssa-connectivity-recovery .gear-svg{position:absolute;width:100%;height:100%;overflow:visible}
    #ssa-connectivity-recovery .gear{transform-box:fill-box;transform-origin:center;fill:#26384a;stroke:#56e0ff;stroke-width:1.5;filter:drop-shadow(0 0 5px #56e0ff29)}
    #ssa-connectivity-recovery .hole{fill:#0a1320;stroke:#8eeeff}
    #ssa-connectivity-recovery .g1{animation:ssa-spin 12s linear infinite}#ssa-connectivity-recovery .g2{animation:ssa-spin-rev 14s linear infinite}
    #ssa-connectivity-recovery .g3{animation:ssa-spin 16s linear infinite}#ssa-connectivity-recovery .g4{animation:ssa-spin-rev 18s linear infinite}
    #ssa-connectivity-recovery[data-phase="reconnecting"] .g1{animation-duration:2.2s}#ssa-connectivity-recovery[data-phase="reconnecting"] .g2{animation-duration:2.8s}
    #ssa-connectivity-recovery[data-phase="reconnecting"] .g3{animation-duration:3.2s}#ssa-connectivity-recovery[data-phase="reconnecting"] .g4{animation-duration:3.8s}
    #ssa-connectivity-recovery[data-phase="restoring"] .gear{animation-duration:.8s}
    #ssa-connectivity-recovery .core{position:relative;z-index:2;display:grid;place-items:center;width:64px;height:64px;border:1px solid #56e0ff;border-radius:50%;background:radial-gradient(circle,#203b50,#101c30 72%);color:#8eeeff;box-shadow:0 0 28px #56e0ff33,0 0 48px #9c8cff22;font-size:27px}
    #ssa-connectivity-recovery h1{margin:0;color:#f2fbff;font-size:clamp(24px,5vw,34px);line-height:1.15}
    #ssa-connectivity-recovery .lead{max-width:520px;margin:9px auto 0;color:#b3c5d2}
    #ssa-connectivity-recovery .phase{margin-top:13px;color:#56e0ff;font-size:10px;font-weight:800;letter-spacing:.13em}
    #ssa-connectivity-recovery .modules{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0}
    #ssa-connectivity-recovery .module{padding:11px 7px;border:1px solid #56e0ff2b;border-radius:13px;background:#14243acc;text-align:center}
    #ssa-connectivity-recovery .module i{display:grid;place-items:center;width:32px;height:32px;margin:0 auto 7px;border:1px solid #56e0ff55;border-radius:9px;color:#56e0ff;background:#1b3045;font-style:normal}
    #ssa-connectivity-recovery .module b{display:block;font-size:12px}#ssa-connectivity-recovery .module span{display:block;margin-top:3px;color:#a4bac9;font-size:10px}
    #ssa-connectivity-recovery .card{padding:15px;border:1px solid #56e0ff33;border-radius:15px;background:#101b2beF}
    #ssa-connectivity-recovery .card-head{display:flex;justify-content:space-between;margin-bottom:11px;font-weight:700}
    #ssa-connectivity-recovery .live{color:#56e0ff;font-size:10px;letter-spacing:.12em}
    #ssa-connectivity-recovery .diag-list{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    #ssa-connectivity-recovery .diag{display:flex;align-items:center;gap:8px;color:#d3e2ec;font-size:11px}
    #ssa-connectivity-recovery .diag i{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#56e0ff}
    #ssa-connectivity-recovery .diag[data-status="good"] i{background:#67e6b1}#ssa-connectivity-recovery .diag[data-status="bad"] i{background:#ff718d}
    #ssa-connectivity-recovery .toggle{display:flex;justify-content:space-between;width:100%;margin-top:13px;padding:11px 0 0;border:0;border-top:1px solid #56e0ff26;background:transparent;color:#8eeeff;text-align:left;font-weight:700;cursor:pointer}
    #ssa-connectivity-recovery .details{margin-top:9px}#ssa-connectivity-recovery .details[hidden]{display:none}
    #ssa-connectivity-recovery .detail{display:flex;justify-content:space-between;gap:12px;padding:5px 0;color:#a9bdcc;font-size:11px}
    #ssa-connectivity-recovery .detail strong{color:#e5f1f7;text-align:right}
    #ssa-connectivity-recovery .footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:13px;color:#8da3b5;font-size:11px}
    #ssa-connectivity-recovery .retry{padding:10px 14px;border:1px solid #56e0ff80;border-radius:10px;background:#56e0ff;color:#07111d;font-weight:800;cursor:pointer}
    #ssa-connectivity-recovery .retry:disabled{opacity:.55}
    @keyframes ssa-spin{to{transform:rotate(360deg)}}@keyframes ssa-spin-rev{to{transform:rotate(-360deg)}}@keyframes ssa-orbit{to{transform:rotate(360deg)}}
    @media(max-width:560px){#ssa-connectivity-recovery{padding:14px}#ssa-connectivity-recovery .gear-stage{width:min(205px,60vw)}#ssa-connectivity-recovery .modules{grid-template-columns:repeat(2,1fr)}#ssa-connectivity-recovery .diag-list{grid-template-columns:1fr}#ssa-connectivity-recovery .footer{align-items:stretch;flex-direction:column}#ssa-connectivity-recovery .retry{width:100%}}
    @media(prefers-reduced-motion:reduce){#ssa-connectivity-recovery .gear,#ssa-connectivity-recovery .orbit{animation:none!important}}
  `;
  document.head.appendChild(style);

  const status = document.createElement("button");
  status.id = "ssa-connectivity-status"; status.type = "button"; status.dataset.state = "checking";
  status.setAttribute("aria-label","Connection status. Open diagnostics."); status.setAttribute("aria-expanded","false"); status.setAttribute("aria-controls","ssa-connectivity-panel");
  status.innerHTML = '<span class="ssa-net-dot" aria-hidden="true"></span><span class="ssa-net-label">Checking</span>';

  const panel = document.createElement("section");
  panel.id = "ssa-connectivity-panel"; panel.hidden = true; panel.setAttribute("role","dialog"); panel.setAttribute("aria-labelledby","ssa-panel-title");
  panel.innerHTML = `
    <div class="head"><h2 id="ssa-panel-title">Connection diagnostics</h2><button class="close" type="button" aria-label="Close">&times;</button></div>
    <p class="panel-state"><span class="ssa-net-dot"></span> <strong data-state-label>Checking</strong></p>
    <dl><dt>Browser network</dt><dd data-field="browser">Checking</dd><dt>Internet probe</dt><dd data-field="internet">Not checked</dd><dt>Firestore endpoint</dt><dd data-field="firestore">Not checked</dd><dt>Network type</dt><dd data-field="type">Not reported</dd><dt>Last check</dt><dd data-field="checked">Not checked</dd><dt>Response time</dt><dd data-field="latency">Not measured</dd></dl>
    <p>Firebase Authentication is not independently probed. Your existing sign-in session is left unchanged.</p>
    <button class="check" type="button">Recheck connection</button>`;
  const recovery = document.createElement("section");
  recovery.id = "ssa-connectivity-recovery"; recovery.hidden = true; recovery.dataset.phase = "offline";
  recovery.setAttribute("role","dialog"); recovery.setAttribute("aria-modal","true"); recovery.setAttribute("aria-labelledby","ssa-recovery-title");
  recovery.innerHTML = `
    <div class="shell">
      <header class="top"><div class="brand"><span class="mark">✦</span><span>SPARK STACK<small>SMART CONNECTIVITY CORE</small></span></div><span class="mode">RECOVERY MODE</span></header>
      <main class="hero"><div class="eyebrow">FOUR SYSTEMS · ONE RECOVERY ENGINE</div>
        <div class="gear-stage" aria-hidden="true"><div class="orbit"></div><svg class="gear-svg" viewBox="0 0 240 240">
          <g class="gear g1" transform="translate(120 42) scale(.66)"><path d="M-8-38H8L11-27 21-23 30-30 41-19 34-9 38 0 34 10 41 19 30 30 21 23 11 27 8 38H-8L-11 27-21 23-30 30-41 19-34 10-38 0-34-9-41-19-30-30-21-23-11-27Z"/><circle class="hole" r="13"/></g>
          <g class="gear g2" transform="translate(198 120) scale(.66)"><path d="M-8-38H8L11-27 21-23 30-30 41-19 34-9 38 0 34 10 41 19 30 30 21 23 11 27 8 38H-8L-11 27-21 23-30 30-41 19-34 10-38 0-34-9-41-19-30-30-21-23-11-27Z"/><circle class="hole" r="13"/></g>
          <g class="gear g3" transform="translate(120 198) scale(.66)"><path d="M-8-38H8L11-27 21-23 30-30 41-19 34-9 38 0 34 10 41 19 30 30 21 23 11 27 8 38H-8L-11 27-21 23-30 30-41 19-34 10-38 0-34-9-41-19-30-30-21-23-11-27Z"/><circle class="hole" r="13"/></g>
          <g class="gear g4" transform="translate(42 120) scale(.66)"><path d="M-8-38H8L11-27 21-23 30-30 41-19 34-9 38 0 34 10 41 19 30 30 21 23 11 27 8 38H-8L-11 27-21 23-30 30-41 19-34 10-38 0-34-9-41-19-30-30-21-23-11-27Z"/><circle class="hole" r="13"/></g>
        </svg><div class="core">✦</div></div>
        <h1 id="ssa-recovery-title">Reconnecting your workspace</h1><p class="lead" data-copy>Connection interrupted. Spark is checking the network and keeping this page open while recovery runs.</p>
        <div class="phase" data-phase-label>SEARCHING FOR NETWORK</div>
      </main>
      <section class="modules">
        <div class="module" data-module="network"><i>⌁</i><b>Network</b><span data-module-state>Searching</span></div>
        <div class="module" data-module="services"><i>◇</i><b>Services</b><span data-module-state>Waiting</span></div>
        <div class="module" data-module="session"><i>⛨</i><b>Session</b><span data-module-state>Preserved in this tab</span></div>
        <div class="module" data-module="restore"><i>⚙</i><b>Restoration</b><span data-module-state>Standby</span></div>
      </section>
      <section class="card"><div class="card-head"><span>Recovery diagnostics</span><span class="live">LIVE STATUS</span></div>
        <div class="diag-list">
          <div class="diag" data-diag="internet"><i></i><span>Internet reachability: checking</span></div>
          <div class="diag" data-diag="firestore"><i></i><span>Firestore endpoint: waiting</span></div>
          <div class="diag" data-diag="session"><i></i><span>Current page: preserved in this tab</span></div>
          <div class="diag" data-diag="restore"><i></i><span>Page restoration: waiting</span></div>
        </div>
        <button class="toggle" type="button" aria-expanded="false" aria-controls="ssa-recovery-details"><span>Connection Details</span><span>＋</span></button>
        <div class="details" id="ssa-recovery-details" hidden>
          <div class="detail"><span>Current page</span><strong data-detail="page">Current page</strong></div>
          <div class="detail"><span>Scroll position</span><strong data-detail="scroll">Preserved</strong></div>
          <div class="detail"><span>Browser network</span><strong data-detail="browser">Offline</strong></div>
          <div class="detail"><span>Firebase Auth</span><strong>Session unchanged; not independently probed</strong></div>
          <div class="detail"><span>Last successful check</span><strong data-detail="last">Not available</strong></div>
        </div>
      </section>
      <footer class="footer"><span>Keep this tab open. The page remains in memory; unsaved changes are not uploaded until the service accepts them.</span><button class="retry" type="button">Retry connection</button></footer>
    </div>`;
  const mount = () => { document.body.append(status,panel,recovery); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded",mount,{once:true});

  let state="checking", lastCheckedAt=0, lastLatencyMs=null, firestoreReachable=null, probeInFlight=false;
  let offlineTimer=null, restoreTimer=null, recoveryVisible=false, interruptedContext=null;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const $=selector=>recovery.querySelector(selector);
  const field=name=>panel.querySelector('[data-field="'+name+'"]');
  const pageLabel=()=>((location.pathname.split("/").pop()||"Current page").replace(/\.html?$/i,"").replace(/[-_]/g," "));
  const timeLabel=value=>value?new Date(value).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"Not available";
  function captureContext(){
    if(interruptedContext)return;
    interruptedContext={path:location.pathname+location.search+location.hash,scrollX:scrollX,scrollY:scrollY};
    $("[data-detail='page']").textContent=pageLabel();
    $("[data-detail='scroll']").textContent=Math.round(scrollY)+" px";
  }
  function moduleState(name,value){const el=recovery.querySelector('[data-module="'+name+'"] [data-module-state]');if(el)el.textContent=value;}
  function diagnostic(name,value,statusValue){const el=recovery.querySelector('[data-diag="'+name+'"]');if(!el)return;el.querySelector("span").textContent=value;if(statusValue)el.dataset.status=statusValue;}
  function refresh(){
    const labels={checking:"Checking",online:"Online",weak:"Weak connection",offline:"Offline",reconnecting:"Reconnecting"};
    panel.querySelector("[data-state-label]").textContent=labels[state]||state;
    field("browser").textContent=navigator.onLine?"Connected":"Offline";
    field("internet").textContent=state==="online"||state==="weak"?"Reachable":state;
    field("firestore").textContent=firestoreReachable===true?"Endpoint responded":firestoreReachable===false?"Unreachable":"Not checked";
    field("type").textContent=connection?.effectiveType?connection.effectiveType.toUpperCase():"Not reported";
    field("checked").textContent=timeLabel(lastCheckedAt);
    field("latency").textContent=lastLatencyMs===null?"Not measured":Math.round(lastLatencyMs)+" ms";
    panel.querySelector(".check").disabled=probeInFlight;
    panel.querySelector(".check").textContent=probeInFlight?"Checking…":"Recheck connection";
    if(recoveryVisible){$("[data-detail='browser']").textContent=navigator.onLine?"Connected":"Offline";$("[data-detail='last']").textContent=timeLabel(lastCheckedAt);}
  }
  function setState(next,detail=""){
    state=next;status.dataset.state=next;
    status.querySelector(".ssa-net-label").textContent=({checking:"Checking",online:"Online",weak:"Weak connection",offline:"Offline",reconnecting:"Reconnecting"})[next]||"Connection";
    refresh();
    window.dispatchEvent(new CustomEvent("ssa:connectivity-change",{detail:{state:next,online:next==="online"||next==="weak",checkedAt:lastCheckedAt||Date.now(),detail}}));
  }
  function showRecovery(){
    if(recoveryVisible)return;
    recoveryVisible=true;captureContext();recovery.hidden=false;recovery.dataset.phase="offline";document.body.style.overflow="hidden";
    moduleState("network","Searching");moduleState("services","Waiting");moduleState("session","Preserved in this tab");moduleState("restore","Standby");
    diagnostic("internet","Internet reachability: offline","bad");diagnostic("firestore","Firestore endpoint: waiting");diagnostic("session","Current page: preserved in this tab","good");diagnostic("restore","Page restoration: waiting");
    $("[data-phase-label]").textContent="SEARCHING FOR NETWORK";
    refresh();
  }
  function completeRecovery(){
    if(!recoveryVisible)return;
    recovery.dataset.phase="restoring";$("[data-phase-label]").textContent="CONNECTION VERIFIED · RESTORING";
    $("[data-copy]").textContent="Network access is verified. The four gears are synchronizing before your original page returns.";
    moduleState("network","Verified");moduleState("services",firestoreReachable?"Endpoint responded":"Not independently verified");moduleState("session","Preserved");moduleState("restore","Restoring");
    diagnostic("internet","Internet reachability: verified","good");
    diagnostic("firestore",firestoreReachable?"Firestore endpoint: responded":"Firestore endpoint: not verified",firestoreReachable?"good":"");
    diagnostic("restore","Page restoration: ready","good");
    clearTimeout(restoreTimer);
    restoreTimer=setTimeout(()=>{
      recovery.hidden=true;recoveryVisible=false;document.body.style.overflow="";
      if(interruptedContext&&location.pathname+location.search+location.hash===interruptedContext.path)window.scrollTo(interruptedContext.scrollX,interruptedContext.scrollY);
      interruptedContext=null;setState(state==="weak"?"weak":"online");status.focus({preventScroll:true});
    },1250);
  }
  async function probe(url,timeoutMs=4500,mode="cors"){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{const response=await fetch(url,{method:"GET",mode,cache:"no-store",signal:controller.signal});return response.status<500||response.status===401||response.status===403;}
    finally{clearTimeout(timeout);}
  }
  async function checkConnection(){
    if(probeInFlight)return;
    probeInFlight=true;refresh();
    if(!navigator.onLine){lastCheckedAt=Date.now();lastLatencyMs=null;firestoreReachable=null;setState("offline");showRecovery();probeInFlight=false;refresh();return;}
    if(state==="offline"){setState("reconnecting");if(recoveryVisible){recovery.dataset.phase="reconnecting";$("[data-phase-label]").textContent="VALIDATING CONNECTION";moduleState("network","Validating");}}
    const started=performance.now();
    try{
      await probe("https://www.gstatic.com/generate_204?ssa_ping="+Date.now(),5000,"no-cors");
      lastLatencyMs=performance.now()-started;lastCheckedAt=Date.now();
      try{firestoreReachable=await probe("https://firestore.googleapis.com/v1/projects/spark-stack-academy-ssa/databases/(default)/documents",5000);}catch(_){firestoreReachable=false;}
      const weak=lastLatencyMs>=1800||Number(connection?.rtt||0)>=1200;
      if(recoveryVisible&&firestoreReachable!==true){
        setState("weak","Internet is available; Academy data service is not verified");
        moduleState("network","Verified");
        moduleState("services","Unavailable");
        diagnostic("internet","Internet reachability: verified","good");
        diagnostic("firestore","Firestore endpoint: unavailable","bad");
        $("[data-phase-label]").textContent="INTERNET RESTORED · CHECKING ACADEMY";
        $("[data-copy]").textContent="Your internet connection is back, but the Academy data service has not responded yet. Your page will remain protected while Spark retries.";
      }else{
        setState(weak?"weak":"online",weak?"Slow network response":"");
        if(recoveryVisible)completeRecovery();
      }
    }catch(_){lastCheckedAt=Date.now();lastLatencyMs=null;firestoreReachable=false;setState("offline");showRecovery();}
    finally{probeInFlight=false;refresh();}
  }
  function panelOpen(open){panel.hidden=!open;status.setAttribute("aria-expanded",String(open));if(open)panel.querySelector(".close").focus();else status.focus();}
  status.addEventListener("click",()=>panelOpen(panel.hidden));
  panel.querySelector(".close").addEventListener("click",()=>panelOpen(false));
  panel.querySelector(".check").addEventListener("click",checkConnection);
  recovery.querySelector(".retry").addEventListener("click",checkConnection);
  recovery.querySelector(".toggle").addEventListener("click",event=>{
    const button=event.currentTarget,details=$("#ssa-recovery-details"),open=details.hidden;
    details.hidden=!open;button.setAttribute("aria-expanded",String(open));button.lastElementChild.textContent=open?"－":"＋";
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!panel.hidden)panelOpen(false);if(event.key==="Escape"&&recoveryVisible)event.preventDefault();});
  window.addEventListener("offline",()=>{
    clearTimeout(offlineTimer);
    offlineTimer=setTimeout(()=>{clearTimeout(restoreTimer);lastCheckedAt=Date.now();setState("offline");if(recoveryVisible){recovery.dataset.phase="offline";$("[data-phase-label]").textContent="CONNECTION INTERRUPTED AGAIN";$("[data-copy]").textContent="The connection dropped during recovery. Your current page is still being kept open while Spark retries.";}showRecovery();},900);
  });
  window.addEventListener("online",()=>{clearTimeout(offlineTimer);setState("reconnecting");if(recoveryVisible)recovery.dataset.phase="reconnecting";checkConnection();});
  window.addEventListener("focus",checkConnection);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkConnection();});
  connection?.addEventListener?.("change",()=>{refresh();checkConnection();});
  setInterval(()=>{if(!document.hidden)checkConnection();},45000);
  window.SSASmartConnectivity=Object.freeze({
    getState:()=>state,isOnline:()=>state==="online"||state==="weak",check:checkConnection,
    getDiagnostics:()=>Object.freeze({state,browserOnline:navigator.onLine,networkType:connection?.effectiveType||null,lastCheckedAt:lastCheckedAt||null,lastLatencyMs,firestoreReachable})
  });
  refresh();checkConnection();
})();