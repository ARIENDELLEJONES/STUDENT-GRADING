/**
 * STUDENT ACADEMIC PORTAL — Google Apps Script Backend
 *
 * Deploy this as a Web App:
 *   1. Open Google Apps Script editor
 *   2. Click Deploy > New deployment
 *   3. Select "Web app"
 *   4. Set "Execute as" to your account
 *   5. Set "Who has access" to "Anyone"
 *   6. Click Deploy and copy the URL
 *   7. Paste the URL into js/app.js as GAS_WEB_APP_URL
 *
 * IMPORTANT: Do NOT change the spreadsheet ID, sheet name,
 * or any table structure below.
 */
const SPREADSHEET_ID = "10qEDXcA-5GqbuJzjYSdGDZjFJgZw8amQEELJlgx2Qlc";
const SHEET_NAME = "tblDatabase";
/**
 * GET SHEET
 */
function getSheet() {
  return SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME);
}
/**
 * WEB APP — GET (health check)
 */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Student Portal API is running." }))
    .setMimeType(ContentService.MimeType.JSON);
}
/**
 * WEB APP — POST (API endpoint)
 * Receives JSON: { action: "loginStudent"|"requestPasswordReset", params: {...} }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var params = body.params || {};
    var result;
    if (action === "loginStudent") {
      result = loginStudent(params.username, params.password);
    } else if (action === "requestPasswordReset") {
      result = requestPasswordReset(params.studentID);
    } else {
      result = { error: "Unknown action: " + action };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
/**
 * LOGIN
 */
function loginStudent(username, password) {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var headers2 = sheet.getRange(2, 1, 1, 75).getValues()[0];
    var headers3 = sheet.getRange(3, 1, 1, 75).getValues()[0];
    var data = sheet
      .getRange(4, 1, lastRow - 3, 77)
      .getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (
        String(row[0]).trim() === String(username).trim() &&
        String(row[5]).trim() === String(password).trim()
      ) {
        return {
          success: true,
          student: {
            id: row[0],
            thai: row[1],
            english: row[2],
            section: row[3],
            class: row[4]
          },
          headers2: headers2,
          headers3: headers3,
          scores: row
        };
      }
    }
    return {
      success: false,
      message: "Invalid Student ID or Password"
    };
  } catch (err) {
    return {
      success: false,
      message: err.toString()
    };
  }
}
/**
 * PASSWORD CHANGE REQUEST
 */
function requestPasswordReset(studentID) {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var ids = sheet
      .getRange(4, 1, lastRow - 3, 1)
      .getValues();
    for (var i = 0; i < ids.length; i++) {
      if (
        String(ids[i][0]).trim() ===
        String(studentID).trim()
      ) {
        sheet.getRange(i + 4, 76)
          .setValue("PASSWORD CHANGE REQUEST");
        sheet.getRange(i + 4, 77)
          .setValue(new Date());
        return "Password request submitted successfully.";
      }
    }
    return "Student ID not found.";
  } catch (err) {
    return err.toString();
  }
}