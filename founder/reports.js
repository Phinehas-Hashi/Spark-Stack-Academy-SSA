import{auth,db}from"../js/firebase.js";
import{onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{collection,query,onSnapshot}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import"../js/ssa-ui.js";

const root=document.getElementById("reports");

const esc=v=>String(v??"")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;");

onAuthStateChanged(auth,async user=>{
    if(!user){
        location.href="../login.html";
        return;
    }

    if(!root)return;

    const q=query(collection(db,"reports"));

    onSnapshot(q,s=>{
        const items=s.docs
            .map(d=>({id:d.id,...d.data()}))
            .sort((a,b)=>
                (b.createdAt?.seconds||0)-
                (a.createdAt?.seconds||0)
            );

        root.innerHTML=items.length
            ?items.map(r=>`
                <article class="report ${r.priority==="critical"?"critical":"system"}">
                    <strong>${esc(r.reportId||r.id)}</strong>
                    <span>
                        ${esc(r.priority||"normal")}
                        · ${esc(r.category||"general")}
                        · ${esc(r.status||"pending")}
                    </span>
                    <p>${esc(r.title||"Report")}</p>
                    <p>${esc(r.description||"")}</p>
                    <small>
                        ${esc(r.reporterName||r.reporterEmail||r.reporterRole||"Unknown reporter")}
                    </small>
                </article>
            `).join("")
            :"<p>No reports found.</p>";
    },error=>{
        console.error("Founder reports error:",error);
        root.innerHTML="<p>Unable to load reports.</p>";
    });
});
