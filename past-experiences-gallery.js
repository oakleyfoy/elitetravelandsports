/**
 * Past Experiences — click-to-enlarge photo gallery.
 * Without JavaScript (or <dialog> support) each photo link opens the full image directly.
 */
(function () {
  "use strict";

  var dialog = document.querySelector("[data-past-lightbox]");
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-gallery-item]"));
  if (!dialog || !items.length || typeof dialog.showModal !== "function") return;

  var image = dialog.querySelector("[data-lightbox-image]");
  var caption = dialog.querySelector("[data-lightbox-caption]");
  var count = dialog.querySelector("[data-lightbox-count]");
  var prevButton = dialog.querySelector("[data-lightbox-prev]");
  var nextButton = dialog.querySelector("[data-lightbox-next]");
  var closeButton = dialog.querySelector("[data-lightbox-close]");
  var current = 0;
  var opener = null;
  var touchStartX = null;

  if (items.length < 2) {
    prevButton.hidden = true;
    nextButton.hidden = true;
  }

  function show(index) {
    current = (index + items.length) % items.length;
    var item = items[current];
    var thumb = item.querySelector("img");
    var text = item.getAttribute("data-caption") || "";

    image.src = item.getAttribute("href");
    image.alt = thumb ? thumb.alt : "";
    caption.textContent = text;
    caption.hidden = !text;
    count.textContent = "Photo " + (current + 1) + " of " + items.length;
  }

  function open(index, trigger) {
    opener = trigger;
    show(index);
    dialog.showModal();
    document.documentElement.classList.add("past-lightbox-open");
    closeButton.focus();
  }

  items.forEach(function (item, index) {
    item.addEventListener("click", function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(index, item);
    });
  });

  prevButton.addEventListener("click", function () {
    show(current - 1);
  });

  nextButton.addEventListener("click", function () {
    show(current + 1);
  });

  closeButton.addEventListener("click", function () {
    dialog.close();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.classList.contains("past-lightbox-figure")) {
      dialog.close();
    }
  });

  dialog.addEventListener("keydown", function (event) {
    if (items.length < 2) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(current - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(current + 1);
    }
  });

  dialog.addEventListener(
    "touchstart",
    function (event) {
      touchStartX = event.changedTouches[0].clientX;
    },
    { passive: true },
  );

  dialog.addEventListener("touchend", function (event) {
    if (touchStartX === null || items.length < 2) return;
    var deltaX = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) > 50) show(current + (deltaX < 0 ? 1 : -1));
  });

  dialog.addEventListener("close", function () {
    document.documentElement.classList.remove("past-lightbox-open");
    image.removeAttribute("src");
    if (opener) opener.focus();
  });
})();
