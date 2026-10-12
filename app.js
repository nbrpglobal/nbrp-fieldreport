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

  /* ---- Device fingerprint (canvas + WebGL + hardware signals) ---- */
  function fnv1aHash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function collectDeviceFingerprint() {
    var parts = [];
    try {
      parts.push(navigator.userAgent || "");
      parts.push(navigator.language || "");
      parts.push(String(navigator.language || "") + "," + ((navigator.languages || []).join(",")));
      parts.push(String(screen.width) + "x" + String(screen.height) + "x" + String(screen.colorDepth));
      parts.push(String(window.devicePixelRatio || 1));
      parts.push(String(new Date().getTimezoneOffset()));
      parts.push(String(navigator.hardwareConcurrency || 0));
      parts.push(String(navigator.maxTouchPoints || 0));
      parts.push(String(navigator.platform || ""));
      parts.push(String(navigator.vendor || ""));
      try {
        var cv = document.createElement("canvas");
        cv.width = 200; cv.height = 50;
        var ctx = cv.getContext("2d");
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillStyle = "#f60";
        ctx.fillRect(0, 0, 120, 50);
        ctx.fillStyle = "#069";
        ctx.fillText("NBRP-FP-1.0", 2, 15);
        ctx.fillStyle = "rgba(102,204,0,0.7)";
        ctx.fillText("NBRP-FP-1.0", 4, 17);
        parts.push(cv.toDataURL());
      } catch (e1) { parts.push("canvas_err"); }
      try {
        var c2 = document.createElement("canvas");
        var gl = c2.getContext("webgl") || c2.getContext("experimental-webgl");
        if (gl) {
          var dbg = gl.getExtension("WEBGL_debug_renderer_info");
          parts.push(gl.getParameter(gl.VENDOR) || "");
          parts.push(gl.getParameter(gl.RENDERER) || "");
          if (dbg) {
            parts.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
            parts.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
          }
        } else parts.push("no_webgl");
      } catch (e2) { parts.push("webgl_err"); }
    } catch (e) { parts.push("fp_err"); }
    return fnv1aHash(parts.join("||"));
  }

  var DEVICE_FP = "";
  try { DEVICE_FP = collectDeviceFingerprint(); } catch (e) { DEVICE_FP = "unknown"; }
  function showToast(message, type) {
    var host = document.getElementById("toastHost");
    if (!host) { console.log(type, message); return; }
    var el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4500);
  }
  async function resolveDeviceId() {
    try {
      if (window.FingerprintJS) {
        var fpAgent = await window.FingerprintJS.load();
        var result = await fpAgent.get();
        if (result && result.visitorId) { DEVICE_FP = result.visitorId; return DEVICE_FP; }
      }
    } catch (e) { console.warn("FingerprintJS failed", e); }
    try { DEVICE_FP = collectDeviceFingerprint(); } catch (e2) { DEVICE_FP = "unknown"; }
    return DEVICE_FP;
  }




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

  /* Load Stripe Payment Links from Supabase app_config (data-driven)
     DB keys use plan_* prefix; runtime keys are short-form standard_monthly etc. */
  async function loadPaymentLinks() {
    try {
      var res = await supabase.from("app_config").select("key,value");
      if (res.error) {
        console.warn("loadPaymentLinks error", res.error);
        return false;
      }
      if (!res.data || !res.data.length) {
        console.warn("loadPaymentLinks: no rows in app_config");
        return false;
      }
      var map = {
        plan_standard_monthly: "standard_monthly",
        plan_standard_yearly: "standard_yearly",
        plan_pro_monthly: "pro_monthly",
        plan_pro_yearly: "pro_yearly",
        /* also accept short keys if present in DB */
        standard_monthly: "standard_monthly",
        standard_yearly: "standard_yearly",
        pro_monthly: "pro_monthly",
        pro_yearly: "pro_yearly"
      };
      res.data.forEach(function (row) {
        if (!row || !row.key || !row.value) return;
        var k = map[row.key];
        if (!k && row.key.indexOf("plan_") === 0) {
          k = row.key.slice(5); /* plan_standard_monthly -> standard_monthly */
        }
        if (k) STRIPE_PAYMENT_LINKS[k] = String(row.value).trim();
      });
      return true;
    } catch (e) {
      console.warn("loadPaymentLinks", e);
      return false;
    }
  }

  function getStripePaymentUrl(plan, interval) {
    /* interval: "month"|"year" from UI → yearly/monthly suffix */
    var shortKey = plan + "_" + (interval === "year" ? "yearly" : "monthly");
    var url = STRIPE_PAYMENT_LINKS[shortKey];
    if (url) return url;
    /* fallback: plan_ prefix form */
    var planKey = "plan_" + shortKey;
    return STRIPE_PAYMENT_LINKS[shortKey] || STRIPE_PAYMENT_LINKS[planKey] || "";
  }

  function isAuthenticated() {
    return !!(currentUser && currentUser.id) || isAdmin();
  }

  function requireAuth(actionName) {
    if (isAuthenticated()) return true;
    showToast("Please login or register to " + (actionName || "continue", "info") + ".");
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

  /* ---- Registration helpers (must exist or Create Account throws silently) ---- */
  var TEMP_EMAIL_DOMAINS = [
    "mailinator.com", "guerrillamail.com", "tempmail.com", "10minutemail.com",
    "throwaway.email", "yopmail.com", "trashmail.com", "temp-mail.org",
    "sharklasers.com", "getnada.com", "maildrop.cc"
  ];

  function isTempEmail(email) {
    if (!email || email.indexOf("@") < 0) return false;
    var domain = email.split("@").pop().toLowerCase();
    return TEMP_EMAIL_DOMAINS.indexOf(domain) !== -1;
  }

  function normalizePhone(countryCode, local) {
    var digits = String(local || "").replace(/\D/g, "");
    var code = String(countryCode || "").replace(/\s/g, "");
    if (!code) code = "+1";
    if (code.charAt(0) !== "+") code = "+" + code;
    return code + digits;
  }

  /* Expected national number length ranges by country calling code (E.164 local part) */
  var PHONE_LEN = {
    "+1": [10, 10], "+44": [10, 10], "+49": [10, 12], "+41": [9, 9], "+33": [9, 9],
    "+31": [9, 9], "+353": [9, 9], "+46": [7, 10], "+47": [8, 8], "+61": [9, 9],
    "+64": [8, 10], "+60": [9, 10], "+65": [8, 8], "+886": [9, 9], "+852": [8, 8],
    "+853": [8, 8], "+81": [10, 11], "+82": [9, 11], "+86": [11, 11], "+971": [9, 9],
    "+966": [9, 9], "+974": [8, 8], "+965": [8, 8], "+34": [9, 9], "+66": [9, 9],
    "+52": [10, 10], "+54": [10, 11], "+57": [10, 10]
  };

  /* Common VoIP / burner / high-risk prefixes (national digits after country code) */
  var BURNER_PREFIXES = {
    "+1": ["456", "455", "445", "464", "474", "484", "494"], /* common US VoIP/fake ranges used in tests */
    "+44": ["70", "77"],
    "+60": ["11"]
  };

  function isSequentialOrRepeatedDigits(digits) {
    if (!digits || digits.length < 6) return true;
    /* all same digit: 00000000, 11111111 */
    if (/^(\d)\1+$/.test(digits)) return true;
    /* pure ascending or descending sequences */
    var asc = "01234567890123456789";
    var desc = "98765432109876543210";
    if (asc.indexOf(digits) !== -1 || desc.indexOf(digits) !== -1) return true;
    /* repeated pairs like 12121212 */
    if (digits.length >= 6 && /^(\d{2})\1+$/.test(digits)) return true;
    if (digits.length >= 6 && /^(\d{3})\1+$/.test(digits)) return true;
    return false;
  }

  /**
   * Validate national number for selected country before any Supabase call.
   * Returns { ok: true, e164: "+60123456789" } or { ok: false, error: "..." }
   */
  function validatePhoneForRegistration(countryCode, local) {
    var code = String(countryCode || "").replace(/\s/g, "");
    if (!code) code = "+1";
    if (code.charAt(0) !== "+") code = "+" + code;

    var raw = String(local || "").trim();
    if (!raw) {
      return { ok: false, error: "Phone number is required for registration." };
    }
    /* reject letters / symbols other than spaces, dashes, parentheses */
    if (/[A-Za-z]/.test(raw)) {
      return { ok: false, error: "Phone number must contain digits only." };
    }

    var digits = raw.replace(/\D/g, "");
    /* strip leading 0 trunk prefix for many countries */
    if (digits.charAt(0) === "0" && code !== "+39") {
      digits = digits.replace(/^0+/, "");
    }
    /* US/CA: user may paste 1 + 10 digits */
    if (code === "+1" && digits.length === 11 && digits.charAt(0) === "1") {
      digits = digits.slice(1);
    }

    var range = PHONE_LEN[code] || [8, 12];
    var minL = range[0], maxL = range[1];
    if (digits.length < minL || digits.length > maxL) {
      return {
        ok: false,
        error: "Enter a valid phone number for " + code + " (" + minL + (minL === maxL ? "" : "–" + maxL) + " digits)."
      };
    }

    /* E.164 total length must be <= 15 */
    var e164 = code + digits;
    var e164Digits = e164.replace(/\D/g, "");
    if (e164Digits.length < 8 || e164Digits.length > 15) {
      return { ok: false, error: "Phone number is not a valid international (E.164) number." };
    }

    if (isSequentialOrRepeatedDigits(digits)) {
      return { ok: false, error: "Please enter a real mobile number (sequential or repeated digits are not allowed)." };
    }

    /* block NANP area codes starting with 0/1 */
    if (code === "+1") {
      var area = digits.slice(0, 3);
      if (area.charAt(0) === "0" || area.charAt(0) === "1") {
        return { ok: false, error: "Please enter a valid North American mobile number." };
      }
      var exchange = digits.slice(3, 6);
      if (exchange.charAt(0) === "0" || exchange.charAt(0) === "1") {
        return { ok: false, error: "Please enter a valid North American mobile number." };
      }
    }

    var prefixes = BURNER_PREFIXES[code];
    if (prefixes) {
      for (var i = 0; i < prefixes.length; i++) {
        if (digits.indexOf(prefixes[i]) === 0) {
          return { ok: false, error: "VoIP or temporary numbers are not accepted. Please use a personal mobile number." };
        }
      }
    }

    return { ok: true, e164: e164, digits: digits, code: code };
  }

  function isPhoneOnCooldown(full) {
    /* true = BLOCKED */
    if (isAdmin()) return false;
    var v = localStorage.getItem("cool_phone_" + full);
    if (!v) return false;
    return Date.now() - parseInt(v, 10) < PHONE_COOLDOWN_MS;
  }

  function recordPhone(full) {
    setPhoneCooldown(full);
    try {
      localStorage.setItem("fieldReport_lastPhone", full);
    } catch (e) {}
  }

  function hasDeviceTrialUsed() {
    try {
      return localStorage.getItem("fieldReport_deviceTrialUsed") === "1";
    } catch (e) {
      return false;
    }
  }

  function markDeviceTrial() {
    try {
      localStorage.setItem("fieldReport_deviceTrialUsed", "1");
    } catch (e) {}
  }

  /* ---- 14-day free trial + paywall ---- */
  var TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

  function getTrialStartedAt() {
    try {
      var v = localStorage.getItem("fieldReport_trialStartedAt");
      return v ? parseInt(v, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  function startTrialIfNeeded() {
    if (isAdmin() || isProUser()) return;
    try {
      if (!localStorage.getItem("fieldReport_trialStartedAt")) {
        localStorage.setItem("fieldReport_trialStartedAt", String(Date.now()));
      }
    } catch (e) {}
  }

  function isTrialExpired() {
    if (isAdmin() || isProUser()) return false;
    var started = getTrialStartedAt();
    if (!started) return false; /* not started yet */
    return Date.now() - started >= TRIAL_MS;
  }

  function daysLeftInTrial() {
    var started = getTrialStartedAt();
    if (!started) return 14;
    var left = Math.ceil((TRIAL_MS - (Date.now() - started)) / (24 * 60 * 60 * 1000));
    return left > 0 ? left : 0;
  }

  function showPaywall(reason) {
    var el = document.getElementById("paywallModal");
    var msg = document.getElementById("paywallMessage");
    if (msg) {
      msg.textContent = reason || "Your 14-day free trial has ended. Subscribe to continue using Field Report.";
    }
    if (el) {
      el.classList.add("active");
      el.setAttribute("data-locked", "1");
    } else {
      showToast(reason || "Your 14-day free trial has ended. Please subscribe.", "info");
      openPricing();
    }
  }

  function hidePaywall() {
    var el = document.getElementById("paywallModal");
    if (el && el.getAttribute("data-locked") !== "1") {
      el.classList.remove("active");
    }
  }


  /* Server-side access state (profiles.trial_started_at / is_pro) */
  window.__access = { loaded: false, trial_expired: false, is_pro: false, days_left: 14 };

  async function refreshAccessFromServer() {
    window.__access.loaded = false;
    try {
      var sessionRes = await supabase.auth.getSession();
      if (!sessionRes.data.session) {
        window.__access = { loaded: true, trial_expired: false, is_pro: false, days_left: 14 };
        return window.__access;
      }
      var res = await supabase.rpc("get_my_access");
      if (res.error) {
        console.warn("get_my_access", res.error);
        window.__access = { loaded: true, trial_expired: false, is_pro: isAdmin() || isProUser(), days_left: 14 };
        return window.__access;
      }
      var d = res.data || {};
      window.__access = {
        loaded: true,
        trial_expired: d.trial_expired === true,
        is_pro: d.is_pro === true,
        days_left: d.days_left,
        plan: d.plan,
        trial_started_at: d.trial_started_at
      };
      if (d.is_pro) {
        try { localStorage.setItem("fieldReport_isPro", "1"); } catch (e) {}
        unlockProFeatures();
      }
      return window.__access;
    } catch (e) {
      console.warn(e);
      window.__access = { loaded: true, trial_expired: false, is_pro: isAdmin(), days_left: 14 };
      return window.__access;
    }
  }

  async function enforceTrialOrPaywall() {
    if (isAdmin()) return true;
    var access = await refreshAccessFromServer();
    if (access.is_pro) return true;
    if (access.trial_expired) {
      showPaywall("Your 14-day free trial has ended. Subscribe to continue using Field Report.");
      return false;
    }
    return true;
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
    if (!(await enforceTrialOrPaywall())) return;
    var btn = document.getElementById("saveCloudBtn");
    var dict = t();
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      var ok = await saveReportToCloud();
      if (ok) {
        showToast(dict.cloudSaved || "Report saved to cloud", "info");
      }
    } catch (err) {
      console.error(err);
      showToast((dict.cloudError || "Cloud save failed", "info") + (err && err.message ? ": " + err.message : ""));
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
  document.getElementById("previewBtn").addEventListener("click", async function () {
    if (!requireAuth("Preview Report")) return;
    if (!(await enforceTrialOrPaywall())) return;
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


  function watermarkHtml() {
    if (isAdmin() || isProUser()) return "";
    return (
      '<div style="position:absolute;inset:0;pointer-events:none;z-index:8;overflow:hidden;display:flex;align-items:center;justify-content:center;">' +
        '<div style="transform:rotate(-32deg);font-size:160px;font-weight:800;letter-spacing:10px;white-space:nowrap;line-height:1;' +
        'color:rgba(255,255,255,0.78);' +
        '-webkit-text-stroke:3px rgba(10,36,99,0.55);' +
        'text-shadow:0 0 6px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.7);">' +
        'PREVIEW</div>' +
      '</div>'
    );
  }

  document.getElementById("generateBtn").addEventListener("click", async function () {
    if (!requireAuth("Generate PDF")) return;
    if (!(await enforceTrialOrPaywall())) return;
    var dict = t();
    if (typeof html2canvas === "undefined" || !window.jspdf || !window.jspdf.jsPDF) {
      showToast("PDF libraries failed to load. Please check your internet connection and try again.", "info");
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
      page.style.cssText = "position:relative;width:794px;min-height:1123px;padding:40px;background:#fff;color:#0A2463;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-sizing:border-box;overflow:hidden;";
      page.innerHTML = inner + watermarkHtml();
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
      showToast("PDF generation failed. " + (err && err.message ? err.message : "Please try again.", "info"));
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
    var conf = document.getElementById("authViewConfirm");
    if (conf) conf.style.display = "none";
  }
  function showAuthConfirmView(email) {
    hideAllAuthViews();
    var conf = document.getElementById("authViewConfirm");
    if (conf) conf.style.display = "block";
    var em = document.getElementById("confirmEmailDisplay");
    if (em) em.textContent = email || "";
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
  var confirmBack = document.getElementById("confirmBackToLogin");
  if (confirmBack) {
    confirmBack.addEventListener("click", function () { showAuthLoginView(); });
  }
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
        redirectTo: "https://app.nbrpglobal.com/reset-password.html"
      });
      if (res.error) {
        err.textContent = res.error.message;
        return;
      }
      err.style.color = "#059669";
      err.textContent = "Password reset email sent!";
      showToast("Password reset email sent!", "info");
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
    var btn = document.getElementById("registerBtn");
    var title = document.getElementById("authRegisterTitle");
    if (title) title.textContent = (t().authCreateAccount || "Create Account");
    var email = document.getElementById("regEmail").value.trim().toLowerCase();
    var password = document.getElementById("regPassword").value;
    var err = document.getElementById("regError");
    err.style.color = "#DC2626";
    err.textContent = "";
    var originalLabel = btn.textContent;
    try {
      if (!email || password.length < 6) {
        err.textContent = "A valid email and password (minimum 6 characters) are required.";
        return;
      }
      if (isTempEmail(email)) {
        err.textContent = "Temporary email addresses are not permitted. Please use a permanent email address.";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Creating…";
      var res = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (res.error) {
        var msg = res.error.message || "Registration failed.";
        if (/already|registered|exists/i.test(msg)) {
          msg = "This email address is already registered. Please sign in.";
        }
        err.textContent = msg;
        showToast(msg, "error");
        return;
      }
      if (!res.data.session) {
        currentUser = null;
        showAuthConfirmView(email);
        showToast("A confirmation email has been sent. Please verify your address before signing in.", "success");
        return;
      }
      currentUser = res.data.user || res.data.session.user;
      if (isAdmin()) unlockProFeatures();
      await refreshAccessFromServer();
      updateAuthUI();
      document.getElementById("authModal").classList.remove("active");
      showAuthLoginView();
      showToast("Account created.", "success");
    } catch (ex) {
      console.error("Register error:", ex);
      err.style.color = "#DC2626";
      err.textContent = "Registration failed. Please try again.";
      showToast(err.textContent, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel || "Create Account";
    }
  });

  /* Password show/hide */
  document.querySelectorAll(".pw-eye").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-target");
      var input = document.getElementById(id);
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.innerHTML = show
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });

  document.getElementById("loginBtn").addEventListener("click", async function () {
    var title = document.getElementById("authTitle");
    if (title) title.textContent = (t().authSignIn || "Sign In");

    var email = document.getElementById("authEmail").value.trim().toLowerCase();
    var password = document.getElementById("authPassword").value;
    var err = document.getElementById("authError");
    if (!email || !password) { err.textContent = "Email and password required"; return; }
    var res = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (res.error) {
      var emsg = res.error.message || "Sign in failed";
      if (/confirm|not confirmed|email not confirmed/i.test(emsg)) {
        emsg = "Please confirm your email before signing in. Check your inbox for the link.";
        showAuthConfirmView(email);
      }
      err.textContent = emsg;
      showToast(emsg, "error");
      return;
    }
    if (!res.data.session) {
      err.textContent = "Please confirm your email before signing in.";
      showAuthConfirmView(email);
      showToast(err.textContent, "error");
      return;
    }
    currentUser = res.data.user;
    try {
      var pendingPhone = sessionStorage.getItem("pending_claim_phone");
      var pendingDev = sessionStorage.getItem("pending_claim_device");
      if (pendingPhone) {
        var claim = await supabase.rpc("claim_phone_for_trial", { p_phone: pendingPhone });
        sessionStorage.removeItem("pending_claim_phone");
        if (claim.data && claim.data.ok === false) {
          showToast(claim.data.error || "This phone number was already used for a free trial recently.", "info");
        }
      }
      if (pendingDev || DEVICE_FP) {
        var claimDev = await supabase.rpc("claim_device_for_trial", {
          p_fingerprint: pendingDev || DEVICE_FP,
          p_user_agent: navigator.userAgent || ""
        });
        sessionStorage.removeItem("pending_claim_device");
        if (claimDev.data && claimDev.data.ok === false) {
          showToast(claimDev.data.error || "This device has already used a free trial.", "info");
        }
      }
    } catch (e2) {}
    await refreshAccessFromServer();
    updateAuthUI();
    document.getElementById("authModal").classList.remove("active");
    if (window.__access && window.__access.trial_expired && !window.__access.is_pro) {
      showPaywall();
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async function () {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById("userDropdown").classList.remove("open");
    updateAuthUI();
  });

  function updateExportHint() {
    var hint = document.getElementById("exportHint");
    if (!hint) return;
    var free = !(isAdmin() || isProUser());
    hint.style.display = free ? "block" : "none";
  }

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
    updateExportHint();
  }

  loadPaymentLinks();

  updateExportHint();

  supabase.auth.getSession().then(async function (res) {
    if (res.data.session) {
      currentUser = res.data.session.user;
      await refreshAccessFromServer();
      updateAuthUI();
      if (window.__access && window.__access.trial_expired && !window.__access.is_pro) {
        showPaywall();
      }
    }
  });
  supabase.auth.onAuthStateChange(async function (event, session) {
    currentUser = session ? session.user : null;
    if (session) await refreshAccessFromServer();
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
  var paywallSub = document.getElementById("paywallSubscribeBtn");
  if (paywallSub) {
    paywallSub.addEventListener("click", function () {
      var el = document.getElementById("paywallModal");
      if (el) { el.setAttribute("data-locked", "0"); el.classList.remove("active"); }
      openPricing();
    });
  }
  var paywallSignIn = document.getElementById("paywallSignInBtn");
  if (paywallSignIn) {
    paywallSignIn.addEventListener("click", function () {
      var el = document.getElementById("paywallModal");
      if (el) { el.setAttribute("data-locked", "0"); el.classList.remove("active"); }
      showAuthLoginView();
      document.getElementById("authModal").classList.add("active");
    });
  }
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
    var url = getStripePaymentUrl(selectedPlan.plan, selectedPlan.interval);
    if (!url) {
      await loadPaymentLinks();
      url = getStripePaymentUrl(selectedPlan.plan, selectedPlan.interval);
    }
    if (!url) {
      showToast("Payment link unavailable. Check Supabase app_config payment links.", "error");
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
          showToast("Custom logo is available on the Pro plan. Upgrade to unlock.", "info");
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
