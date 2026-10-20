/**
 * Claim Your Spot — registration request form.
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-claim-registration]");
  if (!form || !(form instanceof HTMLFormElement)) return;

  var submitting = false;
  var submittedOnce = false;
  var submitBtn = form.querySelector('[type="submit"]');
  var feedback = document.querySelector("[data-claim-feedback]");
  var phoneInput = form.querySelector("[data-claim-phone]");
  var phoneE164 = form.querySelector("[data-phone-e164]");
  var experienceSelect = form.querySelector("[data-claim-experience]");
  var iti = null;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var SUCCESS_MESSAGE =
    "Thank you! Your registration request has been received. Our team will follow up with secure deposit payment instructions by email and text. Your spot is not confirmed until your deposit has been received and accepted.";
  var UNAVAILABLE_DETAIL =
    "This form is temporarily unavailable. Please try again shortly, or email info@elitetravelsportsusa.com.";

  function isUnavailableError(message) {
    return /temporarily unavailable|spam protection is not configured|email service is not configured/i.test(
      message || "",
    );
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.classList.remove("inquiry-form-feedback--success", "inquiry-form-feedback--error");
    feedback.textContent = "";
    feedback.removeAttribute("tabindex");
    feedback.removeAttribute("role");
  }

  function showFeedback(kind, title, detail) {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.remove("inquiry-form-feedback--success", "inquiry-form-feedback--error");
    feedback.classList.add(
      kind === "success" ? "inquiry-form-feedback--success" : "inquiry-form-feedback--error",
    );
    feedback.setAttribute("role", kind === "success" ? "status" : "alert");
    feedback.setAttribute("tabindex", "-1");
    feedback.innerHTML = "";
    var strong = document.createElement("strong");
    strong.textContent = title;
    feedback.appendChild(strong);
    if (detail) {
      var p = document.createElement("p");
      p.textContent = detail;
      feedback.appendChild(p);
    }
    feedback.focus();
  }

  function clearFieldErrors() {
    form.querySelectorAll(".form-field.is-invalid, .sms-consent.is-invalid").forEach(function (el) {
      el.classList.remove("is-invalid");
    });
  }

  function markInvalid(el) {
    if (el) el.classList.add("is-invalid");
  }

  function preselectExperience() {
    if (!experienceSelect) return;
    var params = new URLSearchParams(window.location.search);
    var slug = (params.get("experience") || "").trim();
    if (!slug) return;
    var option = Array.prototype.find.call(experienceSelect.options, function (opt) {
      return opt.value === slug;
    });
    if (option) experienceSelect.value = slug;
  }

  function initPhone() {
    if (!phoneInput || !window.intlTelInput) return;
    iti = window.intlTelInput(phoneInput, {
      initialCountry: "us",
      countryOrder: ["us", "ca", "gb", "au", "fr", "es", "pt", "it", "jp", "ma", "hr"],
      nationalMode: false,
      strictMode: true,
      autoPlaceholder: "aggressive",
      formatOnDisplay: true,
      loadUtils: function () {
        return import("https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.1/build/js/utils.js");
      },
    });
  }

  function syncPhoneE164() {
    if (!phoneE164) return "";
    if (iti && typeof iti.isValidNumber === "function" && iti.isValidNumber()) {
      phoneE164.value = iti.getNumber();
      return phoneE164.value;
    }
    phoneE164.value = "";
    return "";
  }

  function validate() {
    clearFieldErrors();
    var ok = true;
    var nameInput = form.querySelector('[name="name"]');
    var emailInput = form.querySelector('[name="email"]');
    var consent = form.querySelector('[name="sms_registration_consent"]');

    var nameVal = nameInput ? nameInput.value.trim() : "";
    if (!nameVal || nameVal.length < 2 || !/\S/.test(nameVal)) {
      ok = false;
      markInvalid(nameInput && nameInput.closest(".form-field"));
    }

    var emailVal = emailInput ? emailInput.value.trim() : "";
    if (!emailVal || !EMAIL_PATTERN.test(emailVal)) {
      ok = false;
      markInvalid(emailInput && emailInput.closest(".form-field"));
    }

    var e164 = syncPhoneE164();
    var phoneOk = Boolean(e164);
    if (!phoneOk && iti && typeof iti.isValidNumberPrecise === "function") {
      phoneOk = iti.isValidNumberPrecise();
      if (phoneOk) e164 = iti.getNumber();
    }
    if (!phoneOk) {
      ok = false;
      markInvalid(phoneInput && phoneInput.closest(".form-field"));
    } else if (phoneE164) {
      phoneE164.value = e164;
    }

    if (!experienceSelect || !experienceSelect.value) {
      ok = false;
      markInvalid(experienceSelect && experienceSelect.closest(".form-field"));
    }

    if (!consent || !consent.checked) {
      ok = false;
      markInvalid(consent && consent.closest(".sms-consent"));
    }

    if (!ok) {
      showFeedback(
        "error",
        "Please complete the highlighted fields.",
        "Full name, a valid email address, a cell phone number, experience selection, and text-message consent are required.",
      );
    }
    return ok;
  }

  function setBusy(busy) {
    submitting = busy;
    if (submitBtn) {
      submitBtn.disabled = busy || submittedOnce;
      submitBtn.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }

  async function getRecaptchaConfig() {
    if (window.__eliteRecaptchaConfig) return window.__eliteRecaptchaConfig;
    try {
      var res = await fetch("/api/public-config", { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      window.__eliteRecaptchaConfig = await res.json();
      return window.__eliteRecaptchaConfig;
    } catch {
      return null;
    }
  }

  function loadRecaptcha(siteKey) {
    if (window.grecaptcha && typeof window.grecaptcha.execute === "function") {
      return Promise.resolve(window.grecaptcha);
    }
    if (window.__eliteRecaptchaPromise) return window.__eliteRecaptchaPromise;
    window.__eliteRecaptchaPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(siteKey);
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.grecaptcha) resolve(window.grecaptcha);
        else reject(new Error("reCAPTCHA did not load."));
      };
      script.onerror = function () {
        reject(new Error("reCAPTCHA could not be loaded."));
      };
      document.head.appendChild(script);
    });
    return window.__eliteRecaptchaPromise;
  }

  async function getRecaptchaToken() {
    var config = await getRecaptchaConfig();
    if (!config || !config.recaptchaSiteKey) return "";
    var recaptcha = await loadRecaptcha(config.recaptchaSiteKey);
    return new Promise(function (resolve, reject) {
      recaptcha.ready(function () {
        recaptcha
          .execute(config.recaptchaSiteKey, {
            action: config.recaptchaAction || "submit_inquiry",
          })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideFeedback();
    if (submittedOnce) {
      showFeedback("success", SUCCESS_MESSAGE);
      return;
    }

    var endpoint = (form.getAttribute("action") || "").trim();
    if (!endpoint) {
      showFeedback(
        "error",
        "This form cannot be sent right now.",
        "Please try again shortly or reach us directly at info@elitetravelsportsusa.com.",
      );
      return;
    }

    if (submitting) return;
    if (!validate()) return;

    setBusy(true);
    try {
      var formData = new FormData(form);
      var payload = Object.fromEntries(formData.entries());
      payload.sms_registration_consent = form.querySelector('[name="sms_registration_consent"]').checked
        ? "Yes"
        : "No";
      payload.phone_e164 = syncPhoneE164() || payload.phone_e164 || "";

      // Same /api/public-config + RECAPTCHA_SITE_KEY path as Plan a Journey.
      var recaptchaConfig = await getRecaptchaConfig();
      if (!recaptchaConfig || !recaptchaConfig.recaptchaSiteKey) {
        showFeedback("error", "Registration is temporarily unavailable.", UNAVAILABLE_DETAIL);
        return;
      }

      payload.recaptcha_token = await getRecaptchaToken();

      var res = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      var data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON */
      }

      if (res.ok && data && data.ok) {
        submittedOnce = true;
        showFeedback("success", SUCCESS_MESSAGE);
        form.reset();
        if (iti) iti.setNumber("");
        if (phoneE164) phoneE164.value = "";
        clearFieldErrors();
        preselectExperience();
        setBusy(false);
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      var errMsg =
        (data && typeof data.error === "string" && data.error) ||
        "Something went wrong. Please try again in a moment, or reach us directly at info@elitetravelsportsusa.com.";
      if (isUnavailableError(errMsg)) {
        showFeedback("error", "Registration is temporarily unavailable.", UNAVAILABLE_DETAIL);
      } else {
        showFeedback("error", "We could not send your registration request.", errMsg);
      }
    } catch {
      showFeedback(
        "error",
        "We could not send your registration request.",
        "Your connection may have dropped. Try again shortly, or email info@elitetravelsportsusa.com.",
      );
    } finally {
      if (!submittedOnce) setBusy(false);
    }
  });

  preselectExperience();

  if (document.body && document.body.getAttribute("data-has-eligible-trips") === "false") {
    if (submitBtn) submitBtn.disabled = true;
    showFeedback(
      "error",
      "Registration is not open right now.",
      "There are no Elite experiences currently accepting registration requests. Please check back later or email info@elitetravelsportsusa.com.",
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPhone);
  } else {
    initPhone();
  }
})();
