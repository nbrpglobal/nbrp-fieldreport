/* Field Report – main app (flat modular) */
(function () {
  "use strict";

  var SUPABASE_URL = "https://qvymejkjowrkrhrotadr.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_zS66D3dO-j5C3cwDITHZHw_BUaeqc1t";
  var SUPPORT = "support@nbrpglobal.com";
  /* Core admin: email is source of truth (survives Supabase UUID rebuild) */
  var ADMIN_EMAIL = "nbrp.global@gmail.com";
  var ADMIN_UUID = "c5f54b67-8568-444f-8482-8dab7a7ae428";
  var ADMIN_EMAILS = ["nbrp.global@gmail.com", "admin@nbrp.com"];

  /* Filled at runtime from public.app_config — do not hardcode Live links here */
  var STRIPE_PAYMENT_LINKS = {
    standard_monthly: "",
    standard_yearly: "",
    pro_monthly: "",
    pro_yearly: ""
  };
  var PHONE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

  var COUNTRY_CODES = [
    { code: "+1", label: "🇺🇸 USA (+1)" },
    { code: "+1", label: "🇨🇦 Canada (+1)" },
    { code: "+44", label: "🇬🇧 United Kingdom (+44)" },
    { code: "+49", label: "🇩🇪 Germany (+49)" },
    { code: "+41", label: "🇨🇭 Switzerland (+41)" },
    { code: "+33", label: "🇫🇷 France (+33)" },
    { code: "+31", label: "🇳🇱 Netherlands (+31)" },
    { code: "+353", label: "🇮🇪 Ireland (+353)" },
    { code: "+46", label: "🇸🇪 Sweden (+46)" },
    { code: "+47", label: "🇳🇴 Norway (+47)" },
    { code: "+61", label: "🇦🇺 Australia (+61)" },
    { code: "+64", label: "🇳🇿 New Zealand (+64)" },
    { code: "+60", label: "🇲🇾 Malaysia (+60)" },
    { code: "+65", label: "🇸🇬 Singapore (+65)" },
    { code: "+886", label: "🇹🇼 Taiwan (+886)" },
    { code: "+852", label: "🇭🇰 Hong Kong (+852)" },
    { code: "+853", label: "🇲🇴 Macao (+853)" },
    { code: "+81", label: "🇯🇵 Japan (+81)" },
    { code: "+82", label: "🇰🇷 South Korea (+82)" },
    { code: "+86", label: "🇨🇳 Mainland China (+86)" },
    { code: "+971", label: "🇦🇪 UAE (+971)" },
    { code: "+966", label: "🇸🇦 Saudi Arabia (+966)" },
    { code: "+974", label: "🇶🇦 Qatar (+974)" },
    { code: "+965", label: "🇰🇼 Kuwait (+965)" },
    { code: "+34", label: "🇪🇸 Spain (+34)" },
    { code: "+66", label: "🇹🇭 Thailand (+66)" },
    { code: "+52", label: "🇲🇽 Mexico (+52)" },
    { code: "+54", label: "🇦🇷 Argentina (+54)" },
    { code: "+57", label: "🇨🇴 Colombia (+57)" }
  ];

  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var T = window.T || {};

  var langSelect = document.getElementById("languageSelect");
  var photoList = document.getElementById("photoList");
  var photoCount = 0;
  var currentUser = null;
  var selectedPlan = null;
  var isYearly = false;
  var draggedItem = null;

  document.getElementById("copyrightYear").textContent = new Date().getFullYear();

  function isAdmin() {
    if (!currentUser) return false;
    var email = (currentUser.email || "").toLowerCase().trim();
    /* Email fallback first — survives account delete/recreate (new UUID) */
    if (email && ADMIN_EMAILS.indexOf(email) !== -1) return true;
    if (email === ADMIN_EMAIL.toLowerCase()) return true;
    /* UUID match when available */
    if (currentUser.id && currentUser.id === ADMIN_UUID) return true;
    return false;
  }

  /* Load Stripe Payment Links from Supabase app_config (data-driven) */
  async function loadPaymentLinks() {
    try {
      var res = await supabase.from("app_config").select("key,value");
      if (res.error || !res.data) return;
      var map = {
        plan_standard_monthly: "standard_monthly",
        plan_standard_yearly: "standard_yearly",
        plan_pro_monthly: "pro_monthly",
        plan_pro_yearly: "pro_yearly"
      };
      res.data.forEach(function (row) {
        var k = map[row.key];
        if (k && row.value) STRIPE_PAYMENT_LINKS[k] = row.value;
      });
    } catch (e) {
      console.warn("loadPaymentLinks", e);
    }
  }

  function isAuthenticated() {
    return !!(currentUser && currentUser.id) || isAdmin();
  }

  function requireAuth(actionName) {
    if (isAuthenticated()) return true;
    alert("Please login or register to " + (actionName || "continue") + ".");
    showAuthLoginView();
    document.getElementById("authModal").classList.add("active");
    document.getElementById("authError").textContent = "";
    return false;
  }

  var DEFAULT_DISCLAIMER = "Notice: This inspection report is generated for site record verification under operating guidelines. All field observations represent physical conditions at time of inspection.";

  function generateReportNumber() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var key = "fr_seq_" + y + m + day;
    var seq = 1;
    try {
      seq = parseInt(localStorage.getItem(key) || "0", 10) + 1;
      localStorage.setItem(key, String(seq));
    } catch (e) {
      seq = 1;
    }
    var seqStr = String(seq).padStart(3, "0");
    return "FR-" + y + m + day + "-" + seqStr;
  }

  function isProUser() {
    if (isAdmin()) return true;
    try {
      return localStorage.getItem("fieldReport_isPro") === "1";
    } catch (e) {
      return false;
    }
  }

  function unlockProFeatures() {
    try { localStorage.setItem("fieldReport_isPro", "1"); } catch (e) {}
    document.getElementById("proLogo").disabled = false;
    var logoBtn = document.getElementById("proLogoBtn");
    if (logoBtn) logoBtn.disabled = false;

    /* 1. Report Number: FR-YYYYMMDD-001 — never NBRP */
    var rn = document.getElementById("reportNumber");
    rn.disabled = false;
    rn.placeholder = "";
    if (!rn.value || !/^FR-\d{8}-\d{3}$/.test(rn.value.trim())) {
      rn.value = generateReportNumber();
    }

    /* 2. Legal Disclaimer: load user's saved custom template (editable & persistent) */
    var di = document.getElementById("disclaimer");
    di.disabled = false;
    di.placeholder = "Enter your custom legal disclaimer template";
    try {
      var savedTpl = localStorage.getItem("fieldReport_disclaimerTemplate");
      if (savedTpl && savedTpl.trim()) {
        if (!di.value.trim()) di.value = savedTpl;
      }
    } catch (e) {}
  }

  function lockProFeatures() {
    try { localStorage.removeItem("fieldReport_isPro"); } catch (e) {}
    document.getElementById("proLogo").disabled = true;
    var logoBtn = document.getElementById("proLogoBtn");
    if (logoBtn) logoBtn.disabled = true;
    var rn = document.getElementById("reportNumber");
    rn.disabled = true;
    rn.value = "";
    rn.placeholder = "Auto-generated on Pro";
    var di = document.getElementById("disclaimer");
    di.disabled = true;
    di.value = "";
    di.placeholder = "Save custom disclaimer templates on Pro";
  }

  function fillCountrySelect(sel, defaultCode) {
    sel.innerHTML = "";
    COUNTRY_CODES.forEach(function (c, i) {
      var o = document.createElement("option");
      o.value = c.code;
      o.textContent = c.label;
      if (i === 0 && c.code === defaultCode) o.selected = true;
      sel.appendChild(o);
    });
  }
  fillCountrySelect(document.getElementById("authCountryCode"), "+1");
  fillCountrySelect(document.getElementById("settingsCountryCode"), "+1");

  function fullPhone(codeEl, phoneEl) {
    return codeEl.value + (phoneEl.value || "").replace(/\D/g, "");
  }
  function checkPhoneCooldown(full) {
    if (isAdmin()) return true;
    var v = localStorage.getItem("cool_phone_" + full);
    if (!v) return true;
    return Date.now() - parseInt(v, 10) >= PHONE_COOLDOWN_MS;
  }
  function setPhoneCooldown(full) {
    if (isAdmin()) return;
    localStorage.setItem("cool_phone_" + full, String(Date.now()));
  }

  function t() {
    return T[langSelect.value] || T.en || {};
  }

  function applyLanguage(lang) {
    if (!lang || !T[lang]) return;
    var dict = T[lang];
    function setText(id, key) {
      var el = document.getElementById(id);
      if (!el || dict[key] == null) return;
      el.textContent = dict[key];
    }
    function setHtml(id, key) {
      var el = document.getElementById(id);
      if (!el || dict[key] == null) return;
      el.innerHTML = dict[key];
    }
    setText("pageTitle", "pageTitle");
    setText("privacyHeader", "privacyHeader");
    setText("noticeText", "noticeText");
    setHtml("proLink", "proLink");
    setText("reportInfo", "reportInfo");
    setText("lblProject", "lblProject");
    setText("lblClient", "lblClient");
    setText("lblReportedBy", "lblReportedBy");
    setText("lblDate", "lblDate");
    setText("lblLocation", "lblLocation");
    setText("lblWeather", "lblWeather");
    setText("lblObservation", "lblObservation");
    setText("photoSection", "photoSection");
    setText("photoHint", "photoHint");
    setText("addPhotoBtn", "addPhotoBtn");
    setText("previewSection", "previewSection");
    setText("previewBtn", "previewBtn");
    setText("previewTitle", "previewTitle");
    setText("generateBtn", "generateBtn");
    setText("selectSource", "selectSource");
    setText("cameraBtn", "cameraBtn");
    setText("galleryBtn", "galleryBtn");
    setText("closeModal", "closeModal");
    setText("previewCloseBtn", "closePreviewBtn");
    setText("saveCloudBtn", "saveCloud");
    setText("proTitle", "proTitle");
    setText("proDesc", "proDesc");
    setText("lblProLogo", "lblProLogo");
    setText("lblProLogoHint", "lblProLogoHint");
    setText("lblReportNumber", "lblReportNumber");
    setText("lblDisclaimer", "lblDisclaimer");
    var rn = document.getElementById("reportNumber");
    if (rn && dict.reportNumberPlaceholder) rn.placeholder = dict.reportNumberPlaceholder;
    var di = document.getElementById("disclaimer");
    if (di && dict.disclaimerPlaceholder) di.placeholder = dict.disclaimerPlaceholder;
    var ws = document.getElementById("weather");
    if (ws && dict.weatherSunny) {
      ws.options[0].text = dict.weatherSunny;
      ws.options[1].text = dict.weatherCloudy;
      ws.options[2].text = dict.weatherRainy;
    }
    renumberPhotos();
    document.querySelectorAll(".photo-note").forEach(function (ta) {
      if (dict.notePlaceholder) ta.placeholder = dict.notePlaceholder;
    });
  }

  /* Language state: lazy-init from localStorage (never force English) */
  function getSavedLang() {
    try {
      var saved = localStorage.getItem("app_lang");
      if (saved && T[saved]) return saved;
      saved = localStorage.getItem("fieldReport_lang");
      if (saved && T[saved]) return saved;
    } catch (e) {}
    return null;
  }

  function setCurrentLang(newLang) {
    if (!newLang || !T[newLang]) return;
    applyLanguage(newLang);
    try {
      localStorage.setItem("app_lang", newLang);
      localStorage.removeItem("fieldReport_lang");
    } catch (e) {}
    for (var i = 0; i < langSelect.options.length; i++) {
      langSelect.options[i].selected = (langSelect.options[i].value === newLang);
    }
    langSelect.value = newLang;
  }

  langSelect.addEventListener("change", function () {
    if (!this.value || !T[this.value]) return;
    setCurrentLang(this.value);
  });

  function saveDraft() {
    try {
      localStorage.setItem("fieldReport_draft", JSON.stringify({
        projectName: document.getElementById("projectName").value,
        clientName: document.getElementById("clientName").value,
        reportedBy: document.getElementById("reportedBy").value,
        reportDate: document.getElementById("reportDate").value,
        location: document.getElementById("location").value,
        weather: document.getElementById("weather").value,
        observations: document.getElementById("observations").value
      }));
      var d = t();
      document.getElementById("draftStatus").textContent = d.draftSaved || "Draft saved";
      clearTimeout(window._ds);
      window._ds = setTimeout(function () {
        document.getElementById("draftStatus").textContent = "";
      }, 2000);
    } catch (e) {}
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem("fieldReport_draft");
      if (!raw) return;
      var d = JSON.parse(raw);
      document.getElementById("projectName").value = d.projectName || "";
      document.getElementById("clientName").value = d.clientName || "";
      document.getElementById("reportedBy").value = d.reportedBy || "";
      document.getElementById("reportDate").value = d.reportDate || "";
      document.getElementById("location").value = d.location || "";
      if (d.weather) document.getElementById("weather").value = d.weather;
      document.getElementById("observations").value = d.observations || "";
    } catch (e) {}
  }

  ["projectName","clientName","reportedBy","reportDate","location","weather","observations"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () {
      clearTimeout(window._dt);
      window._dt = setTimeout(saveDraft, 600);
    });
  });

  async function saveReportToCloud() {
    var dict = t();
    var statusEl = document.getElementById("syncStatus");
    statusEl.textContent = "";
    var sessionRes = await supabase.auth.getSession();
    var session = sessionRes.data.session;
    if (!session && !isAdmin()) {
      statusEl.style.color = "#DC2626";
      statusEl.textContent = "Please login first to save to cloud.";
      document.getElementById("authModal").classList.add("active");
      return false;
    }
    if (!session) return false;
    var photos = [];
    document.querySelectorAll(".photo-item").forEach(function (it) {
      photos.push({
        name: (it.querySelector(".file-name") && it.querySelector(".file-name").textContent) || "",
        note: (it.querySelector(".photo-note") && it.querySelector(".photo-note").value) || ""
      });
    });
    var payload = {
      user_id: session.user.id,
      project_name: document.getElementById("projectName").value || null,
      client_name: document.getElementById("clientName").value || null,
      reported_by: document.getElementById("reportedBy").value || null,
      report_date: document.getElementById("reportDate").value || null,
      location: document.getElementById("location").value || null,
      weather: document.getElementById("weather").value || null,
      observations: document.getElementById("observations").value || null,
      photos: photos
    };
    var res = await supabase.from("reports").insert([payload]);
    if (res.error) {
      statusEl.style.color = "#DC2626";
      statusEl.textContent = (dict.cloudError || "Cloud save failed") + " (" + res.error.message + ")";
      return false;
    }
    statusEl.style.color = "#059669";
    statusEl.textContent = dict.cloudSaved || "Saved to cloud";
    setTimeout(function () { statusEl.textContent = ""; }, 3000);
    return true;
  }
  document.getElementById("saveCloudBtn").addEventListener("click", async function () {
    if (!requireAuth("Save to Cloud")) return;
    var btn = document.getElementById("saveCloudBtn");
    var dict = t();
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      var ok = await saveReportToCloud();
      if (ok) {
        alert(dict.cloudSaved || "Report saved to cloud");
      }
    } catch (err) {
      console.error(err);
      alert((dict.cloudError || "Cloud save failed") + (err && err.message ? ": " + err.message : ""));
    } finally {
      btn.disabled = false;
      btn.textContent = dict.saveCloud || original || "Save to Cloud";
    }
  });

  /* Photos */
  document.getElementById("addPhotoBtn").addEventListener("click", function () {
    document.getElementById("photoModal").classList.add("active");
  });
  document.getElementById("closeModal").addEventListener("click", function () {
    document.getElementById("photoModal").classList.remove("active");
  });
  document.getElementById("cameraBtn").addEventListener("click", addNewPhoto);
  document.getElementById("galleryBtn").addEventListener("click", addNewPhoto);

  function addNewPhoto() {
    photoCount++;
    var dict = t();
    var item = document.createElement("div");
    item.className = "photo-item";
    item.draggable = true;
    item.id = "photo-" + photoCount;
    var addLabel = "+ Add";
    item.innerHTML =
      '<div class="photo-label">' + (dict.photoPrefix || "PHOTO") + " " + photoCount + "</div>" +
      '<img class="photo-preview" id="preview-img-' + photoCount + '" style="display:none" alt="">' +
      '<input type="file" accept="image/*" class="file-input-hidden" id="file-' + photoCount + '" onchange="window.handleFileSelect(' + photoCount + ',this)">' +
      '<button type="button" class="btn-add-file" onclick="document.getElementById(\'file-' + photoCount + '\').click()">' + addLabel + "</button>" +
      '<span class="file-name" id="name-' + photoCount + '"></span>' +
      '<textarea class="photo-note" id="note-' + photoCount + '" placeholder="' + (dict.notePlaceholder || "Add a note") + '" oninput="window.saveDraft()"></textarea>';

    item.addEventListener("dragstart", function (e) {
      draggedItem = this;
      this.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (draggedItem && draggedItem !== this) {
        var all = Array.from(photoList.children);
        var from = all.indexOf(draggedItem);
        var to = all.indexOf(this);
        if (from < to) this.parentNode.insertBefore(draggedItem, this.nextSibling);
        else this.parentNode.insertBefore(draggedItem, this);
        renumberPhotos();
        saveDraft();
      }
    });
    item.addEventListener("dragend", function () {
      this.classList.remove("dragging");
      draggedItem = null;
    });

    var touchTimer = null, touchDragging = false;
    item.addEventListener("touchstart", function () {
      var self = this;
      touchTimer = setTimeout(function () {
        touchDragging = true;
        draggedItem = self;
        self.classList.add("dragging");
      }, 400);
    }, { passive: true });
    item.addEventListener("touchmove", function (e) {
      if (!touchDragging || !draggedItem) return;
      var touch = e.touches[0];
      var el = document.elementFromPoint(touch.clientX, touch.clientY);
      var target = el && el.closest ? el.closest(".photo-item") : null;
      if (target && target !== draggedItem && target.parentNode === photoList) {
        var all = Array.from(photoList.children);
        var from = all.indexOf(draggedItem);
        var to = all.indexOf(target);
        if (from < to) target.parentNode.insertBefore(draggedItem, target.nextSibling);
        else target.parentNode.insertBefore(draggedItem, target);
      }
    }, { passive: true });
    item.addEventListener("touchend", function () {
      clearTimeout(touchTimer);
      if (touchDragging) {
        touchDragging = false;
        if (draggedItem) draggedItem.classList.remove("dragging");
        draggedItem = null;
        renumberPhotos();
        saveDraft();
      }
    }, { passive: true });

    photoList.appendChild(item);
    document.getElementById("photoModal").classList.remove("active");
  }

  window.handleFileSelect = function (id, input) {
    if (!input.files || !input.files[0]) return;
    document.getElementById("name-" + id).textContent = input.files[0].name;
    var img = document.getElementById("preview-img-" + id);
    var r = new FileReader();
    r.onload = function (e) {
      img.src = e.target.result;
      img.style.display = "block";
    };
    r.readAsDataURL(input.files[0]);
  };
  window.saveDraft = saveDraft;

  function renumberPhotos() {
    var dict = t();
    photoList.querySelectorAll(".photo-item").forEach(function (it, i) {
      var l = it.querySelector(".photo-label");
      if (l) l.textContent = (dict.photoPrefix || "PHOTO") + " " + (i + 1);
    });
  }

  /* Preview */
  document.getElementById("previewBtn").addEventListener("click", function () {
    var dict = t();
    var ws = document.getElementById("weather");
    var weather = ws.options[ws.selectedIndex] ? ws.options[ws.selectedIndex].text : "-";
    var items = photoList.querySelectorAll(".photo-item");
    var photosHtml = items.length === 0 ? "<p>" + (dict.noPhotos || "No photos") + "</p>" : "";
    items.forEach(function (it, idx) {
      var fn = (it.querySelector(".file-name") && it.querySelector(".file-name").textContent) || "-";
      var note = (it.querySelector(".photo-note") && it.querySelector(".photo-note").value) || "";
      var src = (it.querySelector(".photo-preview") && it.querySelector(".photo-preview").src) || "";
      photosHtml +=
        '<div class="preview-photo-card">' +
        '<div><strong>' + (dict.photoPrefix || "PHOTO") + " " + (idx + 1) + ":</strong> " + fn + "</div>" +
        (src ? '<img src="' + src + '" alt="">' : "") +
        '<div class="preview-note-label">' + (dict.noteLabel || "Note") + ':</div>' +
        '<div class="preview-note-text">' + (note || "—") + "</div>" +
        "</div>";
    });
    document.getElementById("previewBody").innerHTML =
      "<p><strong>" + (dict.lblProject || "Project") + ":</strong> " + (document.getElementById("projectName").value || "—") + "</p>" +
      "<p><strong>" + (dict.lblClient || "Client") + ":</strong> " + (document.getElementById("clientName").value || "—") + "</p>" +
      "<p><strong>" + (dict.lblReportedBy || "Reported By") + ":</strong> " + (document.getElementById("reportedBy").value || "—") + "</p>" +
      "<p><strong>" + (dict.lblDate || "Date") + ":</strong> " + (document.getElementById("reportDate").value || "—") + "</p>" +
      "<p><strong>" + (dict.lblLocation || "Location") + ":</strong> " + (document.getElementById("location").value || "—") + "</p>" +
      "<p><strong>" + (dict.lblWeather || "Weather") + ":</strong> " + weather + "</p>" +
      '<p style="margin-top:10px"><strong>' + (dict.lblObservation || "Observations") + ":</strong></p>" +
      '<p style="white-space:pre-wrap">' + (document.getElementById("observations").value || "—") + "</p>" +
      '<div style="margin-top:14px"><strong>' + (dict.photoSection || "Photos") + "</strong><br>" + photosHtml + "</div>";
    document.getElementById("previewModal").classList.add("active");
  });

  function closePreview() {
    document.getElementById("previewModal").classList.remove("active");
  }
  document.getElementById("previewClose").addEventListener("click", closePreview);
  document.getElementById("previewCloseBtn").addEventListener("click", closePreview);

  /* PDF – full client-side generation */
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.getElementById("generateBtn").addEventListener("click", async function () {
    if (!requireAuth("Generate PDF")) return;
    var dict = t();
    if (typeof html2canvas === "undefined" || !window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF libraries failed to load. Please check your internet connection and try again.");
      return;
    }
    try { await saveReportToCloud(); } catch (e) {}

    var btn = document.getElementById("generateBtn");
    btn.disabled = true;
    btn.textContent = dict.generating || "Generating...";
    var container = document.getElementById("pdfContainer");
    container.innerHTML = "";

    function makePageEl(inner) {
      var page = document.createElement("div");
      page.style.cssText = "width:794px;padding:40px;background:#fff;color:#0A2463;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-sizing:border-box;";
      page.innerHTML = inner;
      container.appendChild(page);
      return page;
    }

    async function waitImages(root) {
      var imgs = root.querySelectorAll("img");
      await Promise.all(Array.prototype.map.call(imgs, function (img) {
        if (img.complete && img.naturalHeight) return Promise.resolve();
        return new Promise(function (resolve) {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 4000);
        });
      }));
    }

    async function canvasOf(el) {
      await waitImages(el);
      return html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#FFFFFF",
        width: 794,
        windowWidth: 794
      });
    }

    try {
      var projectName = document.getElementById("projectName").value || dict.pdfTitle || "Field Report";
      var clientName = document.getElementById("clientName").value || "—";
      var reportedBy = document.getElementById("reportedBy").value || "—";
      var reportDate = document.getElementById("reportDate").value || "—";
      var location = document.getElementById("location").value || "—";
      var ws = document.getElementById("weather");
      var weather = ws.options[ws.selectedIndex] ? ws.options[ws.selectedIndex].text : "—";
      var observations = document.getElementById("observations").value || "";
      var reportNumber = document.getElementById("reportNumber").value || "";
      var disclaimer = document.getElementById("disclaimer").value || "";
      var proLogoSrc = (document.getElementById("proLogoPreview") && document.getElementById("proLogoPreview").src) || "";

      var coverHtml =
        '<div style="display:flex;flex-direction:column;min-height:1040px;box-sizing:border-box">' +
        '<div style="flex:1 1 auto">' +
        '<div style="text-align:center;border-bottom:2px solid #0A2463;padding-bottom:16px;margin-bottom:20px">' +
        (proLogoSrc ? '<img src="' + proLogoSrc + '" style="max-height:56px;max-width:160px;object-fit:contain;margin:0 auto 10px;display:block">' : '') +
        '<h1 style="font-size:26px;margin:0 0 6px">' + esc(projectName) + "</h1>" +
        (reportNumber ? '<p style="font-size:13px;color:#64748B;margin:0">No. ' + esc(reportNumber) + "</p>" : "") +
        "</div>" +
        '<table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:16px">' +
        "<tr><td style='padding:6px 0;width:140px;font-weight:600'>Client</td><td>" + esc(clientName) + "</td></tr>" +
        "<tr><td style='padding:6px 0;font-weight:600'>Reported By</td><td>" + esc(reportedBy) + "</td></tr>" +
        "<tr><td style='padding:6px 0;font-weight:600'>Date</td><td>" + esc(reportDate) + "</td></tr>" +
        "<tr><td style='padding:6px 0;font-weight:600'>Location</td><td>" + esc(location) + "</td></tr>" +
        "<tr><td style='padding:6px 0;font-weight:600'>Weather</td><td>" + esc(weather) + "</td></tr>" +
        "</table>" +
        '<h3 style="font-size:15px;margin:18px 0 8px;border-bottom:1px solid #CBD5E1;padding-bottom:6px">Observations</h3>' +
        '<p style="font-size:14px;white-space:pre-wrap;line-height:1.55;margin:0">' + esc(observations) + "</p>" +
        (disclaimer
          ? '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #CBD5E1;font-size:11px;color:#64748B;white-space:pre-wrap">' + esc(disclaimer) + "</div>"
          : "") +
        "</div>" +
        '<div style="flex-shrink:0;margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;text-align:center">Powered by NBRP GLOBAL</div>' +
        "</div>";

      var pages = [];
      pages.push(makePageEl(coverHtml));

      var items = photoList.querySelectorAll(".photo-item");
      items.forEach(function (it, idx) {
        var fn = (it.querySelector(".file-name") && it.querySelector(".file-name").textContent) || "";
        var note = (it.querySelector(".photo-note") && it.querySelector(".photo-note").value) || "";
        var src = (it.querySelector(".photo-preview") && it.querySelector(".photo-preview").src) || "";
        var photoHtml =
          '<div style="display:flex;flex-direction:column;min-height:1040px;box-sizing:border-box">' +
          '<div style="flex:1 1 auto">' +
          '<h2 style="font-size:18px;margin:0 0 14px;border-bottom:2px solid #0A2463;padding-bottom:10px">' +
          esc(dict.photoPrefix || "PHOTO") + " " + (idx + 1) + "</h2>" +
          (fn ? '<p style="font-size:13px;margin:0 0 12px"><strong>' + esc(dict.fileLabel || "File") + ":</strong> " + esc(fn) + "</p>" : "") +
          (src
            ? '<img src="' + src + '" style="display:block;max-width:100%;max-height:520px;width:auto;height:auto;object-fit:contain;margin:0 auto 14px">'
            : "") +
          (note
            ? '<h3 style="font-size:14px;margin:12px 0 6px">' + esc(dict.noteLabel || "Note") + "</h3>" +
              '<p style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.5;margin:0">' + esc(note) + "</p>"
            : "") +
          "</div>" +
          '<div style="flex-shrink:0;margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;text-align:center">Powered by NBRP GLOBAL</div>' +
          "</div>";
        pages.push(makePageEl(photoHtml));
      });

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF("p", "mm", "a4");
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 12;
      var usableW = pageW - margin * 2;
      var usableH = pageH - margin * 2;

      for (var i = 0; i < pages.length; i++) {
        var canvas = await canvasOf(pages[i]);
        var imgW = usableW;
        var imgH = (canvas.height * imgW) / canvas.width;
        if (i > 0) pdf.addPage();
        if (imgH <= usableH) {
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, imgH);
        } else {
          /* Rare overflow: scale down to fit one page without splitting a photo card */
          var scale = usableH / imgH;
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW * scale, usableH);
        }
      }

      var safeName = projectName.replace(/[<>:"/\\|?*]/g, "_").substring(0, 40) || "Field_Report";
      var safeDate = document.getElementById("reportDate").value || new Date().toISOString().split("T")[0];
      pdf.save(safeName + "_" + safeDate + ".pdf");
    } catch (err) {
      console.error("PDF Error:", err);
      alert("PDF generation failed. " + (err && err.message ? err.message : "Please try again."));
    } finally {
      container.innerHTML = "";
      btn.disabled = false;
      btn.textContent = dict.generateBtn || "Generate PDF";
    }
  });

/* User avatar – always visible */
  document.getElementById("userAvatarBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    if (!currentUser) {
      document.getElementById("authModal").classList.add("active");
      document.getElementById("authError").textContent = "";
      return;
    }
    document.getElementById("userDropdown").classList.toggle("open");
  });
  document.addEventListener("click", function () {
    document.getElementById("userDropdown").classList.remove("open");
  });
  document.getElementById("userDropdown").addEventListener("click", function (e) {
    e.stopPropagation();
  });
  document.getElementById("closeSettings").addEventListener("click", function () {
    document.getElementById("settingsModal").classList.remove("active");
  });
  document.getElementById("savePhoneBtn").addEventListener("click", function () {
    var full = fullPhone(document.getElementById("settingsCountryCode"), document.getElementById("settingsPhone"));
    var err = document.getElementById("settingsError");
    if (!document.getElementById("settingsPhone").value.trim()) {
      err.textContent = "Enter a phone number.";
      return;
    }
    if (!checkPhoneCooldown(full)) {
      err.textContent = "This phone number is in a 90-day cooldown period.";
      return;
    }
    setPhoneCooldown(full);
    err.style.color = "#059669";
    err.textContent = "Phone updated.";
    setTimeout(function () {
      err.textContent = "";
      err.style.color = "#DC2626";
      document.getElementById("settingsModal").classList.remove("active");
    }, 1000);
  });

  /* Auth */

  /* Forgot password / reset flow */
  function hideAllAuthViews() {
    document.getElementById("authViewLogin").style.display = "none";
    document.getElementById("authViewRegister").style.display = "none";
    document.getElementById("authViewReset").style.display = "none";
  }
  function showAuthLoginView() {
    hideAllAuthViews();
    document.getElementById("authViewLogin").style.display = "block";
    document.getElementById("authError").textContent = "";
    var title = document.getElementById("authTitle");
    if (title) title.textContent = (t().authSignIn || "Sign In");
  }
  function showAuthRegisterView() {
    hideAllAuthViews();
    document.getElementById("authViewRegister").style.display = "block";
    document.getElementById("regError").textContent = "";
    var title = document.getElementById("authRegisterTitle");
    if (title) title.textContent = (t().authCreateAccount || "Create Account");
  }
  function showAuthResetView() {
    hideAllAuthViews();
    document.getElementById("authViewReset").style.display = "block";
    document.getElementById("resetError").textContent = "";
    var email = document.getElementById("authEmail").value.trim();
    if (email) document.getElementById("resetEmail").value = email;
  }
  document.getElementById("forgotPasswordLink").addEventListener("click", function () {
    showAuthResetView();
  });
  document.getElementById("backToLoginLink").addEventListener("click", function () {
    showAuthLoginView();
  });
  document.getElementById("switchToRegister").addEventListener("click", function () {
    showAuthRegisterView();
  });
  document.getElementById("switchToLogin").addEventListener("click", function () {
    showAuthLoginView();
  });
  document.getElementById("sendResetBtn").addEventListener("click", async function () {
    var email = document.getElementById("resetEmail").value.trim().toLowerCase();
    var err = document.getElementById("resetError");
    err.style.color = "#DC2626";
    err.textContent = "";
    if (!email) {
      err.textContent = "Please enter your email.";
      return;
    }
    var btn = document.getElementById("sendResetBtn");
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      var res = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      if (res.error) {
        err.textContent = res.error.message;
        return;
      }
      err.style.color = "#059669";
      err.textContent = "Password reset email sent!";
      alert("Password reset email sent!");
    } catch (e) {
      err.textContent = (e && e.message) || "Failed to send reset email.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Reset Link";
    }
  });
  /* Reset auth modal to login view when opened */
  var _openAuth = function () {
    showAuthLoginView();
    document.getElementById("authModal").classList.add("active");
    document.getElementById("authError").textContent = "";
  };

  document.getElementById("closeAuth").addEventListener("click", function () {
    document.getElementById("authModal").classList.remove("active");
    showAuthLoginView();
  });
  document.getElementById("registerBtn").addEventListener("click", async function () {
    var title = document.getElementById("authRegisterTitle");
    if (title) title.textContent = (t().authCreateAccount || "Create Account");
    var email = document.getElementById("regEmail").value.trim().toLowerCase();
    var password = document.getElementById("regPassword").value;
    var phoneLocal = document.getElementById("authPhone").value.trim();
    var country = document.getElementById("authCountryCode").value;
    var err = document.getElementById("regError");
    err.style.color = "#DC2626";
    err.textContent = "";
    if (!email || password.length < 6) {
      err.textContent = "Valid email and password (min 6 characters) required.";
      return;
    }
    if (isTempEmail(email)) {
      err.textContent = "Temporary email addresses are not allowed.";
      return;
    }
    if (!phoneLocal) {
      err.textContent = "Phone number is required for registration.";
      return;
    }
    var fullPhone = normalizePhone(country, phoneLocal);
    if (isPhoneOnCooldown(fullPhone)) {
      err.textContent = "This phone number is in a 90-day cool-down period.";
      return;
    }
    if (hasDeviceTrialUsed() && email !== ADMIN_EMAIL) {
      err.textContent = "This device already used a trial. Please sign in instead.";
      return;
    }
    var res = await supabase.auth.signUp({ email: email, password: password });
    if (res.error) {
      err.textContent = res.error.message;
      return;
    }
    recordPhone(fullPhone);
    markDeviceTrial();
    currentUser = res.data.user;
    updateAuthUI();
    document.getElementById("authModal").classList.remove("active");
    showAuthLoginView();
    alert("Account created. You can start using Field Report.");
  });
  document.getElementById("loginBtn").addEventListener("click", async function () {
    var title = document.getElementById("authTitle");
    if (title) title.textContent = (t().authSignIn || "Sign In");

    var email = document.getElementById("authEmail").value.trim().toLowerCase();
    var password = document.getElementById("authPassword").value;
    var err = document.getElementById("authError");
    if (!email || !password) { err.textContent = "Email and password required"; return; }
    var res = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (res.error) { err.textContent = res.error.message; return; }
    currentUser = res.data.user;
    updateAuthUI();
    document.getElementById("authModal").classList.remove("active");
  });
  document.getElementById("logoutBtn").addEventListener("click", async function () {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById("userDropdown").classList.remove("open");
    updateAuthUI();
  });

  function updateAuthUI() {
    var logoutBtn = document.getElementById("logoutBtn");
    if (currentUser) {
      document.getElementById("ddEmail").textContent = currentUser.email || "";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (isAdmin() || isProUser()) {
        unlockProFeatures();
      }
    } else {
      document.getElementById("ddEmail").textContent = "Not signed in";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (!isProUser()) lockProFeatures();
    }
  }

  loadPaymentLinks();

  supabase.auth.getSession().then(function (res) {
    if (res.data.session) {
      currentUser = res.data.session.user;
      updateAuthUI();
    }
  });
  supabase.auth.onAuthStateChange(function (event, session) {
    currentUser = session ? session.user : null;
    updateAuthUI();
  });

  /* Billing – always openable via Plans button (no login required to view) */
  function updatePlanPrices() {
    document.querySelectorAll(".plan-option").forEach(function (el) {
      var m = el.dataset.monthly, y = el.dataset.yearly;
      var priceEl = el.querySelector(".price");
      if (isYearly)
        priceEl.innerHTML = "$" + y + ' <span style="font-size:13px;font-weight:500">/ year</span>';
      else
        priceEl.innerHTML = "$" + m + ' <span style="font-size:13px;font-weight:500">/ month</span>';
    });
    document.getElementById("labelMonthly").classList.toggle("active", !isYearly);
    document.getElementById("labelYearly").classList.toggle("active", isYearly);
    document.getElementById("billingToggle").classList.toggle("on", isYearly);
  }

  function openPricing() {
    selectedPlan = null;
    document.querySelectorAll(".plan-option").forEach(function (el) {
      el.classList.remove("selected");
    });
    document.getElementById("proceedPaymentBtn").disabled = true;
    updatePlanPrices();
    document.getElementById("proModal").classList.add("active");
  }

  document.getElementById("billingToggle").addEventListener("click", function () {
    isYearly = !isYearly;
    updatePlanPrices();
  });
  document.getElementById("proLink").addEventListener("click", openPricing);
  document.getElementById("closePro").addEventListener("click", function () {
    document.getElementById("proModal").classList.remove("active");
  });
  document.querySelectorAll(".plan-option").forEach(function (el) {
    el.addEventListener("click", function () {
      document.querySelectorAll(".plan-option").forEach(function (x) {
        x.classList.remove("selected");
      });
      this.classList.add("selected");
      selectedPlan = {
        plan: this.dataset.plan,
        price: isYearly ? this.dataset.yearly : this.dataset.monthly,
        interval: isYearly ? "year" : "month"
      };
      document.getElementById("proceedPaymentBtn").disabled = false;
    });
  });
  document.getElementById("proceedPaymentBtn").addEventListener("click", async function () {
    if (!selectedPlan) return;
    if (!currentUser && !isAdmin()) {
      document.getElementById("proModal").classList.remove("active");
      showAuthLoginView();
      document.getElementById("authModal").classList.add("active");
      return;
    }
    var key = selectedPlan.plan + "_" + (selectedPlan.interval === "year" ? "yearly" : "monthly");
    var url = STRIPE_PAYMENT_LINKS[key];
    if (!url) {
      /* One retry after DB load */
      await loadPaymentLinks();
      url = STRIPE_PAYMENT_LINKS[key];
    }
    if (!url) {
      alert("Payment link unavailable. Please try again shortly.");
      return;
    }
    document.getElementById("proModal").classList.remove("active");
    window.location.href = url;
  });

  /* Legal */
  document.getElementById("footerPrivacy").addEventListener("click", function () {
    document.getElementById("privacyModal").classList.add("active");
  });
  document.getElementById("footerTerms").addEventListener("click", function () {
    document.getElementById("termsModal").classList.add("active");
  });
  document.getElementById("closePrivacy").addEventListener("click", function () {
    document.getElementById("privacyModal").classList.remove("active");
  });
  document.getElementById("closeTerms").addEventListener("click", function () {
    document.getElementById("termsModal").classList.remove("active");
  });

  try {
    /* Initialize language once from storage — never overwrite with English on load */
    var initialLang = getSavedLang();
    if (initialLang) {
      setCurrentLang(initialLang);
    } else {
      langSelect.value = "";
      for (var j = 0; j < langSelect.options.length; j++) {
        langSelect.options[j].selected = (langSelect.options[j].value === "");
      }
    }
  } catch (e) {}


  /* Pro custom logo upload */
  (function () {
    var logoInput = document.getElementById("proLogo");
    var logoBtn = document.getElementById("proLogoBtn");
    var logoPrev = document.getElementById("proLogoPreview");
    if (logoBtn && logoInput) {
      logoBtn.addEventListener("click", function () {
        if (logoInput.disabled) {
          alert("Custom logo is available on the Pro plan. Upgrade to unlock.");
          openPricing();
          return;
        }
        logoInput.click();
      });
      logoInput.addEventListener("change", function () {
        if (!this.files || !this.files[0]) return;
        var file = this.files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
          if (logoPrev) {
            logoPrev.src = e.target.result;
            logoPrev.style.display = "block";
          }
          try { localStorage.setItem("fieldReport_proLogo", e.target.result); } catch (err) {}
        };
        reader.readAsDataURL(file);
      });
    }
    try {
      var savedLogo = localStorage.getItem("fieldReport_proLogo");
      if (savedLogo && logoPrev) {
        logoPrev.src = savedLogo;
        logoPrev.style.display = "block";
      }
    } catch (e) {}
  })();

  /* Restore Pro fields after session/lang/draft */

  /* Persist custom disclaimer template for Pro users */
  document.getElementById("disclaimer").addEventListener("input", function () {
    if (this.disabled) return;
    try {
      localStorage.setItem("fieldReport_disclaimerTemplate", this.value);
    } catch (e) {}
  });
  if (isAdmin() || isProUser()) {
    unlockProFeatures();
  }

  loadDraft();
})();
