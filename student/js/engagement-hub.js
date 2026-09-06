import { auth } from "../../js/firebase.js";

const STYLE_ID = "ssa-engagement-hub-style";

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .ssa-engagement-hub{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:18px;margin:0 0 24px}
        .ssa-next-card,.ssa-mission-card{border:1px solid rgba(8,28,58,.09);border-radius:22px;background:linear-gradient(135deg,#fff,#f7faff);padding:22px;box-shadow:0 12px 32px rgba(8,28,58,.06)}
        .ssa-hub-label{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2979ff}
        .ssa-next-card h2,.ssa-mission-card h3{margin:8px 0 6px;color:#081c3a}
        .ssa-next-card p,.ssa-mission-card p{margin:0;color:#667085;line-height:1.55}
        .ssa-next-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:17px}
        .ssa-hub-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 15px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px;border:1px solid rgba(8,28,58,.1);color:#081c3a;background:#fff}
        .ssa-hub-btn.primary{background:#2979ff;color:#fff;border-color:#2979ff}
        .ssa-mission-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ssa-mission-badge{font-size:11px;font-weight:800;padding:6px 9px;border-radius:999px;background:rgba(255,193,7,.16);color:#8a6500}
        .ssa-xp-track{height:7px;border-radius:99px;background:#e8edf5;overflow:hidden;margin:13px 0 7px}
        .ssa-xp-track span{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#2979ff,#ffc107);transition:width .4s ease}
        .ssa-mission-meta{display:flex;justify-content:space-between;font-size:11px;color:#667085}
        @media(max-width:820px){.ssa-engagement-hub{grid-template-columns:1fr}.ssa-next-card,.ssa-mission-card{padding:18px}}
    `;
    document.head.appendChild(style);
}

function esc(value){return String(value ?? "").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}

function render(student) {
    const content = document.querySelector(".dashboard-content");
    if (!content || document.getElementById("ssaEngagementHub")) return;
    const learning = student.learning || {};
    const progress = Math.max(0,Math.min(100,Number(learning.progress)||0));
    const xp = Math.max(0,Number(learning.xp)||0);
    const level = Math.max(1,Number(learning.level)||1);
    const levelBase=(level-1)*250;
    const levelProgress=Math.max(0,Math.min(100,((xp-levelBase)/250)*100));
    const courses=Array.isArray(learning.enrollments)?learning.enrollments.length:Number(learning.coursesCount)||0;
    let action = courses ? "Continue your most recent course and complete the next lesson." : "Explore the course catalog and choose your first learning path.";
    let href = courses ? "courses.html" : "courses.html";
    if (progress >= 80) { action="You're close to a milestone — finish a lesson and push your course toward completion."; }
    else if (learning.streak === 0) { action="Start a learning session today to build your streak and keep your momentum alive."; }
    const mission = progress >= 100 ? "Review your achievements and showcase your completed work." : "Complete one lesson today";
    const missionHref = progress >= 100 ? "achievements.html" : (courses ? "course-player.html" : "courses.html");
    const hub=document.createElement("section");
    hub.id="ssaEngagementHub"; hub.className="ssa-engagement-hub";
    hub.innerHTML=`<article class="ssa-next-card"><span class="ssa-hub-label">✦ YOUR NEXT MOVE</span><h2>${esc(action)}</h2><p>Your dashboard adapts to your progress so you always have a clear next step.</p><div class="ssa-next-actions"><a class="ssa-hub-btn primary" href="${href}">Continue Learning <span>→</span></a><a class="ssa-hub-btn" href="spark-ai.html">Ask Spark AI</a><a class="ssa-hub-btn" href="achievements.html">View Rewards</a></div></article><article class="ssa-mission-card"><div class="ssa-mission-top"><span class="ssa-hub-label">DAILY MISSION</span><span class="ssa-mission-badge">+25 XP</span></div><h3>${esc(mission)}</h3><p>Small consistent wins compound into real technical progress.</p><div class="ssa-xp-track"><span style="width:${levelProgress}%"></span></div><div class="ssa-mission-meta"><span>Level ${level}</span><span>${xp%250}/250 XP</span></div><div class="ssa-next-actions"><a class="ssa-hub-btn primary" href="${missionHref}">Start Mission</a></div></article>`;
    content.prepend(hub);
    window.lucide?.createIcons();
}

function start(){
    injectStyles();
    const wait=()=>{if(window.ssaCurrentStudent) render(window.ssaCurrentStudent);else setTimeout(wait,150);};
    wait();
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
