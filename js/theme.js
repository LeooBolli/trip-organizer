// ============================================================
// Gestione tema chiaro / scuro
// ============================================================
const Theme = {
  STORAGE_KEY: "trip-organizer-theme",

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    this.apply(theme);

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.checked = theme === "dark";
      toggle.addEventListener("change", () => {
        this.apply(toggle.checked ? "dark" : "light");
      });
    }
  },

  apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  }
};

Theme.init();
