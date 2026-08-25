const KEY="ssa:splash:v1";
function loadStyles(){if(document.getElementById("ssaSplashStyles"))return;const link=document.createElement("link");link.id="ssaSplashStyles";link.rel="stylesheet";link.href=new URL("../css/splash-screen.css", import.meta.url).href;document.head.appendChild(link)}
function showSplash(){
 loadStyles();
 if(sessionStorage.getItem(KEY)) return;
 sessionStorage.setItem(KEY,"1");
 if(document.getElementById("ssaSplash")) return;
 const splash=document.createElement("div");
 splash.id="ssaSplash";
 splash.innerHTML=`<div class="ssa-splash-glow"></div><div class="ssa-splash-card"><div class="ssa-splash-mark">S</div><div class="ssa-splash-title">SPARK STACK</div><div class="ssa-splash-subtitle">ACADEMY</div><div class="ssa-splash-line"><span></span></div><div class="ssa-splash-status">Preparing your workspace</div></div>`;
 document.body.appendChild(splash);
 requestAnimationFrame(()=>splash.classList.add("is-ready"));
 setTimeout(()=>{splash.classList.add("is-hidden");setTimeout(()=>splash.remove(),650)},1200);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",showSplash,{once:true}); else showSplash();
