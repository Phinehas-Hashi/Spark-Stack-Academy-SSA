(() => {
  const roleSelect = document.getElementById("role");
  const choices = [...document.querySelectorAll("[data-role-choice]")];
  function chooseRole(role) {
    if (!roleSelect || !["student","instructor"].includes(role)) return;
    roleSelect.value = role;
    roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    choices.forEach(button => {
      const active = button.dataset.roleChoice === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  choices.forEach(button => button.addEventListener("click", () => chooseRole(button.dataset.roleChoice)));
  const requestedRole = new URLSearchParams(location.search).get("role");
  if (requestedRole) chooseRole(requestedRole);
  else if (roleSelect) chooseRole(roleSelect.value || "student");

  document.querySelectorAll('input[type="password"]').forEach(field => {
    field.addEventListener("keyup", event => {
      let warning = field.parentElement.querySelector(".caps-warning");
      if (event.getModifierState && event.getModifierState("CapsLock")) {
        if (!warning) {
          warning = document.createElement("small");
          warning.className = "caps-warning";
          warning.textContent = "Caps Lock is on";
          warning.style.cssText = "position:absolute;right:42px;top:100%;color:#b7791f;font-size:9px";
          field.parentElement.appendChild(warning);
        }
      } else warning?.remove();
    });
  });
})();