import { db } from "../js/firebase.js";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ref = doc(db, "settings", "monetization");
const $ = id => document.getElementById(id);
const num = (id, fallback = 0) => Math.max(0, Number($(id)?.value ?? fallback) || 0);
const money = (value, currency = "KES") => `${currency} ${Number(value || 0).toLocaleString()}`;

const defaults = {
  courseFee:5000, registrationFee:1000, examinationFee:500, certificateFee:1000,
  premiumMonthly:500, premiumQuarterly:1350, premiumYearly:4500,
  enablePremium:true, premiumCertificates:true, enableMpesa:true, enableCards:false,
  enablePaypal:false, enableBank:false, instructorCommission:70, platformCommission:30,
  enableInstructorEarnings:true, automaticPayouts:false, maxDiscount:50, couponExpiry:30,
  allowCoupons:true, allowScholarships:true, minimumWithdrawal:1000, withdrawalFeePercent:2,
  withdrawalTime:"24 Hours", enableWithdrawals:true, withdrawalApproval:true,
  enableRevenueDashboard:true, trackStudentPurchases:true, trackInstructorRevenue:true,
  monthlyRevenueReports:true, vatRate:16, billingCycle:"Monthly", invoicePrefix:"SSA-INV",
  currency:"KES", currencySymbol:"KSh", decimalPlaces:2, enablePayments:true,
  allowRefunds:false, refundDays:7
};

function setValue(id,value){ if($(id)) $(id).value=value ?? ""; }
function setChecked(id,value){ if($(id)) $(id).checked=Boolean(value); }

function populate(data){
  const d={...defaults,...data};
  const values={
    defaultCourseFee:d.courseFee, registrationFee:d.registrationFee, examFee:d.examinationFee,
    certificateFee:d.certificateFee, premiumMonthly:d.premiumMonthly, premiumQuarterly:d.premiumQuarterly,
    premiumYearly:d.premiumYearly, instructorShare:d.instructorCommission, platformCommission:d.platformCommission,
    maxDiscount:d.maxDiscount, couponExpiry:d.couponExpiry, minimumWithdrawal:d.minimumWithdrawal,
    withdrawalFee:d.withdrawalFeePercent, withdrawalTime:d.withdrawalTime, vatRate:d.vatRate,
    billingCycle:d.billingCycle, invoicePrefix:d.invoicePrefix, defaultCurrency:d.currency,
    currencySymbol:d.currencySymbol, decimalPlaces:d.decimalPlaces
  };
  Object.entries(values).forEach(([id,value])=>setValue(id,value));
  const checks={
    enablePremium:d.enablePremium,premiumCertificates:d.premiumCertificates,enableMpesa:d.enableMpesa,
    enableCards:d.enableCards,enablePaypal:d.enablePaypal,enableBank:d.enableBank,
    enableInstructorEarnings:d.enableInstructorEarnings,automaticPayouts:d.automaticPayouts,
    enableCoupons:d.allowCoupons,scholarships:d.allowScholarships,enableWithdrawals:d.enableWithdrawals,
    withdrawalApproval:d.withdrawalApproval,enableRevenueDashboard:d.enableRevenueDashboard,
    trackStudentPurchases:d.trackStudentPurchases,trackInstructorRevenue:d.trackInstructorRevenue,
    monthlyRevenueReports:d.monthlyRevenueReports
  };
  Object.entries(checks).forEach(([id,value])=>setChecked(id,value));
}

function validate(){
  const errors=[];
  const instructor=num("instructorShare"), platform=num("platformCommission");
  if(instructor>100||platform>100) errors.push("Commission percentages cannot exceed 100%.");
  if(Math.round((instructor+platform)*100)/100!==100) errors.push("Instructor share + platform commission must equal 100%.");
  if(num("withdrawalFee")>100) errors.push("Withdrawal fee cannot exceed 100%.");
  if(num("maxDiscount")>100) errors.push("Maximum discount cannot exceed 100%.");
  if(num("vatRate")>100) errors.push("VAT cannot exceed 100%.");
  if(num("decimalPlaces")>6) errors.push("Decimal places must be 0–6.");
  return errors;
}

function collect(){
  return {
    courseFee:num("defaultCourseFee"),registrationFee:num("registrationFee"),examinationFee:num("examFee"),certificateFee:num("certificateFee"),
    premiumMonthly:num("premiumMonthly"),premiumQuarterly:num("premiumQuarterly"),premiumYearly:num("premiumYearly"),
    enablePremium:$("enablePremium")?.checked??false,premiumCertificates:$("premiumCertificates")?.checked??false,
    enableMpesa:$("enableMpesa")?.checked??false,enableCards:$("enableCards")?.checked??false,enablePaypal:$("enablePaypal")?.checked??false,enableBank:$("enableBank")?.checked??false,
    instructorCommission:num("instructorShare"),platformCommission:num("platformCommission"),enableInstructorEarnings:$("enableInstructorEarnings")?.checked??false,automaticPayouts:$("automaticPayouts")?.checked??false,
    maxDiscount:num("maxDiscount"),couponExpiry:num("couponExpiry"),allowCoupons:$("enableCoupons")?.checked??false,allowScholarships:$("scholarships")?.checked??false,
    minimumWithdrawal:num("minimumWithdrawal"),withdrawalFeePercent:num("withdrawalFee"),withdrawalTime:$("withdrawalTime")?.value||"24 Hours",enableWithdrawals:$("enableWithdrawals")?.checked??false,withdrawalApproval:$("withdrawalApproval")?.checked??false,
    enableRevenueDashboard:$("enableRevenueDashboard")?.checked??false,trackStudentPurchases:$("trackStudentPurchases")?.checked??false,trackInstructorRevenue:$("trackInstructorRevenue")?.checked??false,monthlyRevenueReports:$("monthlyRevenueReports")?.checked??false,
    vatRate:num("vatRate"),billingCycle:$("billingCycle")?.value||"Monthly",invoicePrefix:String($("invoicePrefix")?.value||"SSA-INV").trim().slice(0,30),currency:$("defaultCurrency")?.value||"KES",currencySymbol:String($("currencySymbol")?.value||"KSh").trim().slice(0,10),decimalPlaces:Math.min(6,Math.floor(num("decimalPlaces",2))),
    enablePayments:($("enableMpesa")?.checked||$("enableCards")?.checked||$("enablePaypal")?.checked||$("enableBank")?.checked),allowRefunds:false,refundDays:7,updatedAt:serverTimestamp()
  };
}

function setStatus(message,type){
  let el=$("monetizationStatus");
  if(!el){el=document.createElement("div");el.id="monetizationStatus";el.setAttribute("role","status");$("sidebarContainer")?.parentElement?.querySelector(".page-header")?.appendChild(el);}
  el.textContent=message;el.className=`settings-status ${type}`;
}

async function load(){
  try{const snap=await getDoc(ref);if(!snap.exists()){await setDoc(ref,{...defaults,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});populate(defaults);}else populate(snap.data());setStatus("Live settings loaded from Firestore.","success");}
  catch(error){console.error(error);setStatus("Could not load monetization settings.","error");}
}

async function save(){
  const errors=validate();if(errors.length){setStatus(errors.join(" "),"error");return;}
  const button=$("saveMonetization");if(button){button.disabled=true;button.textContent="Saving…";}
  try{const data=collect();await setDoc(ref,data,{merge:true});await setDoc(doc(db,"platformSettings","earnings"),{minimumWithdrawal:data.minimumWithdrawal,withdrawalFeePercent:data.withdrawalFeePercent,withdrawalsEnabled:data.enableWithdrawals,withdrawalApproval:data.withdrawalApproval,withdrawalProcessingTime:data.withdrawalTime,updatedAt:serverTimestamp()},{merge:true});setStatus("Monetization settings saved successfully.","success");}
  catch(error){console.error(error);setStatus("Save failed. Check Firebase permissions and try again.","error");}
  finally{if(button){button.disabled=false;button.textContent="💾 Save Changes";}}
}

function exportSettings(){
  const data=collect();delete data.updatedAt;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`SSA-monetization-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
}
function restoreDefaults(){if(confirm("Restore recommended defaults? Changes are not saved until you click Save."))populate(defaults);}
function resetMonetization(){if(confirm("Reset monetization settings to defaults and save them?")){populate(defaults);save();}}
function disablePayments(){if(confirm("Disable all payment gateways and save this change?")){["enableMpesa","enableCards","enablePaypal","enableBank"].forEach(id=>setChecked(id,false));save();}}

$("saveMonetization")?.addEventListener("click",save);$("exportMonetization")?.addEventListener("click",exportSettings);$("exportRevenue")?.addEventListener("click",exportSettings);$("restoreDefaults")?.addEventListener("click",restoreDefaults);$("resetMonetization")?.addEventListener("click",resetMonetization);$("disablePayments")?.addEventListener("click",disablePayments);
$("clearTransactions")?.addEventListener("click",()=>setStatus("Transaction deletion is intentionally disabled here. Use Revenue for reporting and reconciliation.","error"));

onSnapshot(query(collection(db,"payments"),orderBy("createdAt","desc")),snap=>{
  const payments=snap.docs.map(d=>d.data()),completed=payments.filter(p=>["success","completed"].includes(String(p.status||"").toLowerCase()));
  const now=new Date(),today=now.toISOString().slice(0,10),month=today.slice(0,7),amount=p=>Number(p.amount||0),date=p=>{try{return p.createdAt?.toDate?.()||new Date(p.createdAt);}catch{return null;}};
  const total=completed.reduce((s,p)=>s+amount(p),0),monthly=completed.filter(p=>date(p)?.toISOString().slice(0,7)===month).reduce((s,p)=>s+amount(p),0),daily=completed.filter(p=>date(p)?.toISOString().slice(0,10)===today).reduce((s,p)=>s+amount(p),0),currency=$("defaultCurrency")?.value||"KES";
  if($("totalRevenue"))$("totalRevenue").textContent=money(total,currency);if($("monthlyRevenue"))$("monthlyRevenue").textContent=money(monthly,currency);if($("todayRevenue"))$("todayRevenue").textContent=money(daily,currency);
},error=>{console.error("Revenue stream failed",error);["totalRevenue","monthlyRevenue","todayRevenue"].forEach(id=>$(id)&&($(id).textContent="—"));});

load();
