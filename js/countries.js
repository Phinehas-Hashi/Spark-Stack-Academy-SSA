// Country codes used by signup, institution onboarding and profile completion.
export const SSA_COUNTRIES = [["KE","Kenya"],["UG","Uganda"],["TZ","Tanzania"],["RW","Rwanda"],["BI","Burundi"],["ET","Ethiopia"],["SO","Somalia"],["SS","South Sudan"],["SD","Sudan"],["ZA","South Africa"],["NG","Nigeria"],["GH","Ghana"],["EG","Egypt"],["MA","Morocco"],["DZ","Algeria"],["SN","Senegal"],["CI","Côte d’Ivoire"],["CM","Cameroon"],["ZM","Zambia"],["ZW","Zimbabwe"],["MW","Malawi"],["MZ","Mozambique"],["BW","Botswana"],["NA","Namibia"],["US","United States"],["CA","Canada"],["GB","United Kingdom"],["IE","Ireland"],["FR","France"],["DE","Germany"],["ES","Spain"],["IT","Italy"],["NL","Netherlands"],["BE","Belgium"],["CH","Switzerland"],["SE","Sweden"],["NO","Norway"],["DK","Denmark"],["FI","Finland"],["PL","Poland"],["PT","Portugal"],["GR","Greece"],["TR","Türkiye"],["AE","United Arab Emirates"],["SA","Saudi Arabia"],["QA","Qatar"],["IN","India"],["PK","Pakistan"],["BD","Bangladesh"],["CN","China"],["JP","Japan"],["KR","South Korea"],["SG","Singapore"],["MY","Malaysia"],["ID","Indonesia"],["PH","Philippines"],["TH","Thailand"],["VN","Vietnam"],["AU","Australia"],["NZ","New Zealand"],["BR","Brazil"],["MX","Mexico"],["AR","Argentina"],["CL","Chile"],["CO","Colombia"],["RU","Russia"],["UA","Ukraine"],["IL","Israel"],["JO","Jordan"],["LB","Lebanon"],["OM","Oman"],["KW","Kuwait"],["BH","Bahrain"]];
export function populateCountrySelect(select, selectedCode = "") {
  if (!select) return;
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Select your country";
  select.replaceChildren(placeholder);
  SSA_COUNTRIES.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code; option.textContent = name;
    select.append(option);
  });
  select.value = selectedCode;
}
