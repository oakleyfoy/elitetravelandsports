/**
 * Plan a Journey — Formspree submission (endpoint is public; configure in dashboard for info@ inbox).
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-plan-inquiry]");
  if (!form || !(form instanceof HTMLFormElement)) return;

  var submitting = false;
  var submitBtn = form.querySelector('[type="submit"]');
  var feedback = document.querySelector("[data-inquiry-feedback]");

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.classList.remove(
      "inquiry-form-feedback--success",
      "inquiry-form-feedback--error",
    );
    feedback.textContent = "";
    feedback.removeAttribute("tabindex");
    feedback.removeAttribute("role");
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
    form.querySelectorAll(".form-field.is-invalid").forEach(function (lbl) {
      lbl.classList.remove("is-invalid");
    });
  }

  function markInvalid(fieldLabel) {
    if (fieldLabel) fieldLabel.classList.add("is-invalid");
  }

  function validate() {
    clearFieldErrors();
    var ok = true;
    var nameInput = form.querySelector('[name="name"]');
    var emailInput = form.querySelector('[name="email"]');
    var nameLabel = nameInput && nameInput.closest(".form-field");
    var emailLabel = emailInput && emailInput.closest(".form-field");

    var nameVal = nameInput ? nameInput.value.trim() : "";
    if (!nameVal || nameVal.length < 2) {
      ok = false;
      markInvalid(nameLabel);
    }

    if (!emailInput || !emailInput.value.trim()) {
      ok = false;
      markInvalid(emailLabel);
    } else if (!emailInput.checkValidity()) {
      ok = false;
      markInvalid(emailLabel);
    }

    form.querySelectorAll("[required]").forEach(function (field) {
      if (!field.value || !field.value.trim()) {
        ok = false;
        markInvalid(field.closest(".form-field"));
      }
    });

    if (!ok) {
      showFeedback(
        "error",
        "Please complete the highlighted fields.",
        "Name and a valid email address are required so we may respond thoughtfully.",
      );
    }
    return ok;
  }

  function setBusy(busy) {
    submitting = busy;
    if (submitBtn) {
      submitBtn.disabled = busy;
      submitBtn.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideFeedback();

    var endpoint = (form.getAttribute("action") || "").trim();
    if (!/^https:\/\/formspree\.io\//i.test(endpoint)) {
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
    var replyEl = form.querySelector('[name="_replyto"]');
    if (replyEl && emailInput) replyEl.value = emailInput.value.trim();

    setBusy(true);

    try {
      var fd = new FormData(form);
      var res = await fetch(endpoint, {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });

      var data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON */
      }

      if (res.ok) {
        showFeedback(
          "success",
          "Thank you—your journey notes are received.",
          "The Elite planning desk will reply personally from info@elitetravelsportsusa.com once your request has been considered.",
        );
        form.reset();
        clearFieldErrors();
        return;
      }

      var errMsg =
        (data &&
          typeof data.error === "string" &&
          data.error) ||
        "Something went wrong. Please try again in a moment, or reach us directly at info@elitetravelsportsusa.com.";
      showFeedback(
        "error",
        "We could not send your inquiry.",
        errMsg,
      );
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
