// ============================================================
// Icona del viaggio: una o più bandiere scelte da un elenco di
// paesi (cercabile), salvate come emoji-bandiera nel campo emoji.
// ============================================================
const COUNTRY_CODES = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");

const FLAG_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

function flagOf(code) {
  return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function codesFromFlags(str) {
  return (String(str || "").match(FLAG_REGEX) || []).map(f =>
    [...f].map(c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 65)).join(""));
}

// HTML dell'icona di un viaggio: ogni bandiera a piena dimensione;
// le vecchie icone emoji (non bandiere) restano visibili così come sono
function renderTripIcon(value) {
  const flags = String(value || "").match(FLAG_REGEX);
  const items = flags && flags.length ? flags : [value || "🧳"];
  return items.map(f => `<span class="trip-flag">${escapeHtml(f)}</span>`).join("");
}

const FlagPicker = {
  countries: [],
  selected: [],
  resolve: null,

  init() {
    let names = null;
    try { names = new Intl.DisplayNames(["it"], { type: "region" }); } catch (err) { /* browser datato: si usa il codice */ }
    this.countries = COUNTRY_CODES
      .map(code => ({ code, flag: flagOf(code), name: (names && names.of(code)) || code }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    document.getElementById("flag-picker-search").addEventListener("input", () => this.renderList());
    document.getElementById("flag-picker-confirm").addEventListener("click", () => this.finish(this.selected.map(flagOf).join("")));
    document.getElementById("flag-picker-close").addEventListener("click", () => this.finish(null));
    document.getElementById("flag-picker-clear").addEventListener("click", () => { this.selected = []; this.render(); });
    document.getElementById("flag-picker-overlay").addEventListener("click", (e) => {
      if (e.target.id === "flag-picker-overlay") this.finish(null);
    });
  },

  // Restituisce la stringa di bandiere scelte ("" se svuotata) oppure null se annulla
  open(current) {
    this.selected = codesFromFlags(current);
    document.getElementById("flag-picker-search").value = "";
    document.getElementById("flag-picker-overlay").classList.remove("hidden");
    this.render();
    return new Promise(resolve => { this.resolve = resolve; });
  },

  finish(result) {
    document.getElementById("flag-picker-overlay").classList.add("hidden");
    if (this.resolve) this.resolve(result);
    this.resolve = null;
  },

  toggle(code) {
    const idx = this.selected.indexOf(code);
    if (idx === -1) this.selected.push(code); else this.selected.splice(idx, 1);
    this.render();
  },

  normalize(str) {
    return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  },

  render() {
    const chosen = document.getElementById("flag-picker-selected");
    chosen.innerHTML = this.selected.length
      ? this.selected.map(code => `<button type="button" class="flag-chosen" data-code="${code}" title="Rimuovi">${flagOf(code)}</button>`).join("")
      : `<span class="card-sub">Tocca un paese per aggiungerne la bandiera</span>`;
    chosen.querySelectorAll(".flag-chosen").forEach(btn => btn.addEventListener("click", () => this.toggle(btn.dataset.code)));
    this.renderList();
  },

  renderList() {
    const query = this.normalize(document.getElementById("flag-picker-search").value.trim());
    const list = document.getElementById("flag-picker-list");
    list.innerHTML = "";
    for (const c of this.countries) {
      if (query && !this.normalize(c.name).includes(query)) continue;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "flag-row" + (this.selected.includes(c.code) ? " on" : "");
      row.innerHTML = `<span class="flag-row-flag">${c.flag}</span><span class="flag-row-name">${escapeHtml(c.name)}</span><span class="flag-row-check">${this.selected.includes(c.code) ? "✓" : ""}</span>`;
      row.addEventListener("click", () => this.toggle(c.code));
      list.appendChild(row);
    }
  }
};
