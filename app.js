let API_BASE = resolveApiBase();
const TOKEN_KEY = "ul_access_token";
const USER_KEY = "ul_current_user";
const LAST_SCAN_KEY = "ul_last_scan_id";
const SAVED_EMAIL_KEY = "ul_saved_email";

const state = {
  csrfToken: null,
  accessToken: localStorage.getItem(TOKEN_KEY) || "",
  currentUser: safeJsonParse(localStorage.getItem(USER_KEY)),
};

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApp();
});

async function bootstrapApp() {
  await ensureBackendStatus();
  await ensureSession();
  bindGlobalAuthUi();
  bindAuthFormIfPresent();
  bindNewScanPage();
  await loadDashboardPage();
  await loadResultsPage();
  await loadReportPage();
  await loadAdminPage();
}

async function ensureBackendStatus() {
  const apiStatus = document.getElementById("apiStatus");
  try {
    await ensureCsrfToken();
    if (apiStatus) {
      apiStatus.textContent = "Backend: Online";
      apiStatus.className = "badge badge-green";
    }
  } catch {
    if (apiStatus) {
      apiStatus.textContent = "Backend: Offline";
      apiStatus.className = "badge badge-red";
    }
  }
}

async function ensureSession() {
  if (state.accessToken) {
    try {
      const user = await apiFetch("/users/me", { auth: true });
      setSession(state.accessToken, user);
      return;
    } catch {
      clearSession();
    }
  }

  try {
    const refreshed = await refreshAccessToken();
    if (refreshed?.accessToken && refreshed?.user) {
      setSession(refreshed.accessToken, refreshed.user);
    }
  } catch {
    clearSession();
  }
}

function bindGlobalAuthUi() {
  const authStatus = document.getElementById("authStatus");
  const logoutBtn = document.getElementById("logoutBtn");
  const authSection = document.getElementById("authSection");
  
  if (authStatus) {
    if (state.currentUser?.email) {
      authStatus.textContent = `${state.currentUser.role}: ${state.currentUser.email}`;
      authStatus.className = "badge badge-green";
    } else {
      authStatus.textContent = "Not Signed In";
      authStatus.className = "badge badge-slate";
    }
  }

  // Hide/show auth section based on login state
  if (authSection) {
    if (state.currentUser) {
      authSection.classList.add("hidden");
    } else {
      authSection.classList.remove("hidden");
    }
  }

  if (logoutBtn) {
    if (state.currentUser) {
      logoutBtn.classList.remove("hidden");
    } else {
      logoutBtn.classList.add("hidden");
    }

    logoutBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/auth/logout", { method: "POST", auth: true, csrf: true });
      } catch {}
      clearSession();
      window.location.href = "index.html";
    });
  }
}

function bindAuthFormIfPresent() {
  const authForm = document.getElementById("authForm");
  if (!authForm) return;

  const registerBtn = document.getElementById("registerBtn");
  const message = document.getElementById("authMessage");
  const emailInput = document.getElementById("authEmail");
  const rememberCheckbox = document.getElementById("rememberEmail");

  // Load saved email on page load
  const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
  if (savedEmail && emailInput) {
    emailInput.value = savedEmail;
    if (rememberCheckbox) {
      rememberCheckbox.checked = true;
    }
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuth("login", message);
  });

  registerBtn?.addEventListener("click", async () => {
    await submitAuth("register", message);
  });

  // Save email when checkbox is toggled
  rememberCheckbox?.addEventListener("change", (event) => {
    if (event.target.checked && emailInput?.value) {
      localStorage.setItem(SAVED_EMAIL_KEY, emailInput.value.trim());
    } else {
      localStorage.removeItem(SAVED_EMAIL_KEY);
    }
  });
}

async function submitAuth(mode, messageEl) {
  const email = document.getElementById("authEmail")?.value?.trim();
  const password = document.getElementById("authPassword")?.value?.trim();
  if (!email || !password) {
    setMessage(messageEl, "Email and password are required.", true);
    return;
  }

  try {
    setMessage(messageEl, mode === "login" ? "Signing in..." : "Creating account...");
    const result = await apiFetch(`/auth/${mode}`, {
      method: "POST",
      auth: false,
      csrf: true,
      body: { email, password },
    });
    setSession(result.accessToken, result.user);
    bindGlobalAuthUi();
    setMessage(messageEl, mode === "login" ? "Login successful." : "Registration successful.");
    await loadDashboardPage();
  } catch (error) {
    setMessage(messageEl, readError(error), true);
  }
}

function bindNewScanPage() {
  const scanForm = document.getElementById("scanForm");
  if (!scanForm) return;

  const statusBadge = document.getElementById("scanStatusBadge");
  const statusText = document.getElementById("scanStatusText");
  const scanMetaText = document.getElementById("scanMetaText");
  const progressBar = document.getElementById("scanProgress");
  const startBtn = document.getElementById("startScanBtn");

  scanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = document.getElementById("targetUrl")?.value?.trim();
    if (!url) return;
    if (!state.accessToken) {
      updateScanUi(statusBadge, statusText, progressBar, "failed", 0, "Please login on the Dashboard page first.");
      return;
    }

    startBtn?.setAttribute("disabled", "true");
    startBtn?.classList.add("opacity-70");

    try {
      updateScanUi(statusBadge, statusText, progressBar, "running", 20, `Submitting scan for ${url}...`);
      const created = await apiFetch("/scans", {
        method: "POST",
        auth: true,
        csrf: true,
        body: { targetUrl: url },
      });
      localStorage.setItem(LAST_SCAN_KEY, created.id);
      scanMetaText.textContent = `Scan ID: ${created.id}`;
      await pollScanStatus(created.id, statusBadge, statusText, progressBar);
    } catch (error) {
      updateScanUi(statusBadge, statusText, progressBar, "failed", 100, readError(error));
    } finally {
      startBtn?.removeAttribute("disabled");
      startBtn?.classList.remove("opacity-70");
    }
  });
}

async function pollScanStatus(scanId, badge, text, bar) {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    const scan = await apiFetch(`/scans/${scanId}`, { auth: true });
    const status = (scan.status || "queued").toLowerCase();

    if (status === "queued") {
      updateScanUi(badge, text, bar, "running", 35, "Scan queued and waiting for worker...");
    } else if (status === "running") {
      updateScanUi(badge, text, bar, "running", 70, "Crawler and scanner running...");
    } else if (status === "completed") {
      updateScanUi(badge, text, bar, "completed", 100, "Scan completed. Open Scan Results page.");
      return;
    } else if (status === "failed") {
      updateScanUi(badge, text, bar, "failed", 100, "Scan failed. Check logs and retry.");
      return;
    }

    await sleep(2000);
  }

  updateScanUi(badge, text, bar, "failed", 100, "Timeout waiting for scan completion.");
}

async function loadDashboardPage() {
  const totalEl = document.getElementById("metricTotalScans");
  if (!totalEl) return;

  const vulnsEl = document.getElementById("metricVulns");
  const highEl = document.getElementById("metricHigh");
  const tableBody = document.getElementById("recentScansBody");

  if (!state.accessToken) {
    totalEl.textContent = "0";
    vulnsEl.textContent = "0";
    highEl.textContent = "0";
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-slate-400">Login to load scan activity.</td></tr>`;
    }
    return;
  }

  try {
    const scans = await apiFetch("/scans", { auth: true });
    const allFindingsCount = scans.reduce((acc, scan) => acc + (scan.findings?.length || 0), 0);
    const highCount = scans.reduce(
      (acc, scan) => acc + (scan.findings || []).filter((f) => f.severity === "high").length,
      0
    );

    totalEl.textContent = String(scans.length);
    vulnsEl.textContent = String(allFindingsCount);
    highEl.textContent = String(highCount);

    if (!tableBody) return;
    if (scans.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-slate-400">No scans yet. Start one from New Scan.</td></tr>`;
      return;
    }

    tableBody.innerHTML = scans.slice(0, 8).map((scan) => {
      const findingsCount = scan.findings?.length || 0;
      const date = formatDate(scan.createdAt);
      const statusClass = badgeClassForStatus(scan.status);
      return `<tr class="hover:bg-slate-800/40">
        <td class="px-5 py-4">${escapeHtml(scan.targetUrl)}</td>
        <td class="px-5 py-4">${date}</td>
        <td class="px-5 py-4">${findingsCount}</td>
        <td class="px-5 py-4"><a href="scan-results.html?scanId=${encodeURIComponent(scan.id)}" class="badge ${statusClass}">${escapeHtml(scan.status)}</a></td>
      </tr>`;
    }).join("");
  } catch (error) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-red-300">${escapeHtml(readError(error))}</td></tr>`;
    }
  }
}

async function loadResultsPage() {
  const table = document.getElementById("vulnerabilityTable");
  if (!table) return;
  const meta = document.getElementById("resultsMeta");
  const downloadBtn = document.getElementById("downloadReportBtn");

  if (!state.accessToken) {
    table.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-slate-400">Login on Dashboard to view results.</td></tr>`;
    downloadBtn?.classList.add("hidden");
    return;
  }

  try {
    const scanIdFromUrl = new URLSearchParams(window.location.search).get("scanId");
    let targetScanId = scanIdFromUrl || localStorage.getItem(LAST_SCAN_KEY) || "";

    if (!targetScanId) {
      const scans = await apiFetch("/scans", { auth: true });
      targetScanId = scans[0]?.id || "";
    }

    if (!targetScanId) {
      table.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-slate-400">No scans available yet.</td></tr>`;
      return;
    }

    localStorage.setItem(LAST_SCAN_KEY, targetScanId);
    const scan = await apiFetch(`/scans/${targetScanId}`, { auth: true });
    const findings = await apiFetch(`/scans/${targetScanId}/findings`, { auth: true });
    if (downloadBtn) {
      downloadBtn.classList.remove("hidden");
      downloadBtn.onclick = async () => {
        try {
          await downloadReportFile(targetScanId, "md");
        } catch (error) {
          if (meta) {
            meta.textContent = `Report download failed: ${readError(error)}`;
          }
        }
      };
    }
    if (meta) {
      meta.textContent = `Target: ${scan.targetUrl} | Status: ${scan.status} | Created: ${formatDate(scan.createdAt)}`;
    }

    if (!findings.length) {
      table.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-slate-400">No findings for this scan.</td></tr>`;
      return;
    }

    table.innerHTML = findings.map((finding, idx) => `
      <tr class="vuln-row cursor-pointer hover:bg-slate-800/40" data-index="${idx}">
        <td class="px-5 py-4 font-medium">${escapeHtml(finding.type)}</td>
        <td class="px-5 py-4"><span class="badge ${badgeClassForSeverity(finding.severity)}">${escapeHtml(capitalize(finding.severity))}</span></td>
        <td class="px-5 py-4">${escapeHtml(finding.affectedUrl)}</td>
        <td class="px-5 py-4 text-cyan-300">Expand</td>
      </tr>
      <tr class="detail-row hidden bg-slate-900/60" data-detail-index="${idx}">
        <td colspan="4" class="px-5 py-4 text-slate-300">${escapeHtml(finding.details)}</td>
      </tr>
    `).join("");

    bindExpandableRows();
  } catch (error) {
    downloadBtn?.classList.add("hidden");
    table.innerHTML = `<tr><td colspan="4" class="px-5 py-5 text-red-300">${escapeHtml(readError(error))}</td></tr>`;
  }
}

async function loadReportPage() {
  const highEl = document.getElementById("reportHighCount");
  if (!highEl) return;
  const mediumEl = document.getElementById("reportMediumCount");
  const lowEl = document.getElementById("reportLowCount");
  const breakdownList = document.getElementById("breakdownList");
  const remediationList = document.getElementById("remediationList");

  if (!state.accessToken) {
    highEl.textContent = "0";
    mediumEl.textContent = "0";
    lowEl.textContent = "0";
    if (breakdownList) {
      breakdownList.innerHTML = `<p class="text-slate-400 text-sm">Login to load report data.</p>`;
    }
    return;
  }

  try {
    const scans = await apiFetch("/scans", { auth: true });
    const findingsBySeverity = { high: 0, medium: 0, low: 0 };
    const byType = {};

    scans.forEach((scan) => {
      (scan.findings || []).forEach((finding) => {
        findingsBySeverity[finding.severity] = (findingsBySeverity[finding.severity] || 0) + 1;
        byType[finding.type] = (byType[finding.type] || 0) + 1;
      });
    });

    highEl.textContent = String(findingsBySeverity.high || 0);
    mediumEl.textContent = String(findingsBySeverity.medium || 0);
    lowEl.textContent = String(findingsBySeverity.low || 0);

    if (breakdownList) {
      const entries = Object.entries(byType);
      if (!entries.length) {
        breakdownList.innerHTML = `<p class="text-slate-400 text-sm">No findings available for breakdown yet.</p>`;
      } else {
        breakdownList.innerHTML = entries.map(([type, count]) => `
          <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div class="flex items-center justify-between gap-3">
              <p class="font-semibold">${escapeHtml(type)}</p>
              <span class="badge badge-slate">${count}</span>
            </div>
            <p class="mt-2 text-sm text-slate-400">${count} finding(s) detected across available scan results.</p>
          </div>
        `).join("");
      }
    }

    if (remediationList) {
      const suggestions = buildRemediationSuggestions(Object.keys(byType));
      remediationList.innerHTML = suggestions.map((item) => `
        <li class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">${escapeHtml(item)}</li>
      `).join("");
    }
  } catch (error) {
    if (breakdownList) {
      breakdownList.innerHTML = `<p class="text-red-300 text-sm">${escapeHtml(readError(error))}</p>`;
    }
  }
}

async function loadAdminPage() {
  const accessMessage = document.getElementById("adminAccessMessage");
  if (!accessMessage) return;

  const totalUsersEl = document.getElementById("adminTotalUsers");
  const totalScansEl = document.getElementById("adminTotalScans");
  const runningScansEl = document.getElementById("adminRunningScans");
  const highFindingsEl = document.getElementById("adminHighFindings");
  const scansBody = document.getElementById("adminScansBody");
  const auditBody = document.getElementById("adminAuditBody");

  if (!state.accessToken || !state.currentUser?.email) {
    accessMessage.textContent = "Login required. Sign in from Dashboard first.";
    accessMessage.className = "mt-2 text-sm text-red-300";
    return;
  }

  if (state.currentUser.role !== "admin") {
    accessMessage.textContent = "Admin access required. Your account is not authorized.";
    accessMessage.className = "mt-2 text-sm text-amber-300";
    return;
  }

  try {
    const data = await apiFetch("/admin/dashboard", { auth: true });
    accessMessage.textContent = "Admin access granted. Live platform data loaded.";
    accessMessage.className = "mt-2 text-sm text-emerald-300";

    if (totalUsersEl) totalUsersEl.textContent = String(data.metrics?.totalUsers || 0);
    if (totalScansEl) totalScansEl.textContent = String(data.metrics?.totalScans || 0);
    if (runningScansEl) runningScansEl.textContent = String(data.metrics?.runningScans || 0);
    if (highFindingsEl) highFindingsEl.textContent = String(data.metrics?.highSeverityFindings || 0);

    if (scansBody) {
      const recentScans = data.recentScans || [];
      scansBody.innerHTML = recentScans.length
        ? recentScans
            .map(
              (scan) => `<tr class="hover:bg-slate-800/40">
              <td class="px-5 py-4">${escapeHtml(scan.owner?.email || "-")}</td>
              <td class="px-5 py-4">${escapeHtml(scan.targetUrl)}</td>
              <td class="px-5 py-4"><span class="badge ${badgeClassForStatus(scan.status)}">${escapeHtml(scan.status)}</span></td>
              <td class="px-5 py-4">${scan._count?.findings ?? 0}</td>
              <td class="px-5 py-4">${formatDate(scan.createdAt)}</td>
            </tr>`
            )
            .join("")
        : `<tr><td colspan="5" class="px-5 py-5 text-slate-400">No scans yet.</td></tr>`;
    }

    if (auditBody) {
      const events = data.latestAuditEvents || [];
      auditBody.innerHTML = events.length
        ? events
            .map(
              (event) => `<tr class="hover:bg-slate-800/40">
              <td class="px-5 py-4">${formatDate(event.createdAt)}</td>
              <td class="px-5 py-4">${escapeHtml(event.action)}</td>
              <td class="px-5 py-4">${escapeHtml(event.user?.email || "system")}</td>
            </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="px-5 py-5 text-slate-400">No audit events available.</td></tr>`;
    }
  } catch (error) {
    accessMessage.textContent = `Failed to load admin dashboard: ${readError(error)}`;
    accessMessage.className = "mt-2 text-sm text-red-300";
  }
}

function bindExpandableRows() {
  const rows = document.querySelectorAll(".vuln-row");
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const idx = row.getAttribute("data-index");
      document.querySelectorAll(".detail-row").forEach((r) => r.classList.add("hidden"));
      const detail = document.querySelector(`.detail-row[data-detail-index="${idx}"]`);
      if (detail) {
        detail.classList.remove("hidden");
      }
    });
  });
}

async function apiFetch(path, options = {}) {
  const method = options.method || "GET";
  const requiresCsrf = options.csrf ?? !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  if (options.auth && state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
  if (requiresCsrf) {
    headers["x-csrf-token"] = await ensureCsrfToken();
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && options.auth && !options._retried) {
    const refreshed = await refreshAccessToken().catch(() => null);
    if (refreshed?.accessToken) {
      return apiFetch(path, { ...options, _retried: true });
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    const message = payload?.message || `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }
  return payload;
}

async function downloadReportFile(scanId, format) {
  const headers = { Accept: "application/octet-stream" };
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  let response = await fetch(`${API_BASE}/scans/${scanId}/report?format=${encodeURIComponent(format)}`, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken().catch(() => null);
    if (refreshed?.accessToken) {
      headers.Authorization = `Bearer ${refreshed.accessToken}`;
      response = await fetch(`${API_BASE}/scans/${scanId}/report?format=${encodeURIComponent(format)}`, {
        method: "GET",
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    throw new Error(`Report download failed (${response.status})`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = filenameMatch?.[1] || `scan-report-${scanId}.${format}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function ensureCsrfToken() {
  if (state.csrfToken) return state.csrfToken;
  try {
    const token = await fetchCsrfToken();
    state.csrfToken = token;
    return state.csrfToken;
  } catch (error) {
    const hasExplicitApiBase = !!localStorage.getItem("apiBase");
    if (!hasExplicitApiBase) {
      throw error;
    }

    // Recover from stale manual apiBase overrides that point to dead endpoints.
    localStorage.removeItem("apiBase");
    API_BASE = resolveApiBase();
    const token = await fetchCsrfToken();
    state.csrfToken = token;
    return state.csrfToken;
  }
}

async function refreshAccessToken() {
  await ensureCsrfToken();
  const refreshed = await apiFetch("/auth/refresh", {
    method: "POST",
    auth: false,
    csrf: true,
    body: {},
    _retried: true,
  });
  if (refreshed?.accessToken && refreshed?.user) {
    setSession(refreshed.accessToken, refreshed.user);
  }
  return refreshed;
}

function setSession(accessToken, user) {
  state.accessToken = accessToken || "";
  state.currentUser = user || null;
  localStorage.setItem(TOKEN_KEY, state.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser || {}));
}

function clearSession() {
  state.accessToken = "";
  state.currentUser = null;
  state.csrfToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function updateScanUi(badge, text, bar, mode, progress, message) {
  if (!badge || !text || !bar) return;
  if (mode === "completed") {
    badge.textContent = "Completed";
    badge.className = "badge badge-green";
  } else if (mode === "running") {
    badge.textContent = "Running";
    badge.className = "badge badge-yellow";
  } else if (mode === "failed") {
    badge.textContent = "Failed";
    badge.className = "badge badge-red";
  } else {
    badge.textContent = "Idle";
    badge.className = "badge badge-slate";
  }
  bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  text.textContent = message;
}

function badgeClassForSeverity(severity) {
  if (severity === "high") return "badge-red";
  if (severity === "medium") return "badge-yellow";
  return "badge-green";
}

function badgeClassForStatus(status) {
  if (status === "completed") return "badge-green";
  if (status === "running" || status === "queued") return "badge-yellow";
  if (status === "failed") return "badge-red";
  return "badge-slate";
}

function buildRemediationSuggestions(types) {
  const suggestions = [];
  if (types.some((t) => t.toLowerCase().includes("xss"))) {
    suggestions.push("Use strict output encoding and contextual escaping for all user-controlled content.");
  }
  if (types.some((t) => t.toLowerCase().includes("sql"))) {
    suggestions.push("Use parameterized Prisma operations only and avoid unsafe string interpolation in query logic.");
  }
  suggestions.push("Enforce secure cookie/session settings and rotate credentials after privilege changes.");
  suggestions.push("Deploy CSP, strict transport settings, and continuous security monitoring for exposed endpoints.");
  return suggestions;
}

function setMessage(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.className = `mt-3 text-sm ${isError ? "text-red-300" : "text-slate-400"}`;
}

function readError(error) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolveApiBase() {
  const explicit = localStorage.getItem("apiBase")?.trim();
  if (explicit) {
    const normalized = explicit.replace(/\/+$/, "");
    const isAbsoluteHttp = /^https?:\/\/[^/\s]+/i.test(normalized);
    const isRelativePath = normalized.startsWith("/");
    if (isAbsoluteHttp || isRelativePath) {
      return normalized;
    }
    localStorage.removeItem("apiBase");
  }
  // Default to same-origin proxy path so users only interact with vulnexa.com.
  return "/api";
}

async function fetchCsrfToken() {
  const response = await fetch(`${API_BASE}/auth/csrf-token`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Unable to fetch CSRF token from backend.");
  }
  const body = await response.json();
  return body.csrfToken;
}
