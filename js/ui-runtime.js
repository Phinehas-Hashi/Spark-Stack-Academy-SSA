// ============================================================
// SPARK STACK ACADEMY — GLOBAL UI RUNTIME
// Toasts + accessible modals + choice prompts
// ============================================================

(() => {
  if (window.__SSA_UI_RUNTIME__) return;
  window.__SSA_UI_RUNTIME__ = true;

  const STYLE_ID = "ssa-global-ui-runtime";
  const escape = value => String(value ?? "");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #ssa-toast-root{position:fixed;top:18px;right:18px;z-index:2147483000;display:grid;gap:10px;width:min(390px,calc(100vw - 28px));pointer-events:none}
      .ssa-toast{pointer-events:auto;display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:14px 15px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(8,28,58,.97);color:#fff;box-shadow:0 20px 55px rgba(0,0,0,.25);backdrop-filter:blur(16px);font:500 14px/1.45 Inter,system-ui,sans-serif;animation:ssaToastIn .22s ease both}
      .ssa-toast.success{border-color:rgba(34,197,94,.38)}.ssa-toast.error{border-color:rgba(239,68,68,.45)}.ssa-toast.warning{border-color:rgba(245,158,11,.45)}.ssa-toast.info{border-color:rgba(41,121,255,.45)}
      .ssa-toast-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:rgba(255,255,255,.1);font-weight:800}.ssa-toast-close{border:0;background:transparent;color:rgba(255,255,255,.62);cursor:pointer;font-size:19px;padding:3px 5px}.ssa-toast-close:hover{color:#fff}
      .ssa-modal-backdrop{position:fixed;inset:0;z-index:2147482999;display:grid;place-items:center;padding:20px;background:rgba(2,8,23,.62);backdrop-filter:blur(8px);animation:ssaModalIn .16s ease both}
      .ssa-modal{width:min(480px,100%);background:#fff;color:#172033;border:1px solid #e5e7eb;border-radius:22px;box-shadow:0 30px 90px rgba(2,8,23,.3);overflow:hidden;font:500 14px/1.5 Inter,system-ui,sans-serif;animation:ssaModalCardIn .2s ease both}
      .ssa-modal-head{display:flex;align-items:flex-start;gap:13px;padding:22px 22px 8px}.ssa-modal-icon{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:13px;background:#eff6ff;color:#2563eb;font-size:19px}.ssa-modal.danger .ssa-modal-icon{background:#fef2f2;color:#dc2626}.ssa-modal.warning .ssa-modal-icon{background:#fffbeb;color:#d97706}
      .ssa-modal-title{margin:0;color:#0f172a;font-size:18px;font-weight:800}.ssa-modal-message{margin:3px 0 0;color:#64748b;white-space:pre-line}.ssa-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 22px 22px}.ssa-modal-btn{border:1px solid #d8dee8;border-radius:11px;padding:10px 15px;background:#fff;color:#475569;font:700 13px inherit;cursor:pointer}.ssa-modal-btn:hover{background:#f8fafc}.ssa-modal-btn.primary{border-color:#2563eb;background:#2563eb;color:#fff}.ssa-modal-btn.primary:hover{background:#1d4ed8}.ssa-modal.danger .ssa-modal-btn.primary{border-color:#dc2626;background:#dc2626}.ssa-modal.danger .ssa-modal-btn.primary:hover{background:#b91c1c}
      .ssa-modal-field{width:100%;margin-top:14px;padding:12px 13px;border:1px solid #d8dee8;border-radius:11px;background:#fff;color:#172033;font:500 14px inherit;outline:none}.ssa-modal-field:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
      .ssa-modal-select{width:100%;margin-top:14px;padding:12px 13px;border:1px solid #d8dee8;border-radius:11px;background:#fff;color:#172033;font:600 14px inherit;outline:none}
      .ssa-modal-btn:focus-visible,.ssa-toast-close:focus-visible{outline:3px solid rgba(37,99,235,.25);outline-offset:2px}
      @keyframes ssaToastIn{from{opacity:0;transform:translateY(-8px) translateX(8px)}to{opacity:1;transform:none}}@keyframes ssaModalIn{from{opacity:0}to{opacity:1}}@keyframes ssaModalCardIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
      @media(max-width:640px){#ssa-toast-root{top:12px;right:12px}.ssa-modal-backdrop{padding:14px;align-items:end}.ssa-modal{border-radius:20px}.ssa-modal-actions{display:grid;grid-template-columns:1fr 1fr}.ssa-modal-btn{width:100%;min-height:44px}}
      @media(prefers-reduced-motion:reduce){.ssa-toast,.ssa-modal-backdrop,.ssa-modal{animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  const toastIcons = { success:"✓", error:"!", warning:"⚠", info:"i" };
  function toast(message, type="info", duration=3800) {
    installStyles();
    let root = document.getElementById("ssa-toast-root");
    if(!root){root=document.createElement("div");root.id="ssa-toast-root";document.body.appendChild(root);}
    const item=document.createElement("div");item.className=`ssa-toast ${type}`;item.setAttribute("role",type==="error"?"alert":"status");
    const icon=document.createElement("div");icon.className="ssa-toast-icon";icon.textContent=toastIcons[type]||toastIcons.info;
    const text=document.createElement("div");text.textContent=escape(message||"Something happened.");
    const close=document.createElement("button");close.className="ssa-toast-close";close.type="button";close.setAttribute("aria-label","Close notification");close.textContent="×";
    const remove=()=>{item.style.opacity="0";item.style.transform="translateY(-5px)";item.style.transition="opacity .18s ease,transform .18s ease";setTimeout(()=>item.remove(),190)};
    close.onclick=remove;item.append(icon,text,close);root.appendChild(item);setTimeout(remove,duration);return item;
  }

  function dialog({title="Are you sure?",message="",confirmText="Continue",cancelText="Cancel",tone="warning",icon="⚠",field=null,choices=null}) {
    installStyles();
    return new Promise(resolve=>{
      const backdrop=document.createElement("div");backdrop.className="ssa-modal-backdrop";
      const dialog=document.createElement("div");dialog.className=`ssa-modal ${tone}`;dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
      const head=document.createElement("div");head.className="ssa-modal-head";
      const iconEl=document.createElement("div");iconEl.className="ssa-modal-icon";iconEl.textContent=icon;
      const copy=document.createElement("div");const titleEl=document.createElement("h2");titleEl.className="ssa-modal-title";titleEl.textContent=title;
      const msg=document.createElement("p");msg.className="ssa-modal-message";msg.textContent=message;copy.append(titleEl,msg);head.append(iconEl,copy);
      if(field){const input=document.createElement("input");input.className="ssa-modal-field";input.value=field.value||"";input.placeholder=field.placeholder||"";input.type=field.type||"text";copy.append(input);field._input=input;}
      if(choices){const select=document.createElement("select");select.className="ssa-modal-select";choices.forEach(choice=>{const option=document.createElement("option");option.value=choice.value;option.textContent=choice.label;select.appendChild(option)});copy.append(select);choices._select=select;}
      const actions=document.createElement("div");actions.className="ssa-modal-actions";
      const cancel=document.createElement("button");cancel.className="ssa-modal-btn";cancel.type="button";cancel.textContent=cancelText;
      const confirm=document.createElement("button");confirm.className="ssa-modal-btn primary";confirm.type="button";confirm.textContent=confirmText;actions.append(cancel,confirm);dialog.append(head,actions);backdrop.appendChild(dialog);document.body.appendChild(backdrop);document.body.style.overflow="hidden";
      const previous=document.activeElement;
      const finish=value=>{document.removeEventListener("keydown",onKey);backdrop.remove();document.body.style.overflow="";previous?.focus?.();resolve(value)};
      const onKey=e=>{if(e.key==="Escape")finish(null);if(e.key==="Enter"&&document.activeElement===confirm)confirm.click();};
      cancel.onclick=()=>finish(null);confirm.onclick=()=>finish(field?field._input.value:choices?choices._select.value:true);document.addEventListener("keydown",onKey);
      (field?field._input:choices?choices._select:confirm).focus();
    });
  }

  window.showToast=toast;window.ssaToast=toast;
  window.ssaConfirm=(message,options={})=>dialog({message,...options});
  window.ssaPrompt=(message,options={})=>dialog({message,field:{value:options.value||"",placeholder:options.placeholder||"",type:options.type||"text"},title:options.title||"Enter a value",confirmText:options.confirmText||"Save",tone:options.tone||"info",icon:options.icon||"✎"});
  window.ssaChoice=(message,choices,options={})=>dialog({message,choices,title:options.title||"Choose an option",confirmText:options.confirmText||"Apply",tone:options.tone||"info",icon:options.icon||"☷"});
  window.alert=message=>{toast(message,"info");};

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installStyles,{once:true});else installStyles();
})();