import { app, auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $ = id => document.getElementById(id);
const money = value => `KSh ${Number(value || 0).toLocaleString("en-KE",{maximumFractionDigits:2})}`;
const dateText = value => value ? new Date(Number(value)).toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"numeric"}) : "—";
const functions = getFunctions(app);
const financeCall = httpsCallable(functions,"getInstructorFinanceData");
const withdrawalCall = httpsCallable(functions,"requestInstructorWithdrawal");
let data = null;
let busy = false;

function setMoney(id,value){ if($(id)) $(id).textContent=money(value); }
function setText(id,value){ if($(id)) $(id).textContent=String(value); }
function notify(message){ window.alert(message); }
function statusLabel(status){ return String(status||"pending").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()); }
function statusClass(status){ return String(status||"pending").toLowerCase().replace(/[^a-z0-9-]/g,"-"); }

function renderEarnings(){
  const wallet=data.wallet||{};
  const earnings=data.earnings||[];
  const payments=data.payments||[];
  setMoney("availableBalance",wallet.available);
  setMoney("pendingBalance",wallet.reserved);
  setMoney("monthlyEarnings",earnings.filter(item=>item.createdAt && new Date(item.createdAt).getMonth()===new Date().getMonth() && new Date(item.createdAt).getFullYear()===new Date().getFullYear()).reduce((sum,item)=>sum+Number(item.netAmount||0),0));
  setMoney("lifetimeEarnings",wallet.lifetime);
  setText("totalSales",payments.filter(p=>["paid","success","successful","completed"].includes(p.status)).length);
  setMoney("courseRevenue",earnings.filter(e=>/course/i.test(e.description)).reduce((s,e)=>s+Number(e.netAmount||0),0));
  setMoney("premiumRevenue",earnings.filter(e=>/premium|subscription/i.test(e.description)).reduce((s,e)=>s+Number(e.netAmount||0),0));
  setMoney("bonusRevenue",earnings.filter(e=>/bonus/i.test(e.description)).reduce((s,e)=>s+Number(e.netAmount||0),0));
  setMoney("revenueTotal",wallet.lifetime);
  setMoney("minimumWithdrawal",data.settings.minimumWithdrawal);
  setText("withdrawalFee",`${Number(data.settings.withdrawalFeePercent||0)}%`);
  setText("platformTax",`${Number(data.settings.platformTaxPercent||0)}% (ledger setting)`);
  setText("premiumPrice", "See Instructor Pro");
  const canWithdraw=Number(wallet.available)>=Number(data.settings.minimumWithdrawal||100);
  setText("withdrawalStatus",canWithdraw?"Withdrawal available":"Building your withdrawable balance");
  setText("withdrawalMessage",canWithdraw?"Your available ledger balance meets the minimum withdrawal threshold.":"Withdrawals unlock when verified instructor earnings reach the minimum. Pending requests are reserved.");
  $("withdrawBtn") && ($("withdrawBtn").disabled=!canWithdraw);
  $("heroWithdrawBtn") && ($("heroWithdrawBtn").disabled=!canWithdraw);
  renderEarningRows(earnings);
  renderWithdrawalRows(data.withdrawals||[]);
  updatePreview();
}
function renderEarningRows(items){
 const host=$("transactionList"); if(!host)return;
 if(!items.length){host.innerHTML='<div class="earnings-empty"><span>No instructor earning ledger entries have been posted yet.</span></div>';return;}
 host.innerHTML=items.slice(0,30).map(item=>`<div class="transaction-item"><div class="transaction-info"><div><strong>${escapeHtml(item.description)}</strong><span>${dateText(item.createdAt)} · ${escapeHtml(statusLabel(item.status))}</span></div></div><strong class="transaction-amount">+${money(item.netAmount)}</strong></div>`).join("");
}
function renderWithdrawalRows(items){
 const host=$("withdrawalHistory"); if(!host)return;
 if(!items.length){host.innerHTML='<div class="earnings-empty"><span>No withdrawal requests yet.</span></div>';return;}
 host.innerHTML=items.slice(0,15).map(item=>`<div class="transaction-item"><div class="transaction-info"><div><strong>${escapeHtml(item.method.toUpperCase())} payout · ${money(item.amount)}</strong><span>${dateText(item.createdAt)} · ${escapeHtml(statusLabel(item.status))}</span></div></div><strong class="transaction-amount">${escapeHtml(statusLabel(item.status))}</strong></div>`).join("");
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function feeFor(amount){return Math.round(amount*Number(data?.settings?.withdrawalFeePercent||0))/100;}
function updatePreview(){
 const amount=Math.max(0,Number($("withdrawalAmount")?.value||0));
 setMoney("modalAvailableBalance",data?.wallet?.available||0);
 setMoney("summaryGross",amount);
 setMoney("summaryTax",0);
 setMoney("summaryFee",feeFor(amount));
 setMoney("summaryNet",Math.max(0,amount-feeFor(amount)));
}
function openModal(){
 if(!data || data.wallet.available < data.settings.minimumWithdrawal)return;
 $("withdrawalModal")?.classList.remove("hidden");
 $("withdrawalModal")?.classList.add("active");
 document.body.style.overflow="hidden";
 updatePreview();
}
function closeModal(){
 $("withdrawalModal")?.classList.add("hidden");
 $("withdrawalModal")?.classList.remove("active");
 document.body.style.overflow="";
}
async function submitWithdrawal(){
 if(busy || !data)return;
 const amount=Number($("withdrawalAmount")?.value||0);
 const method=$("withdrawalMethod")?.value||"";
 const account=$("withdrawalAccount")?.value.trim()||"";
 if(!Number.isSafeInteger(amount)||amount<data.settings.minimumWithdrawal){notify(`Minimum withdrawal is ${money(data.settings.minimumWithdrawal)}. Enter a whole KSh amount.`);return;}
 if(amount>data.wallet.available){notify("The amount exceeds your available balance.");return;}
 if(account.length<5){notify("Enter valid M-Pesa or bank payout details.");return;}
 const button=$("confirmWithdrawalBtn");
 try{
  busy=true;if(button){button.disabled=true;button.textContent="Submitting request…";}
  await withdrawalCall({amount,method,account});
  notify("Withdrawal request submitted. It is pending staff review; no payout has been sent yet.");
  closeModal();$("withdrawalAmount").value="";$("withdrawalAccount").value="";
  await loadFinance();
 }catch(error){console.error("Withdrawal request failed:",error);notify(error?.message||"Unable to submit the withdrawal request.");}
 finally{busy=false;if(button){button.disabled=false;button.innerHTML='<i data-lucide="shield-check"></i> Confirm Withdrawal';window.lucide?.createIcons?.();}}
}
async function loadFinance(){
 const result=await financeCall();
 data=result.data;
 renderEarnings();
}
function setup(){
 $("withdrawBtn")?.addEventListener("click",openModal);
 $("heroWithdrawBtn")?.addEventListener("click",openModal);
 $("closeWithdrawalModal")?.addEventListener("click",closeModal);
 $("withdrawalModal")?.addEventListener("click",event=>{if(event.target.id==="withdrawalModal"||event.target.classList.contains("modal-backdrop"))closeModal();});
 $("withdrawalAmount")?.addEventListener("input",updatePreview);
 $("confirmWithdrawalBtn")?.addEventListener("click",submitWithdrawal);
 $("premiumInstructorBtn")?.addEventListener("click",()=>{window.location.href="pro.html";});
 document.addEventListener("keydown",event=>{if(event.key==="Escape")closeModal();});
}
setup();
onAuthStateChanged(auth,async user=>{
 if(!user){setText("balanceStatus","Sign in to view your wallet.");return;}
 try{await loadFinance();}catch(error){console.error("Instructor finance load failed:",error);setText("balanceStatus","Wallet data could not be loaded. Please refresh.");const host=$("transactionList");if(host)host.innerHTML='<div class="earnings-empty">Unable to load verified wallet records.</div>';}
});
