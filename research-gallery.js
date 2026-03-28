document.addEventListener("DOMContentLoaded", () => {
  const gallery = document.querySelector("#research-media-gallery");

  if (!gallery) {
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
  const manifestPath = gallery.dataset.manifest;
  const directoryPath = gallery.dataset.directory || "media/research-work/";
  const pageSize = Math.max(
    1,
    Math.min(5, Number.parseInt(gallery.dataset.pageSize || "5", 10) || 5)
  );
  const directoryUrl = new URL(directoryPath, window.location.href);

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

  const toReadableLabel = (value) =>
    String(value || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeEntry = (entry) => {
    const rawEntry =
      typeof entry === "string" ? { url: entry, label: toReadableLabel(entry) } : entry;
    const mediaUrl = resolveMediaUrl(rawEntry.url || rawEntry.src || rawEntry.file);
    const extension = getExtension(mediaUrl);
    const isImage = supportedImageExts.has(extension);
    const isVideo = supportedVideoExts.has(extension);

    if (!mediaUrl || (!isImage && !isVideo)) {
      return null;
    }

    const mediaKind =
      rawEntry.type === "video" || rawEntry.kind === "video" || isVideo ? "video" : "image";

    return {
      url: mediaUrl,
      label: rawEntry.label || rawEntry.title || toReadableLabel(mediaUrl),
      badge: rawEntry.badge || (mediaKind === "video" ? "Video" : "Image"),
      poster: rawEntry.poster ? resolveMediaUrl(rawEntry.poster) : "",
      kind: mediaKind,
      name: rawEntry.name || mediaUrl,
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

  const loadFromManifest = async () => {
    if (!manifestPath) {
      return [];
    }

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
      const documentFragment = new DOMParser().parseFromString(html, "text/html");
      const links = Array.from(documentFragment.querySelectorAll("a[href]"))
        .map((link) => link.getAttribute("href"))
        .filter(Boolean)
        .map((href) => decodeURIComponent(href))
        .filter(
          (href) =>
            !href.endsWith("/") &&
            !href.startsWith("../") &&
            href !== "manifest.json" &&
            (supportedImageExts.has(getExtension(href)) || supportedVideoExts.has(getExtension(href)))
        )
        .sort((left, right) => left.localeCompare(right));

      return dedupeEntries(links.map(normalizeEntry).filter(Boolean));
    } catch (error) {
      return [];
    }
  };

  const chunkEntries = (entries, chunkSize) => {
    const chunks = [];

    for (let index = 0; index < entries.length; index += chunkSize) {
      chunks.push(entries.slice(index, index + chunkSize));
    }

    return chunks;
  };

  const buildMediaElement = (entry) => {
    if (entry.kind === "video") {
      const video = document.createElement("video");
      video.src = entry.url;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";

      if (entry.poster) {
        video.poster = entry.poster;
      }

      return video;
    }

    const image = document.createElement("img");
    image.src = entry.url;
    image.alt = entry.label;
    image.loading = "lazy";

    return image;
  };

  const renderEmptyState = () => {
    gallery.innerHTML = "";

    const emptyState = document.createElement("div");
    emptyState.className = "research-gallery-empty";
    emptyState.textContent =
      "Add images or short videos to media/research-work/ and refresh the page to show them here.";

    gallery.appendChild(emptyState);
  };

  const renderGallery = (pages) => {
    gallery.innerHTML = "";

    const stage = document.createElement("div");
    stage.className = "research-gallery-stage";
    gallery.appendChild(stage);

    const nav = document.createElement("div");
    nav.className = "research-gallery-nav";
    gallery.appendChild(nav);

    const meta = document.createElement("div");
    meta.className = "research-gallery-meta";
    nav.appendChild(meta);

    const controls = document.createElement("div");
    controls.className = "research-gallery-controls";
    nav.appendChild(controls);

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "research-gallery-btn";
    prevButton.textContent = "Prev";
    controls.appendChild(prevButton);

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "research-gallery-btn";
    nextButton.textContent = "Next";
    controls.appendChild(nextButton);

    let pageIndex = 0;

    const updatePage = () => {
      const currentPage = pages[pageIndex] || [];
      const grid = document.createElement("div");
      grid.className = `research-gallery-grid layout-${currentPage.length || 1}`;

      currentPage.forEach((entry) => {
        const tile = document.createElement("figure");
        tile.className = "research-media-tile";

        const link = document.createElement("a");
        link.className = "research-media-link";
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `Open ${entry.label}`);
        link.appendChild(buildMediaElement(entry));

        const badge = document.createElement("span");
        badge.className = "research-media-badge";
        badge.textContent = entry.badge;

        const label = document.createElement("figcaption");
        label.className = "research-media-label";
        label.textContent = entry.label;

        tile.appendChild(link);
        tile.appendChild(badge);
        tile.appendChild(label);
        grid.appendChild(tile);
      });

      stage.replaceChildren(grid);

      const totalItems = pages.reduce((count, page) => count + page.length, 0);
      meta.textContent =
        pages.length > 1
          ? `Media page ${pageIndex + 1} of ${pages.length} | ${totalItems} items`
          : `${totalItems} media item${totalItems === 1 ? "" : "s"}`;

      const shouldShowControls = pages.length > 1;
      controls.hidden = !shouldShowControls;
      prevButton.disabled = !shouldShowControls;
      nextButton.disabled = !shouldShowControls;
    };

    prevButton.addEventListener("click", () => {
      pageIndex = (pageIndex - 1 + pages.length) % pages.length;
      updatePage();
    });

    nextButton.addEventListener("click", () => {
      pageIndex = (pageIndex + 1) % pages.length;
      updatePage();
    });

    updatePage();
  };

  const init = async () => {
    const [manifestEntries, directoryEntries] = await Promise.all([
      loadFromManifest(),
      loadFromDirectoryListing(),
    ]);
    const mediaEntries = dedupeEntries([...manifestEntries, ...directoryEntries]);

    if (mediaEntries.length === 0) {
      renderEmptyState();
      return;
    }

    renderGallery(chunkEntries(mediaEntries, pageSize));
  };

  init();
});
