/**
 * Morocco year-round programs — dedicated inquiry form with blocked-date validation.
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-morocco-program-form]");
  var itineraryPanels = document.querySelectorAll(".morocco-program-details");

  itineraryPanels.forEach(function (panel) {
    panel.addEventListener("toggle", function () {
      if (!panel.open) return;

      itineraryPanels.forEach(function (otherPanel) {
        if (otherPanel !== panel) otherPanel.open = false;
      });
    });
  });

  function openPanelFromHash() {
    var id = window.location.hash ? window.location.hash.slice(1) : "";
    if (!id) return;

    var panel = document.getElementById(id);
    if (!panel) return;

    if (!panel.classList.contains("morocco-program-details")) {
      panel.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    itineraryPanels.forEach(function (otherPanel) {
      otherPanel.open = otherPanel === panel;
    });
    panel.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  openPanelFromHash();
  window.addEventListener("hashchange", openPanelFromHash);

  if (!form || !(form instanceof HTMLFormElement)) return;

  var feedback = document.querySelector("[data-morocco-feedback]");
  var submitBtn = form.querySelector('[type="submit"]');
  var submitting = false;

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.classList.remove(
      "inquiry-form-feedback--success",
      "inquiry-form-feedback--error",
    );
    feedback.textContent = "";
    feedback.removeAttribute("role");
    feedback.removeAttribute("tabindex");
  }

  function showFeedback(kind, title, detail) {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.remove(
      "inquiry-form-feedback--success",
      "inquiry-form-feedback--error",
    );
    feedback.classList.add(
      kind === "success"
        ? "inquiry-form-feedback--success"
        : "inquiry-form-feedback--error",
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
    form.querySelectorAll(".form-field.is-invalid").forEach(function (label) {
      label.classList.remove("is-invalid");
    });
  }

  function markInvalid(input) {
    var label = input && input.closest(".form-field");
    if (label) label.classList.add("is-invalid");
  }

  function parseDateInput(input) {
    var value = input ? input.value.trim() : "";
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return null;

    var year = Number(parts[1]);
    var month = Number(parts[2]) - 1;
    var day = Number(parts[3]);
    var date = new Date(year, month, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  function overlapsBlockedWindow(startDate, endDate) {
    var startYear = startDate.getFullYear() - 1;
    var endYear = endDate.getFullYear() + 1;

    for (var year = startYear; year <= endYear; year += 1) {
      var blockedStart = new Date(year, 11, 21);
      var blockedEnd = new Date(year + 1, 0, 18);
      blockedStart.setHours(0, 0, 0, 0);
      blockedEnd.setHours(0, 0, 0, 0);

      if (startDate <= blockedEnd && endDate >= blockedStart) {
        return true;
      }
    }

    return false;
  }

  function validate() {
    clearFieldErrors();

    var requiredFields = [
      form.querySelector('[name="name"]'),
      form.querySelector('[name="email"]'),
      form.querySelector('[name="morocco_program"]'),
      form.querySelector('[name="arrival_date"]'),
      form.querySelector('[name="departure_date"]'),
    ];
    var ok = true;

    requiredFields.forEach(function (field) {
      if (!field || !field.value.trim()) {
        ok = false;
        markInvalid(field);
      }
    });

    var emailInput = form.querySelector('[name="email"]');
    if (emailInput && emailInput.value.trim() && !emailInput.checkValidity()) {
      ok = false;
      markInvalid(emailInput);
    }

    var arrivalInput = form.querySelector('[name="arrival_date"]');
    var departureInput = form.querySelector('[name="departure_date"]');
    var arrivalDate = parseDateInput(arrivalInput);
    var departureDate = parseDateInput(departureInput);

    if (arrivalInput && arrivalInput.value && !arrivalDate) {
      ok = false;
      markInvalid(arrivalInput);
    }
    if (departureInput && departureInput.value && !departureDate) {
      ok = false;
      markInvalid(departureInput);
    }

    if (arrivalDate && departureDate && departureDate < arrivalDate) {
      ok = false;
      markInvalid(arrivalInput);
      markInvalid(departureInput);
      showFeedback(
        "error",
        "Please check your dates.",
        "Departure date must be the same as or later than the arrival date.",
      );
      return false;
    }

    if (arrivalDate && departureDate && overlapsBlockedWindow(arrivalDate, departureDate)) {
      markInvalid(arrivalInput);
      markInvalid(departureInput);
      showFeedback(
        "error",
        "These dates need private review.",
        "Morocco year-round program requests from December 21 through January 18 are handled privately. Please email info@elitetravelsportsusa.com so we can review your dates case by case.",
      );
      return false;
    }

    if (!ok) {
      showFeedback(
        "error",
        "Please complete the highlighted fields.",
        "Name, email, program, arrival date, and departure date are required.",
      );
    }

    return ok;
  }

  function setBusy(busy) {
    submitting = busy;
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.setAttribute("aria-busy", busy ? "true" : "false");
  }

  async function getRecaptchaConfig() {
    if (window.__eliteRecaptchaConfig) return window.__eliteRecaptchaConfig;

    try {
      var response = await fetch("/api/public-config", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      window.__eliteRecaptchaConfig = await response.json();
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

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideFeedback();

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

    var emailInput = form.querySelector('[name="email"]');
    var replyInput = form.querySelector('[name="_replyto"]');
    if (replyInput && emailInput) replyInput.value = emailInput.value.trim();

    setBusy(true);

    try {
      var formData = new FormData(form);
      var payload = Object.fromEntries(formData.entries());
      payload.recaptcha_token = await getRecaptchaToken();
      payload.blackout_window_checked = "Yes - submitted dates are outside December 21 to January 18.";
      payload.pricing_note = "Website prices are shown in USD per person, converted from original brochure rates, rounded to the nearest $50, plus an additional $1,000 USD per person.";

      var response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      var data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON response */
      }

      if (response.ok) {
        showFeedback(
          "success",
          "Thank you—your Morocco request is received.",
          "The Elite planning desk will review your selected program and dates, then reply with availability and next steps.",
        );
        form.reset();
        clearFieldErrors();
        return;
      }

      var message =
        (data && typeof data.error === "string" && data.error) ||
        "Something went wrong. Please try again in a moment, or reach us directly at info@elitetravelsportsusa.com.";
      showFeedback("error", "We could not send your inquiry.", message);
    } catch {
      showFeedback(
        "error",
        "We could not send your inquiry.",
        "Your connection may have dropped. Try again shortly, or email info@elitetravelsportsusa.com.",
      );
    } finally {
      setBusy(false);
    }
  });
})();
