/* ============================================
   STUDENT ACADEMIC PORTAL — APP LOGIC
   Vercel-ready frontend for Google Apps Script
   ============================================ */
 
/*
 * CONFIGURATION
 * Set your deployed Google Apps Script Web App URL below.
 * Deploy your Code.gs as a web app and paste the URL here.
 */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyBOlHoxg6fAuw3PMYNwDSVIvELb0535B_w8KehYpMXwCGWgA41rpdof-R4VTKR0zKX/exec";
 
/* ---------- State ---------- */
let currentStudent = null;
let currentResponse = null;
 
/* ============================================
   THEME TOGGLE
   ============================================ */
(function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeIcon(theme);
})();
 
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
}
 
function updateThemeIcon(theme) {
  var icon = document.getElementById("themeIcon");
  if (icon) {
    // Moon for light mode (click to go dark), Sun for dark mode (click to go light)
    icon.innerHTML = theme === "dark" ? "&#9788;" : "&#9790;";
  }
}
 
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
 
/* ============================================
   PASSWORD VISIBILITY
   ============================================ */
function togglePassword() {
  var pass = document.getElementById("password");
  var eyeIcon = document.getElementById("eyeIcon");
  if (pass.type === "password") {
    pass.type = "text";
    eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    pass.type = "password";
    eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}
 
/* ============================================
   LOGIN
   ============================================ */
function handleLogin() {
  var username = document.getElementById("username").value.trim();
  var password = document.getElementById("password").value.trim();
  var loginBtn = document.getElementById("loginBtn");
  var loginBtnText = document.getElementById("loginBtnText");
  var loginSpinner = document.getElementById("loginSpinner");
  var messageArea = document.getElementById("message");
 
  if (!username || !password) {
    messageArea.innerHTML = '<div class="msg-error">Please enter both Student ID and Password.</div>';
    return;
  }
 
  // Show loading
  loginBtn.disabled = true;
  loginBtnText.textContent = "Signing in...";
  loginSpinner.classList.remove("hidden");
  messageArea.innerHTML = "";
 
  callGAS("loginStudent", { username: username, password: password })
    .then(function (res) {
      loginBtn.disabled = false;
      loginBtnText.textContent = "Sign In";
      loginSpinner.classList.add("hidden");
      showDashboard(res);
    })
    .catch(function (err) {
      loginBtn.disabled = false;
      loginBtnText.textContent = "Sign In";
      loginSpinner.classList.add("hidden");
      messageArea.innerHTML = '<div class="msg-error">' + escapeHtml(err.message || err) + "</div>";
    });
}
 
/* ============================================
   DASHBOARD RENDERING
   ============================================ */
function showDashboard(res) {
  if (!res.success) {
    document.getElementById("message").innerHTML =
      '<div class="msg-error">' + escapeHtml(res.message) + "</div>";
    return;
  }
 
  currentStudent = res.student;
  currentResponse = res;
 
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
 
  document.getElementById("studentID").textContent = res.student.id;
  document.getElementById("thaiName").textContent = res.student.thai;
  document.getElementById("englishName").textContent = res.student.english;
  document.getElementById("section").textContent = res.student.section;
  document.getElementById("studentClass").textContent = res.student.class;
 
  renderScores(res);
}
 
/* ============================================
   SCORES RENDERING
   ============================================ */
function renderScores(res) {
  var h2 = res.headers2;
  var h3 = res.headers3;
  var s = res.scores;
 
  var html = "";
 
  // Section colors for visual variety
  var sectionColors = [
    { bg: "#4f6df5", label: "MT" },
    { bg: "#7c5cfc", label: "ME" },
    { bg: "#14b8a6", label: "FP" },
    { bg: "#f59e0b", label: "FF" },
    { bg: "#ec4899", label: "FE" }
  ];
 
  html += createSection(
    "Midterm Collective",
    h2.slice(6, 21),
    h3.slice(6, 21),
    s.slice(6, 21),
    h3[21],
    h3[22],
    s[31],
    "AE Overall",
    h3[30],
    s[31],
    sectionColors[0]
  );
 
  html += createSection(
    "Midterm Exam",
    h2.slice(23, 28),
    h3.slice(23, 28),
    s.slice(23, 28),
    h3[28],
    h3[29],
    s[31],
    "AF Status",
    h3[30],
    s[31],
    sectionColors[1]
  );
 
  html += createSection(
    "Final Collective (Partial)",
    h2.slice(32, 47),
    h3.slice(32, 47),
    s.slice(32, 47),
    h3[47],
    h3[48],
    s[50],
    "AX Overall",
    h3[49],
    s[50],
    sectionColors[2]
  );
 
  if (h3[62] && h3[62] != 0) {
    html += createSection(
      "Final Collective (Final)",
      h2.slice(51, 61),
      h3.slice(51, 61),
      s.slice(51, 61),
      h3[61],
      h3[62],
      s[64],
      "BL Overall",
      h3[63],
      s[64],
      sectionColors[3]
    );
  }
 
  html += createSection(
    "Final Exam",
    h2.slice(65, 70),
    h3.slice(65, 70),
    s.slice(65, 70),
    h3[70],
    h3[71],
    s[73],
    "BU Overall",
    h3[72],
    s[73],
    sectionColors[4]
  );
 
  // Final Grade
  html +=
    '<div class="card final-grade-card">' +
    '<div class="final-grade-label">Final Grade Classification</div>' +
    '<div class="final-grade-value">' +
    escapeHtml(String(s[74] || "N/A")) +
    "</div>" +
    "</div>";
 
  document.getElementById("scoresArea").innerHTML = html;
}
 
function createSection(title, activities, highest, scores, total, equivalent, remarks, overallLabel, overallHighest, overallStudent, color) {
  var rows = "";
  for (var i = 0; i < activities.length; i++) {
    if (activities[i] !== "" && activities[i] != null) {
      rows +=
        "<tr>" +
        "<td>" + escapeHtml(String(activities[i])) + "</td>" +
        "<td>" + escapeHtml(String(highest[i] || "")) + "</td>" +
        "<td>" + escapeHtml(String(scores[i] || "")) + "</td>" +
        "</tr>";
    }
  }
 
  var statusHtml = "";
  if (String(remarks).toUpperCase().indexOf("PASS") !== -1) {
    statusHtml =
      '<div class="status-banner status-pass">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
      "Congratulations! You Passed" +
      "</div>";
  } else {
    statusHtml =
      '<div class="status-banner status-fail">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      "Please contact your teacher via LINE or visit the faculty room" +
      "</div>";
  }
 
  return (
    '<div class="card section-card">' +
    '<div class="section-header">' +
    '<div class="section-badge" style="background:' + color.bg + ';">' + color.label + "</div>" +
    '<div class="section-title">' + escapeHtml(title) + "</div>" +
    "</div>" +
    '<div class="table-wrapper">' +
    "<table>" +
    "<thead><tr>" +
    "<th>Activity</th>" +
    "<th>Highest Possible</th>" +
    "<th>Your Score</th>" +
    "</tr></thead>" +
    "<tbody>" +
    rows +
    "</tbody>" +
    "</table>" +
    "</div>" +
    '<div class="summary-box">' +
    '<div class="summary-item">' +
    '<span class="summary-label">Total Possible</span>' +
    '<span class="summary-value">' + escapeHtml(String(total || "")) + "</span>" +
    "</div>" +
    '<div class="summary-item">' +
    '<span class="summary-label">Equivalent</span>' +
    '<span class="summary-value">' + escapeHtml(String(equivalent || "")) + "</span>" +
    "</div>" +
    '<div class="summary-item">' +
    '<span class="summary-label">' + escapeHtml(overallLabel) + "</span>" +
    '<span class="summary-value">' + escapeHtml(String(overallHighest || "")) + "</span>" +
    "</div>" +
    '<div class="summary-item">' +
    '<span class="summary-label">Your Result</span>' +
    '<span class="summary-value">' + escapeHtml(String(overallStudent || "")) + "</span>" +
    "</div>" +
    "</div>" +
    statusHtml +
    "</div>"
  );
}
 
/* ============================================
   PRINT GRADES — 1/4 A4 Bond Paper
   ============================================ */
function printGrades() {
  if (!currentResponse) return;
 
  var res = currentResponse;
  var s = res.scores;
  var h2 = res.headers2;
  var h3 = res.headers3;
 
  var printHtml = "";
 
  // Header
  printHtml +=
    '<div class="print-header">' +
    "<h1>Student Grade Report</h1>" +
    "</div>";
 
  // Student Info
  printHtml +=
    '<div class="print-student-info">' +
    "<div><span class='psi-label'>ID:</span> " + escapeHtml(String(res.student.id)) + "</div>" +
    "<div><span class='psi-label'>Section:</span> " + escapeHtml(String(res.student.section)) + "</div>" +
    "<div><span class='psi-label'>Name:</span> " + escapeHtml(String(res.student.english)) + "</div>" +
    "<div><span class='psi-label'>Class:</span> " + escapeHtml(String(res.student.class)) + "</div>" +
    "</div>";
 
  // Build compact score sections
  var sections = [
    { title: "Midterm Collective", acts: h2.slice(6, 21), high: h3.slice(6, 21), sc: s.slice(6, 21), total: h3[21], equiv: h3[22] },
    { title: "Midterm Exam", acts: h2.slice(23, 28), high: h3.slice(23, 28), sc: s.slice(23, 28), total: h3[28], equiv: h3[29] },
    { title: "Final Collective (Partial)", acts: h2.slice(32, 47), high: h3.slice(32, 47), sc: s.slice(32, 47), total: h3[47], equiv: h3[48] }
  ];
 
  if (h3[62] && h3[62] != 0) {
    sections.push({ title: "Final Collective (Final)", acts: h2.slice(51, 61), high: h3.slice(51, 61), sc: s.slice(51, 61), total: h3[61], equiv: h3[62] });
  }
 
  sections.push({ title: "Final Exam", acts: h2.slice(65, 70), high: h3.slice(65, 70), sc: s.slice(65, 70), total: h3[70], equiv: h3[71] });
 
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    printHtml += '<div class="print-section-title">' + escapeHtml(sec.title) + "</div>";
    printHtml += '<table class="print-scores-table"><tr><th>Activity</th><th>Max</th><th>Score</th></tr>';
    for (var j = 0; j < sec.acts.length; j++) {
      if (sec.acts[j] !== "" && sec.acts[j] != null) {
        printHtml +=
          "<tr><td>" + escapeHtml(String(sec.acts[j])) +
          "</td><td>" + escapeHtml(String(sec.high[j] || "")) +
          "</td><td>" + escapeHtml(String(sec.sc[j] || "")) +
          "</td></tr>";
      }
    }
    printHtml += "</table>";
    printHtml +=
      '<div class="print-summary-row">' +
      "<span>Total: <strong>" + escapeHtml(String(sec.total || "")) + "</strong></span>" +
      "<span>Equivalent: <strong>" + escapeHtml(String(sec.equiv || "")) + "</strong></span>" +
      "</div>";
  }
 
  // Final grade
  printHtml +=
    '<div class="print-final-grade">' +
    "Final Grade: <span>" + escapeHtml(String(s[74] || "N/A")) + "</span>" +
    "</div>";
 
  var container = document.getElementById("printContainer");
  container.innerHTML = printHtml;
 
  window.print();
}
 
/* ============================================
   DOWNLOAD GRADES AS IMAGE
   ============================================ */
function downloadGradeImage() {
  if (!currentResponse) return;
  // Build the print content first
  printGrades();
  alert("Use your browser's Print dialog and select 'Save as PDF' to save your grades.");
}
 
/* ============================================
   LOGOUT
   ============================================ */
function logout() {
  currentStudent = null;
  currentResponse = null;
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("loginCard").classList.remove("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("password").type = "password";
  document.getElementById("message").innerHTML = "";
  document.getElementById("scoresArea").innerHTML = "";
}
 
/* ============================================
   PASSWORD RESET REQUEST
   ============================================ */
function requestPassword() {
  var id = document.getElementById("username").value.trim();
  if (!id) {
    document.getElementById("message").innerHTML =
      '<div class="msg-error">Please enter your Student ID first.</div>';
    return;
  }
 
  callGAS("requestPasswordReset", { studentID: id })
    .then(function (msg) {
      document.getElementById("message").innerHTML =
        '<div class="msg-success">' + escapeHtml(msg) + " Please contact your subject teacher.</div>";
    })
    .catch(function (err) {
      document.getElementById("message").innerHTML =
        '<div class="msg-error">' + escapeHtml(err.message || err) + "</div>";
    });
}
 
/* ============================================
   GOOGLE APPS SCRIPT API CALLER
   ============================================ */
function callGAS(action, params) {
  return fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: action, params: params })
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (data.error) {
        throw new Error(data.error);
      }
      return data;
    });
}
 
/* ============================================
   UTILITY
   ============================================ */
function escapeHtml(str) {
  if (!str) return "";
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}