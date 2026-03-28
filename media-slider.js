document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector("#media-container");

  if (!container) {
    return;
  }

  const supportedImageExts = new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "avif",
  ]);
  const supportedVideoExts = new Set(["mp4", "webm", "mov", "m4v"]);
  const ignoredFileNames = new Set(["manifest.json", ".gitkeep"]);
  const manifestPath = container.dataset.manifest || "media/manifest.json";
  const directoryPath = container.dataset.directory || "media/";
  const directoryUrl = new URL(directoryPath, window.location.href);

  const mediaWindow = document.createElement("div");
  mediaWindow.className = "media-window";
  container.appendChild(mediaWindow);

  const nav = document.createElement("div");
  nav.className = "media-nav";
  container.appendChild(nav);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "media-prev-btn";
  prevBtn.innerHTML = "&#8592; Prev";
  nav.appendChild(prevBtn);

  const dotsContainer = document.createElement("div");
  dotsContainer.className = "media-dots";
  nav.appendChild(dotsContainer);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "media-next-btn";
  nextBtn.innerHTML = "Next &#8594;";
  nav.appendChild(nextBtn);

  let mediaFiles = [];
  let currentIndex = 0;
  let timerId;
  let hoverPaused = false;
  let refreshTimerId;
  let displayToken = 0;

  const getExtension = (value) => {
    const cleanValue = String(value || "")
      .split("#")[0]
      .split("?")[0]
      .trim()
      .toLowerCase();
    const parts = cleanValue.split(".");

    return parts.length > 1 ? parts.pop() : "";
  };

  const resolveMediaUrl = (value) => {
    try {
      return new URL(String(value || "").trim(), directoryUrl).toString();
    } catch (error) {
      return "";
    }
  };

  const getFileName = (value) =>
    String(value || "")
      .split("#")[0]
      .split("?")[0]
      .split("/")
      .pop()
      .trim();

  const toReadableLabel = (value) =>
    String(value || "")
      .replace(/\.[^.]+$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeEntry = (entry) => {
    const rawEntry =
      typeof entry === "string" ? { url: entry, label: toReadableLabel(entry) } : entry;
    const mediaUrl = resolveMediaUrl(rawEntry.url || rawEntry.src || rawEntry.file);
    const extension = getExtension(mediaUrl);
    const fileName = getFileName(mediaUrl);
    const isImage = supportedImageExts.has(extension);
    const isVideo = supportedVideoExts.has(extension);

    if (!mediaUrl || ignoredFileNames.has(fileName.toLowerCase())) {
      return null;
    }

    let kind = "file";

    if (rawEntry.type === "video" || isVideo) {
      kind = "video";
    } else if (rawEntry.type === "image" || isImage) {
      kind = "image";
    }

    return {
      url: mediaUrl,
      type: extension,
      kind,
      name: rawEntry.name || rawEntry.label || toReadableLabel(mediaUrl),
    };
  };

  const dedupeEntries = (entries) => {
    const seen = new Set();

    return entries.filter((entry) => {
      if (!entry || seen.has(entry.url)) {
        return false;
      }

      seen.add(entry.url);
      return true;
    });
  };

  const haveEntriesChanged = (nextEntries) => {
    if (mediaFiles.length !== nextEntries.length) {
      return true;
    }

    return mediaFiles.some((entry, index) => {
      const nextEntry = nextEntries[index];

      return (
        entry.url !== nextEntry?.url ||
        entry.kind !== nextEntry?.kind ||
        entry.type !== nextEntry?.type
      );
    });
  };

  const loadFromManifest = async () => {
    try {
      const response = await fetch(manifestPath, { cache: "no-store" });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

      return dedupeEntries(items.map(normalizeEntry).filter(Boolean));
    } catch (error) {
      return [];
    }
  };

  const loadFromDirectoryListing = async () => {
    try {
      const response = await fetch(directoryPath, { cache: "no-store" });

      if (!response.ok) {
        return [];
      }

      const html = await response.text();
      const fragment = new DOMParser().parseFromString(html, "text/html");
      const links = Array.from(fragment.querySelectorAll("a[href]"))
        .map((link) => link.getAttribute("href"))
        .filter(Boolean)
        .map((href) => decodeURIComponent(href))
        .filter(
          (href) =>
            !href.endsWith("/") &&
            !href.startsWith("../") &&
            !ignoredFileNames.has(getFileName(href).toLowerCase())
        )
        .sort((left, right) => left.localeCompare(right));

      return dedupeEntries(links.map(normalizeEntry).filter(Boolean));
    } catch (error) {
      return [];
    }
  };

  const isImage = (media) => supportedImageExts.has(media.type);
  const isGif = (media) => media.type === "gif";
  const isVideo = (media) => supportedVideoExts.has(media.type);

  const clearAdvanceTimer = () => {
    window.clearTimeout(timerId);
  };

  const scheduleNext = () => {
    clearAdvanceTimer();

    const current = mediaFiles[currentIndex];

    if (!current || hoverPaused) {
      return;
    }

    // Videos advance only when they naturally end (via the 'ended' event).
    // A fixed timer would cut off videos that are longer than the delay.
    if (isVideo(current)) {
      return;
    }

    const delay = current.kind === "file" ? 2800 : 2400;

    timerId = window.setTimeout(() => {
      advanceMedia();
    }, delay);
  };

  const buildMediaElement = (media, token) => {
    let element;

    if (isImage(media) || isGif(media)) {
      element = document.createElement("img");
      element.src = media.url;
      element.alt = media.name;
      element.loading = "lazy";
    } else if (isVideo(media)) {
      element = document.createElement("video");
      element.src = media.url;
      element.autoplay = true;
      element.muted = true;
      element.defaultMuted = true;
      element.controls = true;
      element.playsInline = true;
      element.preload = "metadata";
      element.loop = false;
      element.addEventListener("loadeddata", () => {
        const playAttempt = element.play();

        if (playAttempt && typeof playAttempt.catch === "function") {
          playAttempt.catch(() => {});
        }
      });
      // Guard with token: if the user navigated away before this video ended,
      // displayToken will have changed and we skip the stale advance.
      element.addEventListener("ended", () => {
        if (displayToken === token) {
          advanceMedia();
        }
      });
      element.addEventListener("error", () => {
        if (displayToken === token) {
          advanceMedia();
        }
      });
    } else {
      element = document.createElement("a");
      element.classList.add("media-file-card");
      element.href = media.url;
      element.target = "_blank";
      element.rel = "noopener noreferrer";

      const fileCard = document.createElement("span");
      fileCard.className = "media-file-card-inner";

      const fileType = document.createElement("span");
      fileType.className = "media-file-extension";
      fileType.textContent = media.type ? media.type.toUpperCase() : "FILE";

      const fileName = document.createElement("span");
      fileName.className = "media-file-name";
      fileName.textContent = media.name;

      const fileAction = document.createElement("span");
      fileAction.className = "media-file-action";
      fileAction.textContent = "Open file";

      fileCard.appendChild(fileType);
      fileCard.appendChild(fileName);
      fileCard.appendChild(fileAction);
      element.appendChild(fileCard);
    }

    element.classList.add("media-item");

    return element;
  };

  const renderEmptyState = () => {
    mediaWindow.innerHTML = "";
    nav.hidden = true;

    const emptyState = document.createElement("div");
    emptyState.className = "media-empty";
    emptyState.textContent =
      "Add images or short videos to media/ and refresh the page to show them here.";

    mediaWindow.appendChild(emptyState);
  };

  const renderDots = () => {
    dotsContainer.innerHTML = "";

    if (mediaFiles.length < 2) {
      dotsContainer.hidden = true;
      return;
    }

    dotsContainer.hidden = false;
    mediaFiles.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "media-dot" + (i === currentIndex ? " media-dot--active" : "");
      dot.setAttribute("aria-label", "Go to item " + (i + 1));
      dot.addEventListener("click", () => {
        if (i === currentIndex) return;
        const dir = i > currentIndex ? "next" : "prev";
        currentIndex = i;
        clearAdvanceTimer();
        mediaWindow.innerHTML = "";
        showMedia(dir);
      });
      dotsContainer.appendChild(dot);
    });
  };

  const applyMediaEntries = (nextEntries, { forceRender = false } = {}) => {
    const previousCurrentUrl = mediaFiles[currentIndex]?.url || "";
    const hasChanges = haveEntriesChanged(nextEntries);

    mediaFiles = nextEntries;

    if (mediaFiles.length === 0) {
      currentIndex = 0;
      clearAdvanceTimer();
      renderEmptyState();
      return;
    }

    nav.hidden = mediaFiles.length < 2;

    const matchingIndex = previousCurrentUrl
      ? mediaFiles.findIndex((entry) => entry.url === previousCurrentUrl)
      : -1;

    currentIndex = matchingIndex >= 0 ? matchingIndex : 0;

    if (forceRender || hasChanges || !mediaWindow.querySelector(".media-item")) {
      clearAdvanceTimer();
      mediaWindow.innerHTML = "";
      showMedia();
      renderDots();
      return;
    }

    renderDots();
    scheduleNext();
  };

  const showMedia = (direction = "next") => {
    const currentMedia = mediaFiles[currentIndex];

    if (!currentMedia) {
      renderEmptyState();
      return;
    }

    displayToken += 1;
    const currentDisplayToken = displayToken;
    const nextElement = buildMediaElement(currentMedia, currentDisplayToken);
    const currentElement = mediaWindow.querySelector(".media-item");
    const inClass = direction === "next" ? "slide-in-right" : "slide-in-left";
    const outClass = direction === "next" ? "slide-out-left" : "slide-out-right";

    if (!currentElement) {
      mediaWindow.innerHTML = "";
      mediaWindow.appendChild(nextElement);
      scheduleNext();
      return;
    }

    nextElement.classList.add(inClass);
    mediaWindow.appendChild(nextElement);
    currentElement.classList.add(outClass);

    const onAnimationEnd = () => {
      currentElement.remove();
      nextElement.classList.remove(inClass);
      nextElement.removeEventListener("animationend", onAnimationEnd);
    };

    nextElement.addEventListener("animationend", onAnimationEnd);
    renderDots();
    scheduleNext();

    if (isVideo(currentMedia)) {
      window.setTimeout(() => {
        if (displayToken !== currentDisplayToken) {
          return;
        }

        const activeVideo = mediaWindow.querySelector("video.media-item");

        if (!activeVideo) {
          return;
        }

        const playAttempt = activeVideo.play();

        if (playAttempt && typeof playAttempt.catch === "function") {
          playAttempt.catch(() => {});
        }
      }, 120);
    }
  };

  const advanceMedia = () => {
    if (mediaFiles.length < 2) {
      return;
    }

    currentIndex = (currentIndex + 1) % mediaFiles.length;
    showMedia("next");
  };

  const rewindMedia = () => {
    if (mediaFiles.length < 2) {
      return;
    }

    currentIndex = (currentIndex - 1 + mediaFiles.length) % mediaFiles.length;
    showMedia("prev");
  };

  prevBtn.addEventListener("click", rewindMedia);
  nextBtn.addEventListener("click", advanceMedia);

  container.addEventListener("mouseenter", () => {
    hoverPaused = true;
    clearAdvanceTimer();
  });

  container.addEventListener("mouseleave", () => {
    hoverPaused = false;
    scheduleNext();
  });

  const loadMediaEntries = async () => {
    const directoryEntries = await loadFromDirectoryListing();
    const manifestEntries =
      directoryEntries.length > 0 ? [] : await loadFromManifest();
    return directoryEntries.length > 0 ? directoryEntries : manifestEntries;
  };

  const refreshMediaEntries = async ({ forceRender = false } = {}) => {
    const nextEntries = await loadMediaEntries();
    applyMediaEntries(nextEntries, { forceRender });
  };

  const initializeSlider = async () => {
    await refreshMediaEntries({ forceRender: true });

    if (refreshTimerId) {
      window.clearInterval(refreshTimerId);
    }

    refreshTimerId = window.setInterval(() => {
      refreshMediaEntries();
    }, 8000);
  };

  window.addEventListener("focus", () => {
    refreshMediaEntries();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshMediaEntries();
    }
  });

  initializeSlider();
});
