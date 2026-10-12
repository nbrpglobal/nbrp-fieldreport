/* Field Report — clean build 2026-10-12 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://bgeexuuvpazischwkjkx.supabase.co";
  var SUPABASE_KEY = "sb_publishable_iSoyDlLuQDTLMkxSZj3mTw_Vs5khtwJ";
  var ADMIN = "nbrp.global@gmail.com";
  var LINKS = {
    standard_m: "https://buy.stripe.com/fZudR9b8maLC9FraU70sU0c",
    standard_y: "https://buy.stripe.com/3cIdR93FUbPG5pbe6j0sU0d",
    pro_m: "https://buy.stripe.com/9B65kD1xMf1SaJv4vJ0sU0e",
    pro_y: "https://buy.stripe.com/cNi4gzdgudXO4l78LZ0sU0f"
  };

  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var user = null;
  var isPro = false;
  var photos = [];
  var customLogo = "";
  var disclaimerTpl = "";
  var yearly = false;
  var selected = null;
  var lang = "en";

  function $(id) { return document.getElementById(id); }
  function t() { return (window.T && window.T[lang]) || window.T.en || {}; }
  function esc(s) {
    var v = String(s == null ? "" : s);
    return v.replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;");
  }
  function toast(msg, type) {
    var host = $("toastHost");
    if (!host) return;
    var el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
  }
  function isAdmin() {
    return !!(user && (user.email || "").toLowerCase() === ADMIN);
  }
  function subscribed() { return isAdmin() || isPro; }

  /* ---------- i18n ---------- */
  function applyLang() {
    var d = t();
    var map = {
      pageTitle: "pageTitle", privacyHeader: "privacyHeader", noticeText: "noticeText",
      reportInfo: "reportInfo", lblProject: "lblProject", lblClient: "lblClient",
      lblReportedBy: "lblReportedBy", lblDate: "lblDate", lblLocation: "lblLocation",
      lblWeather: "lblWeather", lblObservation: "lblObservation",
      photoSection: "photoSection", photoHint: "photoHint", addPhotoBtn: "addPhotoBtn",
      previewSection: "previewSection", previewBtn: "previewBtn", previewTitle: "previewTitle",
      generateBtn: "generateBtn", selectSource: "selectSource", cameraBtn: "cameraBtn",
      galleryBtn: "galleryBtn", closeModal: "closeModal", closePreviewBtn: "closePreviewBtn",
      proTitle: "proTitle", proDesc: "proDesc", lblProLogo: "lblProLogo",
      lblProLogoHint: "lblProLogoHint", lblReportNumber: "lblReportNumber",
      lblDisclaimer: "lblDisclaimer", saveCloud: "saveCloud"
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (el && d[map[id]]) {
        if (id === "proLink") return;
        el.textContent = d[map[id]];
      }
    });
    var pl = $("proLink");
    if (pl && d.proLink) pl.innerHTML = d.proLink;
    var pn = $("projectName"); if (pn) pn.placeholder = "";
    var rn = $("reportNumber");
    if (rn && !subscribed()) rn.placeholder = d.reportNumberPlaceholder || "Auto-generated on Pro";
    var dc = $("disclaimer");
    if (dc && !subscribed()) dc.placeholder = d.disclaimerPlaceholder || "Save custom disclaimer templates on Pro";
    try { localStorage.setItem("app_lang", lang); } catch (e) {}
  }

  /* ---------- auth UI ---------- */
  function updateAuth() {
    var dd = $("ddEmail");
    var lo = $("logoutBtn");
    if (user) {
      if (dd) dd.textContent = user.email || "";
      if (lo) lo.style.display = "block";
    } else {
      if (dd) dd.textContent = "Not signed in";
      if (lo) lo.style.display = "none";
    }
    if (subscribed()) unlockPro(); else lockPro();
    var hint = $("exportHint");
    if (hint) hint.style.display = subscribed() ? "none" : "block";
  }
  function unlockPro() {
    isPro = true;
    try { localStorage.setItem("fieldReport_isPro", "1"); } catch (e) {}
    ["proLogo", "proLogoBtn", "reportNumber", "disclaimer"].forEach(function (id) {
      var el = $(id); if (el) el.disabled = false;
    });
    var rn = $("reportNumber");
    if (rn && !/^FR-\d{8}-\d{3}$/.test((rn.value || "").trim())) rn.value = nextReportNumber();
    var dc = $("disclaimer");
    if (dc && !dc.value && disclaimerTpl) dc.value = disclaimerTpl;
    if (dc) dc.placeholder = "";
    if (rn) rn.placeholder = "";
  }
  function lockPro() {
    if (isAdmin()) return;
    try { localStorage.removeItem("fieldReport_isPro"); } catch (e) {}
    isPro = false;
    ["proLogo", "proLogoBtn", "reportNumber", "disclaimer"].forEach(function (id) {
      var el = $(id); if (el) el.disabled = true;
    });
  }
  function nextReportNumber() {
    var n = new Date();
    var y = n.getFullYear();
    var m = String(n.getMonth() + 1).padStart(2, "0");
    var d = String(n.getDate()).padStart(2, "0");
    var key = "fr_seq_" + y + m + d;
    var seq = 1;
    try { seq = parseInt(localStorage.getItem(key) || "0", 10) + 1; localStorage.setItem(key, String(seq)); } catch (e) {}
    return "FR-" + y + m + d + "-" + String(seq).padStart(3, "0");
  }
  function requireAuth() {
    if (user || isAdmin()) return true;
    showAuth("login");
    $("authModal").classList.add("active");
    return false;
  }

  /* ---------- auth views ---------- */
  function hideAuthViews() {
    ["authViewLogin", "authViewRegister", "authViewReset"].forEach(function (id) {
      var el = $(id); if (el) el.style.display = "none";
    });
  }
  function showAuth(view) {
    hideAuthViews();
    var id = view === "register" ? "authViewRegister" : view === "reset" ? "authViewReset" : "authViewLogin";
    var el = $(id); if (el) el.style.display = "block";
  }

  /* ---------- photos ---------- */
  function renderPhotos() {
    var list = $("photoList");
    if (!list) return;
    list.innerHTML = "";
    photos.forEach(function (p, i) {
      var card = document.createElement("div");
      card.className = "photo-card";
      card.innerHTML =
        '<img src="' + p.src + '" alt="">' +
        '<textarea class="input note" placeholder="' + esc(t().notePlaceholder || "Add a note") + '">' + esc(p.note || "") + '</textarea>' +
        '<button type="button" class="remove-photo">Remove</button>';
      card.querySelector("textarea").addEventListener("input", function (e) { photos[i].note = e.target.value; saveDraft(); });
      card.querySelector(".remove-photo").addEventListener("click", function () { photos.splice(i, 1); renderPhotos(); saveDraft(); });
      list.appendChild(card);
    });
  }
  function addPhotoFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      photos.push({ src: reader.result, name: file.name, note: "" });
      renderPhotos();
      saveDraft();
    };
    reader.readAsDataURL(file);
  }

  /* ---------- draft ---------- */
  function saveDraft() {
    try {
      var data = {
        projectName: $("projectName").value,
        clientName: $("clientName").value,
        reportedBy: $("reportedBy").value,
        reportDate: $("reportDate").value,
        location: $("location").value,
        weather: $("weather").value,
        observations: $("observations").value,
        reportNumber: $("reportNumber").value,
        disclaimer: $("disclaimer").value,
        photos: photos
      };
      localStorage.setItem("fieldReport_draft", JSON.stringify(data));
      if (disclaimerTpl || $("disclaimer").value) {
        if (subscribed()) localStorage.setItem("fieldReport_disclaimerTemplate", $("disclaimer").value);
      }
      var st = $("draftStatus");
      if (st) st.textContent = t().draftSaved || "Draft auto-saved";
    } catch (e) {}
  }
  function loadDraft() {
    try {
      disclaimerTpl = localStorage.getItem("fieldReport_disclaimerTemplate") || "";
      var raw = localStorage.getItem("fieldReport_draft");
      if (!raw) return;
      var d = JSON.parse(raw);
      ["projectName", "clientName", "reportedBy", "reportDate", "location", "weather", "observations", "reportNumber", "disclaimer"].forEach(function (k) {
        if ($(k) && d[k] != null) $(k).value = d[k];
      });
      photos = Array.isArray(d.photos) ? d.photos : [];
      renderPhotos();
    } catch (e) {}
  }

  /* ---------- cloud ---------- */
  async function saveCloud() {
    if (!requireAuth()) return;
    var btn = $("saveCloudBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      var row = {
        user_id: user.id,
        project_name: $("projectName").value || "",
        client_name: $("clientName").value || "",
        reported_by: $("reportedBy").value || "",
        report_date: $("reportDate").value || null,
        location: $("location").value || "",
        weather: $("weather").value || "",
        observations: $("observations").value || "",
        report_number: $("reportNumber").value || "",
        disclaimer: $("disclaimer").value || "",
        photos: photos.map(function (p) { return { name: p.name, note: p.note, src: p.src }; })
      };
      var res = await supabase.from("reports").insert(row);
      if (res.error) throw res.error;
      toast(t().cloudSaved || "Report saved to cloud", "success");
    } catch (e) {
      toast((e && e.message) || (t().cloudError || "Cloud save failed"), "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = t().saveCloud || "Save to Cloud"; }
    }
  }

  /* ---------- preview / pdf ---------- */
  function reportHtml(withWm) {
    var d = t();
    var wm = withWm
      ? '<div style="position:absolute;inset:0;pointer-events:none;z-index:8;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
        '<div style="transform:rotate(-32deg);font-size:160px;font-weight:800;letter-spacing:8px;white-space:nowrap;color:rgba(255,255,255,0.8);-webkit-text-stroke:3px rgba(10,36,99,0.55);text-shadow:0 0 6px rgba(0,0,0,0.5);">PREVIEW</div></div>'
      : "";
    var logo = customLogo ? '<img src="' + customLogo + '" style="height:36px;margin-bottom:8px">' : "";
    var body =
      logo +
      "<h1 style=\"font-size:22px;margin:0 0 12px\">" + esc($("projectName").value || d.pdfTitle || "Field Report") + "</h1>" +
      "<p><strong>Client:</strong> " + esc($("clientName").value || "—") + "</p>" +
      "<p><strong>Reported by:</strong> " + esc($("reportedBy").value || "—") + "</p>" +
      "<p><strong>Date:</strong> " + esc($("reportDate").value || "—") + "</p>" +
      "<p><strong>Location:</strong> " + esc($("location").value || "—") + "</p>" +
      "<p><strong>Weather:</strong> " + esc($("weather").options[$("weather").selectedIndex].text) + "</p>" +
      ($("reportNumber").value ? "<p><strong>Report number:</strong> " + esc($("reportNumber").value) + "</p>" : "") +
      "<h3 style=\"margin:16px 0 6px\">Observations</h3>" +
      "<p style=\"white-space:pre-wrap;overflow-wrap:anywhere\">" + esc($("observations").value || "—") + "</p>" +
      ($("disclaimer").value ? "<h3 style=\"margin:16px 0 6px\">Disclaimer</h3><p style=\"white-space:pre-wrap\">" + esc($("disclaimer").value) + "</p>" : "");
    var pages = ['<div style="position:relative;min-height:1000px">' + body + wm + '<div style="position:absolute;bottom:8px;left:0;right:0;text-align:center;font-size:10px;color:#94A3B8">Powered by NBRP GLOBAL</div></div>'];
    photos.forEach(function (p, i) {
      pages.push(
        '<div style="position:relative;min-height:1000px">' +
        "<h2>PHOTO " + (i + 1) + "</h2>" +
        (p.name ? "<p><strong>File:</strong> " + esc(p.name) + "</p>" : "") +
        '<img src="' + p.src + '" style="display:block;max-width:100%;max-height:520px;margin:12px auto">' +
        (p.note ? '<h3 style="margin-top:12px">Note</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word">' + esc(p.note) + "</p>" : "") +
        wm +
        '<div style="position:absolute;bottom:8px;left:0;right:0;text-align:center;font-size:10px;color:#94A3B8">Powered by NBRP GLOBAL</div></div>'
      );
    });
    return pages;
  }

  function openPreview() {
    var body = $("previewBody");
    body.innerHTML = reportHtml(false).join("<hr style=\"margin:16px 0;border:none;border-top:1px solid #E2E8F0\">");
    $("previewModal").classList.add("active");
  }

  async function generatePdf() {
    if (!requireAuth()) return;
    if (typeof html2canvas === "undefined" || !window.jspdf) {
      toast("PDF libraries failed to load.", "info");
      return;
    }
    var btn = $("generateBtn");
    btn.disabled = true;
    btn.textContent = t().generating || "Generating...";
    var box = $("pdfContainer");
    box.innerHTML = "";
    var withWm = !subscribed();
    try {
      var pages = reportHtml(withWm);
      var els = pages.map(function (html) {
        var el = document.createElement("div");
        el.style.cssText = "width:794px;min-height:1123px;padding:40px;background:#fff;color:#0A2463;box-sizing:border-box;position:relative;overflow:hidden;";
        el.innerHTML = html;
        box.appendChild(el);
        return el;
      });
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF("p", "mm", "a4");
      var w = pdf.internal.pageSize.getWidth();
      var h = pdf.internal.pageSize.getHeight();
      for (var i = 0; i < els.length; i++) {
        var canvas = await html2canvas(els[i], { scale: 2, useCORS: true, backgroundColor: "#fff", width: 794 });
        var imgW = w - 16;
        var imgH = (canvas.height * imgW) / canvas.width;
        if (i) pdf.addPage();
        var scale = imgH > (h - 16) ? (h - 16) / imgH : 1;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 8, 8, imgW * scale, imgH * scale);
      }
      var name = ($("projectName").value || "Field_Report").replace(/[<>:\"/\\|?*]/g, "_").slice(0, 40);
      pdf.save(name + "_" + ($("reportDate").value || "report") + ".pdf");
    } catch (e) {
      toast("PDF generation failed.", "error");
    } finally {
      box.innerHTML = "";
      btn.disabled = false;
      btn.textContent = t().generateBtn || "Generate PDF";
    }
  }

  /* ---------- reset on home ---------- */
  async function handleRecovery() {
    var q = new URLSearchParams(location.search);
    var hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    var token = q.get("token_hash") || hash.get("token_hash");
    var type = q.get("type") || hash.get("type");
    if (!token && type !== "recovery") return;
    var modal = $("resetPageModal");
    if (!modal) return;
    modal.classList.add("active");
    var status = $("resetPageStatus");
    var form = $("resetPageForm");
    try {
      if (token) {
        var otp = await supabase.auth.verifyOtp({ token_hash: token, type: type || "recovery" });
        if (otp.error) { status.textContent = otp.error.message; return; }
      }
      try { history.replaceState({}, "", "/"); } catch (e) {}
      status.textContent = "Choose a new password (minimum 6 characters).";
      form.style.display = "block";
    } catch (e) {
      status.textContent = "This reset link is invalid or has expired.";
    }
  }

  /* ---------- pricing ---------- */
  function updatePrices() {
    document.querySelectorAll(".plan-option").forEach(function (el) {
      var price = el.querySelector(".price");
      if (!price) return;
      if (yearly) price.innerHTML = "$" + el.dataset.yearly + ' <span style="font-size:13px;font-weight:500">/ year</span>';
      else price.innerHTML = "$" + el.dataset.monthly + ' <span style="font-size:13px;font-weight:500">/ month</span>';
    });
    $("labelMonthly").classList.toggle("active", !yearly);
    $("labelYearly").classList.toggle("active", yearly);
    $("billingToggle").classList.toggle("on", yearly);
  }
  function openPricing() {
    selected = null;
    document.querySelectorAll(".plan-option").forEach(function (el) { el.classList.remove("selected"); });
    $("proceedPaymentBtn").disabled = true;
    updatePrices();
    $("proModal").classList.add("active");
  }

  /* ---------- wire ---------- */
  function bind() {
    try { lang = localStorage.getItem("app_lang") || "en"; } catch (e) {}
    var sel = $("languageSelect");
    if (sel) {
      sel.value = lang;
      sel.addEventListener("change", function () { lang = sel.value; applyLang(); });
    }
    applyLang();
    if ($("copyrightYear")) $("copyrightYear").textContent = new Date().getFullYear();
    if ($("reportDate") && !$("reportDate").value) $("reportDate").value = new Date().toISOString().slice(0, 10);

    $("userAvatarBtn").addEventListener("click", function () {
      if (!user) { showAuth("login"); $("authModal").classList.add("active"); return; }
      $("userDropdown").classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (!$("userMenuWrap").contains(e.target) && e.target !== $("userAvatarBtn")) $("userDropdown").classList.remove("open");
    });
    $("logoutBtn").addEventListener("click", async function () {
      await supabase.auth.signOut();
      user = null; isPro = false; updateAuth();
      $("userDropdown").classList.remove("open");
    });

    $("closeAuth").addEventListener("click", function () { $("authModal").classList.remove("active"); });
    $("switchToRegister").addEventListener("click", function () { showAuth("register"); });
    $("switchToLogin").addEventListener("click", function () { showAuth("login"); });
    $("forgotPasswordLink").addEventListener("click", function () { showAuth("reset"); });
    $("backToLoginLink").addEventListener("click", function () { showAuth("login"); });

    document.querySelectorAll(".pw-eye").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = $(btn.getAttribute("data-target"));
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
      });
    });

    $("loginBtn").addEventListener("click", async function () {
      var email = $("authEmail").value.trim().toLowerCase();
      var password = $("authPassword").value;
      var err = $("authError");
      err.textContent = "";
      if (!email || !password) { err.textContent = "Email and password are required."; return; }
      var res = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (res.error) { err.textContent = res.error.message; return; }
      user = res.data.user;
      $("authModal").classList.remove("active");
      updateAuth();
      toast("Signed in.", "success");
    });

    $("registerBtn").addEventListener("click", async function () {
      var email = $("regEmail").value.trim().toLowerCase();
      var password = $("regPassword").value;
      var err = $("regError");
      err.textContent = "";
      if (!email || password.length < 6) { err.textContent = "A valid email and password (minimum 6 characters) are required."; return; }
      var btn = $("registerBtn");
      btn.disabled = true;
      try {
        var res = await supabase.auth.signUp({ email: email, password: password });
        if (res.error) { err.textContent = res.error.message; return; }
        if (res.data.session) {
          user = res.data.user;
          $("authModal").classList.remove("active");
          updateAuth();
          toast("Account created.", "success");
        } else {
          err.style.color = "#059669";
          err.textContent = "Account created. You can sign in now.";
        }
      } finally { btn.disabled = false; }
    });

    $("sendResetBtn").addEventListener("click", async function () {
      var email = $("resetEmail").value.trim().toLowerCase();
      var err = $("resetError");
      err.style.color = "#DC2626";
      err.textContent = "";
      if (!email) { err.textContent = "Please enter your email."; return; }
      var res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://app.nbrpglobal.com/" });
      if (res.error) { err.textContent = res.error.message; return; }
      err.style.color = "#059669";
      err.textContent = "Password reset email sent.";
    });

    $("resetUpdateBtn").addEventListener("click", async function () {
      var err = $("resetPageError");
      err.textContent = "";
      var p1 = $("resetNewPassword").value;
      var p2 = $("resetConfirmPassword").value;
      if (!p1 || p1.length < 6) { err.textContent = "Password must be at least 6 characters."; return; }
      if (p1 !== p2) { err.textContent = "Passwords do not match."; return; }
      var res = await supabase.auth.updateUser({ password: p1 });
      if (res.error) { err.textContent = res.error.message; return; }
      $("resetPageForm").style.display = "none";
      $("resetPageStatus").textContent = "";
      $("resetPageDone").style.display = "block";
    });
    $("resetDoneSignIn").addEventListener("click", function () {
      $("resetPageModal").classList.remove("active");
      showAuth("login");
      $("authModal").classList.add("active");
    });

    $("addPhotoBtn").addEventListener("click", function () { $("photoModal").classList.add("active"); });
    $("closeModal").addEventListener("click", function () { $("photoModal").classList.remove("active"); });
    $("cameraBtn").addEventListener("click", function () { $("photoModal").classList.remove("active"); $("cameraInput").click(); });
    $("galleryBtn").addEventListener("click", function () { $("photoModal").classList.remove("active"); $("galleryInput").click(); });
    $("cameraInput").addEventListener("change", function (e) { addPhotoFile(e.target.files[0]); e.target.value = ""; });
    $("galleryInput").addEventListener("change", function (e) { addPhotoFile(e.target.files[0]); e.target.value = ""; });

    $("proLogoBtn").addEventListener("click", function () { if (!$("proLogo").disabled) $("proLogo").click(); });
    $("proLogo").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        customLogo = r.result;
        var img = $("proLogoPreview");
        img.src = customLogo;
        img.style.display = "block";
      };
      r.readAsDataURL(f);
    });

    ["projectName", "clientName", "reportedBy", "reportDate", "location", "weather", "observations", "reportNumber", "disclaimer"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    $("saveCloudBtn").addEventListener("click", saveCloud);
    $("previewBtn").addEventListener("click", openPreview);
    $("generateBtn").addEventListener("click", generatePdf);
    $("previewClose").addEventListener("click", function () { $("previewModal").classList.remove("active"); });
    $("previewCloseBtn").addEventListener("click", function () { $("previewModal").classList.remove("active"); });

    $("proLink").addEventListener("click", openPricing);
    $("closePro").addEventListener("click", function () { $("proModal").classList.remove("active"); });
    $("billingToggle").addEventListener("click", function () { yearly = !yearly; updatePrices(); });
    document.querySelectorAll(".plan-option").forEach(function (el) {
      el.addEventListener("click", function () {
        document.querySelectorAll(".plan-option").forEach(function (x) { x.classList.remove("selected"); });
        el.classList.add("selected");
        selected = el.dataset.plan;
        $("proceedPaymentBtn").disabled = false;
      });
    });
    $("proceedPaymentBtn").addEventListener("click", function () {
      if (!selected) return;
      var url = selected === "pro" ? (yearly ? LINKS.pro_y : LINKS.pro_m) : (yearly ? LINKS.standard_y : LINKS.standard_m);
      window.location.href = url;
    });

    $("footerPrivacy").addEventListener("click", function () { $("privacyModal").classList.add("active"); });
    $("footerTerms").addEventListener("click", function () { $("termsModal").classList.add("active"); });
    $("closePrivacy").addEventListener("click", function () { $("privacyModal").classList.remove("active"); });
    $("closeTerms").addEventListener("click", function () { $("termsModal").classList.remove("active"); });

    loadDraft();
    handleRecovery();
    supabase.auth.getSession().then(function (res) {
      if (res.data.session) { user = res.data.session.user; updateAuth(); }
    });
    supabase.auth.onAuthStateChange(function (_e, session) {
      user = session ? session.user : null;
      updateAuth();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
