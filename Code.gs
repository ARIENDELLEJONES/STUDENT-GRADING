// Code.gs - COMPREHENSIVE GRADE MANAGEMENT SYSTEM
// Updated with PDF/Excel/Image downloads, enhanced UI, and full functionality


function doGet(e) {
  try {
    return HtmlService.createTemplateFromFile('index_file')
      .evaluate()
      .setTitle('Grade Dashboard System')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput('<h1>Error Loading App</h1><p>' + error.message + '</p>');
  }
}


function include(filename) {
  filename = normalizeValue(filename);
  if (!filename) return '';
  var normalized = filename.replace(/\.html$/i, '').trim();
  if (!normalized) return '';
  try {
    return HtmlService.createHtmlOutputFromFile(normalized).getContent();
  } catch (e1) {
    var lower = normalized.toLowerCase();
    if (lower !== normalized) {
      try {
        return HtmlService.createHtmlOutputFromFile(lower).getContent();
      } catch (e2) {
        return '';
      }
    }
    return '';
  }
}


// ==================== UTILITY FUNCTIONS ====================


function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}


function normalizeId(value) {
  return normalizeValue(value).replace(/\s+/g, '').toLowerCase();
}


function parseNumberSafe(value) {
  if (value === null || value === undefined) return '';
  var str = normalizeValue(value);
  if (str === '') return '';
  var num = parseFloat(str.replace(/[^\d.\-]/g, ''));
  return isNaN(num) ? '' : num;
}


function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}


function getCellValue(row, index) {
  row = safeArray(row);
  var val = row[index];
  if (val === null || val === undefined) return '';
  var str = normalizeValue(val);
  // Check if it's an error value
  if (str.indexOf('#') === 0 || str.toLowerCase().indexOf('error') >= 0) return '';
  return str;
}


function getNumberValue(row, index) {
  var val = getCellValue(row, index);
  if (val === '') return '';
  return parseNumberSafe(val);
}


// ==================== SPREADSHEET CONFIGURATION ====================


var MAIN_SPREADSHEET_ID = '10qEDXcA-5GqbuJzjYSdGDZjFJgZw8amQEELJlgx2Qlc';


function getActiveContainer() {
  if (!MAIN_SPREADSHEET_ID || String(MAIN_SPREADSHEET_ID).trim() === '') {
    throw new Error('MAIN_SPREADSHEET_ID not set.');
  }
  return SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
}


function getSheetValues(spreadsheet, sheetName) {
  if (!sheetName) sheetName = '(unknown)';
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== 'function') {
    throw new Error('getSheetValues: spreadsheet is undefined. sheetName=' + sheetName);
  }
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];
  if (typeof sheet.getDisplayValues === 'function') return sheet.getDisplayValues();
  if (typeof sheet.getDataRange === 'function') return sheet.getDataRange().getDisplayValues();
  return [];
}


function getSpreadsheetId(link) {
  if (link === null || link === undefined) return '';
  var str = normalizeValue(String(link));
  if (!str) return '';
  if (/^[a-zA-Z0-9-_]{20,}$/.test(str)) return str;
  var m1 = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m1 && m1[1]) return m1[1];
  var m2 = str.match(/\/spreadsheets\/u\/\d+\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m2 && m2[1]) return m2[1];
  var m3 = str.match(/[?&]key=([a-zA-Z0-9-_]{20,})/);
  if (m3 && m3[1]) return m3[1];
  return '';
}


function openSpreadsheetByLink(link) {
  var id = getSpreadsheetId(link);
  if (!id) {
    throw new Error('Invalid spreadsheet link.');
  }
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('Unable to open spreadsheet. Check sharing permissions.');
  }
}


// ==================== DATABASE CONFIG ====================


function getDatabaseConfig() {
  var ss = getActiveContainer();
  var sheet = ss.getSheetByName('DatabaseConfig');
  if (!sheet) {
    sheet = ss.insertSheet('DatabaseConfig');
    sheet.getRange(1, 1, 1, 2).setValues([['Database Name', 'Spreadsheet Link']]);
  }
  var values = sheet.getDataRange().getDisplayValues();
  var config = [];
  for (var i = 1; i < values.length && config.length < 5; i++) {
    if (values[i][0] && values[i][1]) {
      config.push({
        name: normalizeValue(values[i][0]),
        link: normalizeValue(values[i][1])
      });
    }
  }
  return config;
}


function saveDatabaseConfig(name, link) {
  if (!name || !link) throw new Error('Database name and link are required.');
  var ss = getActiveContainer();
  var sheet = ss.getSheetByName('DatabaseConfig');
  if (!sheet) {
    sheet = ss.insertSheet('DatabaseConfig');
    sheet.getRange(1, 1, 1, 2).setValues([['Database Name', 'Spreadsheet Link']]);
  }
  var values = sheet.getDataRange().getDisplayValues();
  var found = false;
  for (var i = 1; i < values.length; i++) {
    if (normalizeValue(values[i][0]).toLowerCase() === normalizeValue(name).toLowerCase()) {
      sheet.getRange(i + 1, 1, 1, 2).setValues([[name, link]]);
      found = true;
      break;
    }
  }
  if (!found && values.length <= 5) {
    sheet.appendRow([name, link]);
  }
  return getDatabaseConfig();
}


function deleteDatabaseConfig(name) {
  var ss = getActiveContainer();
  var sheet = ss.getSheetByName('DatabaseConfig');
  if (!sheet) return getDatabaseConfig();
  var values = sheet.getDataRange().getDisplayValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (normalizeValue(values[i][0]).toLowerCase() === normalizeValue(name).toLowerCase()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return getDatabaseConfig();
}


// ==================== LOGIN VALIDATION ====================


function validateLogin(role, userId, password) {
  try {
    userId = normalizeId(userId);
    password = normalizeValue(password);


if (!userId || !password) {
  return { success: false, message: 'Please provide both ID and password.' };
}

var ss = getActiveContainer();

if (role === 'admin') {
  var admins = getSheetValues(ss, 'tblAdmin');
  for (var i = 1; i < admins.length; i++) {
    if (normalizeId(admins[i][0]) === userId && normalizeValue(admins[i][1]) === password) {
      return {
        success: true,
        role: 'admin',
        name: normalizeValue(admins[i][2]) || 'Admin',
        photo: normalizeValue(admins[i][3]) || '',
        access: 'edit',
        accessText: 'Administrator'
      };
    }
  }
  return { success: false, message: 'Admin ID or password is incorrect.' };
}

if (role === 'teacher') {
  var teachers = getSheetValues(ss, 'tblTeacher');
  for (var j = 1; j < teachers.length; j++) {
    if (normalizeId(teachers[j][0]) === userId && normalizeValue(teachers[j][1]) === password) {
      var accessText = normalizeValue(teachers[j][3]).toLowerCase();
      var access = 'unauthorized';
      
      if (accessText.indexOf('edit') !== -1 && accessText.indexOf('authorized') !== -1) {
        access = 'edit';
      } else if ((accessText.indexOf('view') !== -1 || accessText.indexOf('read') !== -1) && accessText.indexOf('authorized') !== -1) {
        access = 'view';
      } else if (accessText.indexOf('unauthorized') !== -1) {
        access = 'unauthorized';
      }

      return {
        success: true,
        role: 'teacher',
        name: normalizeValue(teachers[j][2]) || 'Teacher',
        access: access,
        accessText: normalizeValue(teachers[j][3]) || 'Unknown'
      };
    }
  }
  return { success: false, message: 'Teacher ID or password is incorrect.' };
}

if (role === 'student') {
  return validateStudentLogin(userId, password);
}

return { success: false, message: 'Invalid role selected.' };

  } catch (error) {
    console.error('validateLogin error:', error);
    return { success: false, message: 'Login error: ' + error.message };
  }
}

function validateStudentLogin(userId, password) {
  var configs = getDatabaseConfig();
  if (!configs.length) {
    return { success: false, message: 'No student databases configured yet.' };
  }

  for (var i = 0; i < configs.length; i++) {
    var cfg = configs[i];
    try {
      var db = loadDatabase(cfg.link).sheets;
      var rows = safeArray(db.tblDatabase);

      for (var r = 3; r < rows.length; r++) {
        var row = safeArray(rows[r]);
        if (normalizeId(row[0]) === userId && normalizeValue(row[5]) === password) {
          return {
            success: true,
            role: 'student',
            access: 'view',
            accessText: 'Student',
            name: normalizeValue(row[2]) || normalizeValue(row[1]) || normalizeValue(row[0]) || 'Student',
            studentId: normalizeValue(row[0]),
            dbName: cfg.name,
            dbLink: cfg.link
          };
        }
      }
    } catch (err) {
      // Continue scanning other configured databases.
    }
  }

  return { success: false, message: 'Student ID or password is incorrect.' };
}


// ==================== DATABASE LOADING ====================


function loadDatabase(link) {
  var ss = openSpreadsheetByLink(link);


  var requiredSheets = [
    'tblDatabase', 'tblActivityName', 'tblActivityScore',
    'tblMidtermCollectiveIndividual', 'tblMidtermGroup',
    'tblFinalCollectiveIndividual_1', 'tblFinalGroup_1',
    'tblFinalCollectiveIndividual_2', 'tblFinalGroup_2',
    'tblGroupDatabase', 'tblGradingWeights',
    'tblExamTypes', 'tblExamTypesScore',
    'tblMidtermExam', 'tblFinalExam'
  ];


  var missing = [];
  for (var k = 0; k < requiredSheets.length; k++) {
    if (!ss.getSheetByName(requiredSheets[k])) missing.push(requiredSheets[k]);
  }
  if (missing.length) {
    throw new Error('Missing required sheets: ' + missing.join(', '));
  }


  return {
    link: link,
    sheets: {
      tblDatabase: getSheetValues(ss, 'tblDatabase'),
      tblActivityName: getSheetValues(ss, 'tblActivityName'),
      tblActivityScore: getSheetValues(ss, 'tblActivityScore'),
      tblMidtermCollectiveIndividual: getSheetValues(ss, 'tblMidtermCollectiveIndividual'),
      tblMidtermGroup: getSheetValues(ss, 'tblMidtermGroup'),
      tblFinalCollectiveIndividual_1: getSheetValues(ss, 'tblFinalCollectiveIndividual_1'),
      tblFinalGroup_1: getSheetValues(ss, 'tblFinalGroup_1'),
      tblFinalCollectiveIndividual_2: getSheetValues(ss, 'tblFinalCollectiveIndividual_2'),
      tblFinalGroup_2: getSheetValues(ss, 'tblFinalGroup_2'),
      tblGroupDatabase: getSheetValues(ss, 'tblGroupDatabase'),
      tblGradingWeights: getSheetValues(ss, 'tblGradingWeights'),
      tblExamTypes: getSheetValues(ss, 'tblExamTypes'),
      tblExamTypesScore: getSheetValues(ss, 'tblExamTypesScore'),
      tblMidtermExam: getSheetValues(ss, 'tblMidtermExam'),
      tblFinalExam: getSheetValues(ss, 'tblFinalExam')
    }
  };
}


// ==================== STUDENT SEARCH ====================


function searchStudentRecords(link, searchId) {
  var db = loadDatabase(link).sheets;
  if (!searchId) throw new Error('Student ID is required.');


  var normalized = normalizeId(searchId);
  var student = findRowById(db.tblDatabase, 0, normalized);


  return {
    studentRow: student,
    studentTableHeader: safeArray(db.tblDatabase[2]),
    activityNameHeader: safeArray(db.tblActivityName[1]),
    activityScoreHeader: safeArray(db.tblActivityScore[1]),
    gradingWeights: safeArray(db.tblGradingWeights[1]),
    examTypes: safeArray(db.tblExamTypes[1]),
    examTypesScore: safeArray(db.tblExamTypesScore[1]),
    midtermCollective: findRowById(db.tblMidtermCollectiveIndividual, 0, normalized),
    midtermGroup: findRowById(db.tblMidtermGroup, 0, normalized),
    finalCollective1: findRowById(db.tblFinalCollectiveIndividual_1, 0, normalized),
    finalGroup1: findRowById(db.tblFinalGroup_1, 0, normalized),
    finalCollective2: findRowById(db.tblFinalCollectiveIndividual_2, 0, normalized),
    finalGroup2: findRowById(db.tblFinalGroup_2, 0, normalized),
    midtermExam: findRowById(db.tblMidtermExam, 0, normalized),
    finalExam: findRowById(db.tblFinalExam, 0, normalized)
  };
}


function findRowById(rows, idColumnIndex, studentId) {
  rows = safeArray(rows);
  var normalized = normalizeId(studentId);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeId(rows[i] && rows[i][idColumnIndex]) === normalized) {
      return { rowNumber: i + 1, values: rows[i] };
    }
  }
  return null;
}


// ==================== SCORE SAVING ====================


function saveStudentScoreBlock(link, sheetName, startColumn, updates) {
  var ss = openSpreadsheetByLink(link);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);


  var data = sheet.getDataRange().getDisplayValues();
  for (var i = 0; i < updates.length; i++) {
    var update = updates[i];
    var rowMatch = findRowById(data, 0, update.studentId);
    if (!rowMatch) continue;
    var targetRow = rowMatch.rowNumber;
    var range = sheet.getRange(targetRow, startColumn, 1, update.values.length);
    range.setValues([update.values]);
  }
  return { success: true };
}


function saveGradingWeights(link, weights) {
  var ss = openSpreadsheetByLink(link);
  var sheet = ss.getSheetByName('tblGradingWeights');
  if (!sheet) throw new Error('Sheet not found: tblGradingWeights');


  sheet.getRange(2, 1, 1, 5).setValues([[
    weights.midtermCollective || '',
    weights.finalCollectiveInitial || '',
    weights.finalCollectiveFinal || '',
    weights.midtermExam || '',
    weights.finalExam || ''
  ]]);


  sheet.getRange(2, 7, 1, 4).setValues([[
    weights.passMidterm || '',
    weights.passInitial || '',
    weights.passFinal || '',
    weights.overallPass || ''
  ]]);


  return { success: true };
}


function saveExamTypes(link, examSide, types, scores) {
  var ss = openSpreadsheetByLink(link);
  var sheet = ss.getSheetByName('tblExamTypes');
  var scoreSheet = ss.getSheetByName('tblExamTypesScore');
  if (!sheet || !scoreSheet) throw new Error('Missing exam type sheet.');

  // Read existing rows first so saving one side does not wipe the other
  var existingTypes  = sheet.getDataRange().getValues();
  var existingScores = scoreSheet.getDataRange().getValues();

  var typeRow  = (existingTypes.length  > 1) ? existingTypes[1].slice()  : [];
  var scoreRow = (existingScores.length > 1) ? existingScores[1].slice() : [];

  while (typeRow.length  < 10) typeRow.push('');
  while (scoreRow.length < 10) scoreRow.push('');

  var startIndex = examSide === 'midterm' ? 0 : 5;

  for (var i = 0; i < Math.min(5, types.length); i++) {
    typeRow[startIndex + i]  = normalizeValue(types[i]);
    scoreRow[startIndex + i] = normalizeValue(scores[i]);
  }

  sheet.getRange(2, 1, 1, 10).setValues([typeRow]);
  scoreSheet.getRange(2, 1, 1, 10).setValues([scoreRow]);

  return { success: true };
}


// ==================== SUBJECT CONFIG READ-BACK ====================


function getSubjectConfig(link) {
  var ss = openSpreadsheetByLink(link);

  var weightsSheet = ss.getSheetByName('tblGradingWeights');
  var examTypesSheet = ss.getSheetByName('tblExamTypes');
  var examScoresSheet = ss.getSheetByName('tblExamTypesScore');

  var weightsData = weightsSheet ? weightsSheet.getDataRange().getDisplayValues() : [];
  var typesData = examTypesSheet ? examTypesSheet.getDataRange().getDisplayValues() : [];
  var scoresData = examScoresSheet ? examScoresSheet.getDataRange().getDisplayValues() : [];

  var weightsRow = (weightsData.length > 1) ? safeArray(weightsData[1]) : [];
  var typesRow = (typesData.length > 1) ? safeArray(typesData[1]) : [];
  var scoresRow = (scoresData.length > 1) ? safeArray(scoresData[1]) : [];

  return {
    weights: {
      midtermCollective:    normalizeValue(weightsRow[0]),
      finalCollectiveInitial: normalizeValue(weightsRow[1]),
      finalCollectiveFinal: normalizeValue(weightsRow[2]),
      midtermExam:          normalizeValue(weightsRow[3]),
      finalExam:            normalizeValue(weightsRow[4]),
      passMidterm:          normalizeValue(weightsRow[6]),
      passInitial:          normalizeValue(weightsRow[7]),
      passFinal:            normalizeValue(weightsRow[8]),
      overallPass:          normalizeValue(weightsRow[9])
    },
    examTypes: {
      midterm: [
        { type: normalizeValue(typesRow[0]), score: normalizeValue(scoresRow[0]) },
        { type: normalizeValue(typesRow[1]), score: normalizeValue(scoresRow[1]) },
        { type: normalizeValue(typesRow[2]), score: normalizeValue(scoresRow[2]) },
        { type: normalizeValue(typesRow[3]), score: normalizeValue(scoresRow[3]) },
        { type: normalizeValue(typesRow[4]), score: normalizeValue(scoresRow[4]) }
      ],
      final: [
        { type: normalizeValue(typesRow[5]), score: normalizeValue(scoresRow[5]) },
        { type: normalizeValue(typesRow[6]), score: normalizeValue(scoresRow[6]) },
        { type: normalizeValue(typesRow[7]), score: normalizeValue(scoresRow[7]) },
        { type: normalizeValue(typesRow[8]), score: normalizeValue(scoresRow[8]) },
        { type: normalizeValue(typesRow[9]), score: normalizeValue(scoresRow[9]) }
      ]
    }
  };
}


// ==================== ACTIVITY MANAGEMENT ====================


function saveActivityNamesScores(link, period, individualNames, individualScores, groupNames, groupScores) {
  var ss = openSpreadsheetByLink(link);
  var nameSheet = ss.getSheetByName('tblActivityName');
  var scoreSheet = ss.getSheetByName('tblActivityScore');
  if (!nameSheet || !scoreSheet) throw new Error('Missing activity sheets.');


  var nameRow = safeArray(nameSheet.getRange(2, 1, 1, nameSheet.getMaxColumns()).getValues()[0]);
  var scoreRow = safeArray(scoreSheet.getRange(2, 1, 1, scoreSheet.getMaxColumns()).getValues()[0]);


  var ranges = {
    'midterm': { indStart: 0, indCount: 10, grpStart: 10, grpCount: 5 },
    'final_initial': { indStart: 15, indCount: 10, grpStart: 30, grpCount: 5 },
    'final_final': { indStart: 25, indCount: 5, grpStart: 35, grpCount: 5 }
  };


  var range = ranges[period];
  if (!range) throw new Error('Invalid period: ' + period);


  for (var i = 0; i < range.indCount && i < individualNames.length; i++) {
    nameRow[range.indStart + i] = individualNames[i] || '';
    scoreRow[range.indStart + i] = individualScores[i] || '';
  }


  for (var j = 0; j < range.grpCount && j < groupNames.length; j++) {
    nameRow[range.grpStart + j] = groupNames[j] || '';
    scoreRow[range.grpStart + j] = groupScores[j] || '';
  }


  nameSheet.getRange(2, 1, 1, nameRow.length).setValues([nameRow]);
  scoreSheet.getRange(2, 1, 1, scoreRow.length).setValues([scoreRow]);


  return { success: true };
}


function saveGroupActivity(link, period, activityNumber, name, score) {
  var ss = openSpreadsheetByLink(link);
  var activitySheet = ss.getSheetByName('tblActivityName');
  var scoreSheet = ss.getSheetByName('tblActivityScore');
  if (!activitySheet || !scoreSheet) throw new Error('Missing activity sheets.');


  var columnMap = {
    'midterm': { nameStart: 11, scoreStart: 11 },
    'final_initial': { nameStart: 31, scoreStart: 31 },
    'final_final': { nameStart: 36, scoreStart: 36 }
  };


  var map = columnMap[period];
  if (!map || activityNumber < 1 || activityNumber > 5) throw new Error('Invalid activity period or number.');


  activitySheet.getRange(2, map.nameStart + activityNumber - 1).setValue(name);
  scoreSheet.getRange(2, map.scoreStart + activityNumber - 1).setValue(score);


  return { success: true };
}


// ==================== GROUP MANAGEMENT ====================


function getSectionStudents(link, sectionNumber) {
  var db = loadDatabase(link).sheets.tblDatabase;
  var students = [];


  for (var i = 3; i < db.length; i++) {
    var row = db[i];
    if (!row[0]) continue;
    if (sectionNumber && normalizeId(row[3]) !== normalizeId(sectionNumber)) continue;
    students.push({
      rowNumber: i + 1,
      studentId: normalizeValue(row[0]),
      thaiName: normalizeValue(row[1]),
      englishName: normalizeValue(row[2]),
      section: normalizeValue(row[3]),
      classNumber: normalizeValue(row[4])
    });
  }


  // Sort by class number
  students.sort(function(a, b) {
    var numA = parseInt(parseNumberSafe(a.classNumber)) || 0;
    var numB = parseInt(parseNumberSafe(b.classNumber)) || 0;
    return numA - numB;
  });


  return students;
}


function getSections(link) {
  var db = loadDatabase(link).sheets.tblDatabase;
  var sections = {};


  for (var i = 3; i < db.length; i++) {
    var row = db[i];
    if (!row[0]) continue;
    var sec = normalizeId(row[3]);
    if (sec && !sections[sec]) {
      sections[sec] = normalizeValue(row[3]);
    }
  }


  return Object.keys(sections).sort().map(function(key) {
    return { id: key, label: sections[key] };
  });
}


function generateAutoGroups(link, sectionNumber, groupCount) {
  var students = getSectionStudents(link, sectionNumber);
  if (!students.length) return [];


  groupCount = Math.max(1, Math.min(10, Number(groupCount)));
  var groups = [];


  for (var i = 0; i < groupCount; i++) {
    groups.push({ groupNumber: i + 1, members: [] });
  }


  students.forEach(function(student, index) {
    var target = index % groupCount;
    groups[target].members.push(student);
  });


  return groups;
}


function appendGroupDatabase(link, item) {
  var ss = openSpreadsheetByLink(link);
  var sheet = ss.getSheetByName('tblGroupDatabase');
  if (!sheet) throw new Error('Sheet not found: tblGroupDatabase');


  sheet.appendRow([
    item.groupId || '',
    item.groupNumber || '',
    item.section || '',
    item.period || '',
    item.activityNumber || '',
    item.activityName || '',
    item.members || '',
    item.place || '',
    item.scores || '',
    item.isClosed || 'open',
    item.demerits || ''
  ]);


  return { success: true };
}


function saveAutoGroups(link, groupEntries) {
  if (!groupEntries || !groupEntries.length) throw new Error('No group entries to save.');


  groupEntries.forEach(function(entry) {
    if (!entry.groupId) {
      entry.groupId = entry.section + '-' + entry.period + '-' + entry.activityNumber + '-g' + entry.groupNumber;
    }
    appendGroupDatabase(link, entry);
  });


  return { success: true };
}


function loadGroupDatabaseRows(link, sectionNumber, groupNumber, openOnly) {
  var db = loadDatabase(link).sheets.tblGroupDatabase;
  if (!db || !db.length) return [];


  var rows = [];
  for (var i = 1; i < db.length; i++) {
    var row = db[i];
    if (sectionNumber && normalizeId(row[2]) !== normalizeId(sectionNumber)) continue;
    if (groupNumber && normalizeId(row[1]) !== normalizeId(groupNumber)) continue;
    if (openOnly && normalizeValue(row[9]).toLowerCase() === 'closed') continue;
    rows.push({ rowNumber: i + 1, values: row });
  }


  return rows;
}


function updateGroupDatabaseRow(link, rowNumber, updates) {
  var ss = openSpreadsheetByLink(link);
  var sheet = ss.getSheetByName('tblGroupDatabase');
  if (!sheet) throw new Error('Sheet not found: tblGroupDatabase');


  var rowValues = sheet.getRange(rowNumber, 1, 1, 11).getValues()[0];


  Object.keys(updates).forEach(function(key) {
    var columnIndex = {
      groupId: 0, groupNumber: 1, section: 2, period: 3,
      activityNumber: 4, activityName: 5, members: 6,
      place: 7, scores: 8, isClosed: 9, demerits: 10
    }[key];
    if (columnIndex !== undefined) {
      rowValues[columnIndex] = updates[key];
    }
  });


  sheet.getRange(rowNumber, 1, 1, 11).setValues([rowValues]);
  return { success: true };
}


function saveGroupResultScores(link, period, activityNumber, updates) {
  var sheetName = period === 'midterm'
    ? 'tblMidtermGroup'
    : (period === 'final_initial' ? 'tblFinalGroup_1' : 'tblFinalGroup_2');


  var destinationStart = 2 + (activityNumber - 1);
  return saveStudentScoreBlock(link, sheetName, destinationStart, updates);
}


function getSavedGroupActivities(link) {
  var db = loadDatabase(link).sheets;
  var names = safeArray(db.tblActivityName[1]);
  var scores = safeArray(db.tblActivityScore[1]);
  var saved = [];


  var periods = [
    { key: 'midterm', start: 10, count: 5 },
    { key: 'final_initial', start: 30, count: 5 },
    { key: 'final_final', start: 35, count: 5 }
  ];


  periods.forEach(function(period) {
    for (var i = 0; i < period.count; i++) {
      var activityName = getCellValue(names, period.start + i);
      var activityScore = getCellValue(scores, period.start + i);
      if (activityName || activityScore) {
        saved.push({
          period: period.key,
          activityNumber: i + 1,
          name: activityName,
          score: activityScore
        });
      }
    }
  });


  return saved;
}


// ==================== SECTION GRADING ====================


function getSectionGrades(link, sectionNumber) {
  var db = loadDatabase(link).sheets.tblDatabase;
  var students = [];


  for (var i = 3; i < db.length; i++) {
    var row = db[i];
    if (!row[0]) continue;
    if (sectionNumber && normalizeId(row[3]) !== normalizeId(sectionNumber)) continue;


students.push({
  studentId: getCellValue(row, 0),
  thaiName: getCellValue(row, 1),
  englishName: getCellValue(row, 2),
  section: getCellValue(row, 3),
  classNumber: getCellValue(row, 4),
  // Midterm collective
  midtermCollective: getCellValue(row, 6) + ' - ' + getCellValue(row, 19),
  midtermTotal: getNumberValue(row, 21),
  midtermEquivalent: getCellValue(row, 22),
  // Midterm exam
  midtermExam: getCellValue(row, 23) + ' - ' + getCellValue(row, 27),
  midtermExamTotal: getNumberValue(row, 28),
  midtermExamEquivalent: getCellValue(row, 29),
  // Midterm overall
  midtermOverall: getNumberValue(row, 30),
  midtermResult: getCellValue(row, 31),
  // Final initial
  finalInitialCollective: getCellValue(row, 32) + ' - ' + getCellValue(row, 46),
  finalInitialTotal: getNumberValue(row, 47),
  finalInitialEquivalent: getCellValue(row, 48),
  // Final final
  finalFinalCollective: getCellValue(row, 51) + ' - ' + getCellValue(row, 59),
  finalFinalTotal: getNumberValue(row, 60),
  finalFinalEquivalent: getCellValue(row, 61),
  // Final exam
  finalExam: getCellValue(row, 62) + ' - ' + getCellValue(row, 66),
  finalExamTotal: getNumberValue(row, 70),
  finalExamEquivalent: getCellValue(row, 71),
  // Overall
  overallTotal: getNumberValue(row, 72),
  overallEquivalent: getCellValue(row, 73),
  result: getCellValue(row, 74)
});

  }


  // Sort by class number
  students.sort(function(a, b) {
    var numA = parseInt(parseNumberSafe(a.classNumber)) || 0;
    var numB = parseInt(parseNumberSafe(b.classNumber)) || 0;
    return numA - numB;
  });


  return {
    headerRow: safeArray(db[2]),
    students: students
  };
}


function getAllGrades(link) {
  return getSectionGrades(link, null);
}


// ==================== PASS/FAIL LIST ====================


function getPassFailList(link, studentId) {
  var db = loadDatabase(link).sheets.tblDatabase;
  var students = [];


  for (var i = 3; i < db.length; i++) {
    var row = db[i];
    if (!row[0]) continue;
    if (studentId && normalizeId(row[0]) !== normalizeId(studentId)) continue;


students.push({
  studentId: getCellValue(row, 0),
  thaiName: getCellValue(row, 1),
  englishName: getCellValue(row, 2),
  section: getCellValue(row, 3),
  classNumber: getCellValue(row, 4),
  midtermResult: getCellValue(row, 31),
  finalResult: getCellValue(row, 74),
  overallTotal: getNumberValue(row, 72)
});

  }


  return students;
}


// ==================== DOWNLOAD FUNCTIONS ====================


function generateExcelContent(data, headers) {
  var csv = [];


  if (headers && headers.length) {
    csv.push(headers.map(function(h) {
      return '"' + String(h).replace(/"/g, '""') + '"';
    }).join(','));
  }


  data.forEach(function(row) {
    csv.push(safeArray(row).map(function(cell) {
      return '"' + String(cell || '').replace(/"/g, '""') + '"';
    }).join(','));
  });


  return csv.join('\r\n');
}


function downloadAllGradesExcel(link) {
  var grades = getAllGrades(link);
  var headers = [
    'Student ID', 'Thai Name', 'English Name', 'Section', 'Class Number',
    'Midterm Total', 'Midterm Equivalent', 'Midterm Result',
    'Final Initial Total', 'Final Initial Equivalent',
    'Final Final Total', 'Final Final Equivalent',
    'Final Exam Total', 'Final Exam Equivalent',
    'Overall Total', 'Result'
  ];


  var data = grades.students.map(function(s) {
    return [
      s.studentId, s.thaiName, s.englishName, s.section, s.classNumber,
      s.midtermTotal || '', s.midtermEquivalent || '', s.midtermResult || '',
      s.finalInitialTotal || '', s.finalInitialEquivalent || '',
      s.finalFinalTotal || '', s.finalFinalEquivalent || '',
      s.finalExamTotal || '', s.finalExamEquivalent || '',
      s.overallTotal || '', s.result || ''
    ];
  });


  return generateExcelContent(data, headers);
}


function downloadSectionExcel(link, sectionNumber) {
  var grades = getSectionGrades(link, sectionNumber);
  var headers = [
    'Student ID', 'Thai Name', 'English Name', 'Section', 'Class Number',
    'Midterm Total', 'Midterm Equivalent', 'Midterm Result',
    'Final Initial Total', 'Final Initial Equivalent',
    'Final Final Total', 'Final Final Equivalent',
    'Final Exam Total', 'Final Exam Equivalent',
    'Overall Total', 'Result'
  ];


  var data = grades.students.map(function(s) {
    return [
      s.studentId, s.thaiName, s.englishName, s.section, s.classNumber,
      s.midtermTotal || '', s.midtermEquivalent || '', s.midtermResult || '',
      s.finalInitialTotal || '', s.finalInitialEquivalent || '',
      s.finalFinalTotal || '', s.finalFinalEquivalent || '',
      s.finalExamTotal || '', s.finalExamEquivalent || '',
      s.overallTotal || '', s.result || ''
    ];
  });


  return generateExcelContent(data, headers);
}


function downloadStudentReport(link, studentId) {
  var record = searchStudentRecords(link, studentId);
  if (!record.studentRow) throw new Error('Student not found.');


  var row = record.studentRow.values;
  var weights = safeArray(record.gradingWeights);
  var examTypes = safeArray(record.examTypes);
  var examScores = safeArray(record.examTypesScore);


  var report = {
    studentInfo: {
      studentId: getCellValue(row, 0),
      thaiName: getCellValue(row, 1),
      englishName: getCellValue(row, 2),
      section: getCellValue(row, 3),
      classNumber: getCellValue(row, 4)
    },
    weights: {
      midtermCollective: getCellValue(weights, 0),
      finalInitial: getCellValue(weights, 1),
      finalFinal: getCellValue(weights, 2),
      midtermExam: getCellValue(weights, 3),
      finalExam: getCellValue(weights, 4)
    },
    exams: {
      midterm: [],
      final: []
    },
    scores: {
      midterm: {
        collective: [],
        total: getNumberValue(row, 21),
        equivalent: getCellValue(row, 22)
      },
      finalInitial: {
        collective: [],
        total: getNumberValue(row, 47),
        equivalent: getCellValue(row, 48)
      },
      finalFinal: {
        collective: [],
        total: getNumberValue(row, 60),
        equivalent: getCellValue(row, 61)
      },
      midtermExam: {
        scores: [],
        total: getNumberValue(row, 28),
        equivalent: getCellValue(row, 29)
      },
      finalExam: {
        scores: [],
        total: getNumberValue(row, 70),
        equivalent: getCellValue(row, 71)
      },
      overall: {
        total: getNumberValue(row, 72),
        result: getCellValue(row, 74)
      }
    }
  };


  // Add exam types
  for (var i = 0; i < 5; i++) {
    if (getCellValue(examTypes, i)) {
      report.exams.midterm.push({
        type: getCellValue(examTypes, i),
        maxScore: getNumberValue(examScores, i),
        studentScore: record.midtermExam ? getNumberValue(record.midtermExam.values, i + 1) : ''
      });
    }
  }


  for (var j = 5; j < 10; j++) {
    if (getCellValue(examTypes, j)) {
      report.exams.final.push({
        type: getCellValue(examTypes, j),
        maxScore: getNumberValue(examScores, j),
        studentScore: record.finalExam ? getNumberValue(record.finalExam.values, j - 4) : ''
      });
    }
  }


  return report;
}


function generateStudentPDFContent(link, studentId) {
  var report = downloadStudentReport(link, studentId);


  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  html += '<style>';
  html += '@page { size: A4; margin: 15mm; }';
  html += 'body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; }';
  html += '.header { text-align: center; border-bottom: 2px solid #264653; padding-bottom: 15px; margin-bottom: 20px; }';
  html += '.header h1 { margin: 0; color: #264653; font-size: 18pt; }';
  html += '.student-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }';
  html += '.student-info h2 { margin: 0 0 10px 0; color: #264653; font-size: 14pt; }';
  html += '.info-row { display: flex; justify-content: space-between; margin: 5px 0; }';
  html += '.info-label { font-weight: bold; color: #555; }';
  html += '.section { margin-bottom: 20px; }';
  html += '.section h3 { color: #264653; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }';
  html += 'table { width: 100%; border-collapse: collapse; margin: 10px 0; }';
  html += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10pt; }';
  html += 'th { background: #264653; color: white; }';
  html += 'tr:nth-child(even) { background: #f9f9f9; }';
  html += '.total-row { background: #e9c46a !important; font-weight: bold; }';
  html += '.result-pass { color: #2a9d8f; font-weight: bold; }';
  html += '.result-fail { color: #e63946; font-weight: bold; }';
  html += '.signature { margin-top: 40px; padding-top: 20px; border-top: 1px dashed #ccc; }';
  html += '.signature-line { width: 250px; border-bottom: 1px solid #333; display: inline-block; margin-left: 10px; }';
  html += '</style></head><body>';


  // Header
  html += '<div class="header"><h1>STUDENT GRADE REPORT</h1></div>';


  // Student Info
  html += '<div class="student-info">';
  html += '<h2>Student Information</h2>';
  html += '<div class="info-row"><span class="info-label">Student ID:</span><span>' + report.studentInfo.studentId + '</span></div>';
  html += '<div class="info-row"><span class="info-label">English Name:</span><span>' + report.studentInfo.englishName + '</span></div>';
  html += '<div class="info-row"><span class="info-label">Thai Name:</span><span>' + report.studentInfo.thaiName + '</span></div>';
  html += '<div class="info-row"><span class="info-label">Section:</span><span>' + report.studentInfo.section + '</span></div>';
  html += '<div class="info-row"><span class="info-label">Class Number:</span><span>' + report.studentInfo.classNumber + '</span></div>';
  html += '</div>';


  // Midterm Collective
  html += '<div class="section"><h3>MIDTERM COLLECTIVE SCORE (Weight: ' + report.weights.midtermCollective + '%)</h3>';
  html += '<table><tr><th>Activity</th><th>Score</th><th>Max</th></tr>';
  html += '<tr class="total-row"><td><strong>TOTAL</strong></td><td>' + (report.scores.midterm.total || '-') + '</td><td>-</td></tr>';
  html += '<tr><td>Equivalent</td><td colspan="2">' + (report.scores.midterm.equivalent || '-') + '</td></tr>';
  html += '</table></div>';


  // Midterm Exam
  if (report.exams.midterm.length > 0) {
    html += '<div class="section"><h3>MIDTERM EXAMINATION (Weight: ' + report.weights.midtermExam + '%)</h3>';
    html += '<table><tr><th>Exam Type</th><th>Score</th><th>Max Points</th></tr>';
    report.exams.midterm.forEach(function(exam) {
      html += '<tr><td>' + exam.type + '</td><td>' + (exam.studentScore || '-') + '</td><td>' + (exam.maxScore || '-') + '</td></tr>';
    });
    html += '<tr class="total-row"><td><strong>TOTAL</strong></td><td>' + (report.scores.midtermExam.total || '-') + '</td><td>-</td></tr>';
    html += '</table></div>';
  }


  // Final Initial
  html += '<div class="section"><h3>FINAL COLLECTIVE SCORE - INITIAL (Weight: ' + report.weights.finalInitial + '%)</h3>';
  html += '<table><tr><th>Activity</th><th>Score</th><th>Max</th></tr>';
  html += '<tr class="total-row"><td><strong>TOTAL</strong></td><td>' + (report.scores.finalInitial.total || '-') + '</td><td>-</td></tr>';
  html += '</table></div>';


  // Final Final
  html += '<div class="section"><h3>FINAL COLLECTIVE SCORE - FINAL (Weight: ' + report.weights.finalFinal + '%)</h3>';
  html += '<table><tr><th>Activity</th><th>Score</th><th>Max</th></tr>';
  html += '<tr class="total-row"><td><strong>TOTAL</strong></td><td>' + (report.scores.finalFinal.total || '-') + '</td><td>-</td></tr>';
  html += '</table></div>';


  // Final Exam
  if (report.exams.final.length > 0) {
    html += '<div class="section"><h3>FINAL EXAMINATION (Weight: ' + report.weights.finalExam + '%)</h3>';
    html += '<table><tr><th>Exam Type</th><th>Score</th><th>Max Points</th></tr>';
    report.exams.final.forEach(function(exam) {
      html += '<tr><td>' + exam.type + '</td><td>' + (exam.studentScore || '-') + '</td><td>' + (exam.maxScore || '-') + '</td></tr>';
    });
    html += '<tr class="total-row"><td><strong>TOTAL</strong></td><td>' + (report.scores.finalExam.total || '-') + '</td><td>-</td></tr>';
    html += '</table></div>';
  }


  // Overall Result
  html += '<div class="section" style="background: #f0f0f0; padding: 20px; border-radius: 8px;">';
  html += '<h3 style="margin-top: 0;">OVERALL RESULT</h3>';
  html += '<div class="info-row"><span class="info-label">Total Score:</span><span>' + (report.scores.overall.total || '-') + '</span></div>';
  var resultClass = (report.scores.overall.result || '').toLowerCase().indexOf('pass') >= 0 ? 'result-pass' : 'result-fail';
  html += '<div class="info-row"><span class="info-label">Status:</span><span class="' + resultClass + '">' + (report.scores.overall.result || '-') + '</span></div>';
  html += '</div>';


  // Signature
  html += '<div class="signature">';
  html += '<p><strong>Student\'s Name:</strong> <span class="signature-line"></span></p>';
  html += '<p><strong>Date Signed:</strong> <span class="signature-line"></span></p>';
  html += '</div>';


  html += '</body></html>';


  return html;
}


function generateSectionPDFContent(link, sectionNumber) {
  var grades = getSectionGrades(link, sectionNumber);


  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  html += '<style>';
  html += '@page { size: A4 landscape; margin: 10mm; }';
  html += 'body { font-family: Arial, sans-serif; font-size: 9pt; color: #333; }';
  html += '.header { text-align: center; border-bottom: 2px solid #264653; padding-bottom: 10px; margin-bottom: 15px; }';
  html += '.header h1 { margin: 0; color: #264653; font-size: 16pt; }';
  html += 'table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8pt; }';
  html += 'th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }';
  html += 'th { background: #264653; color: white; font-weight: bold; }';
  html += 'tr:nth-child(even) { background: #f5f5f5; }';
  html += '.pass { color: #2a9d8f; font-weight: bold; }';
  html += '.fail { color: #e63946; font-weight: bold; }';
  html += '</style></head><body>';


  html += '<div class="header"><h1>SECTION ' + sectionNumber + ' - GRADING SHEET</h1></div>';


  html += '<table>';
  html += '<tr><th>#</th><th>Student ID</th><th>Thai Name</th><th>English Name</th><th>Section</th><th>Class</th>';
  html += '<th>Mid Total</th><th>Mid Eq</th><th>Mid Result</th>';
  html += '<th>Final Init Total</th><th>Final Init Eq</th>';
  html += '<th>Final Final Total</th><th>Final Final Eq</th>';
  html += '<th>Exam Total</th><th>Exam Eq</th>';
  html += '<th>Overall</th><th>Result</th></tr>';


  grades.students.forEach(function(s, idx) {
    var resultClass = (s.result || '').toLowerCase().indexOf('pass') >= 0 ? 'pass' : 'fail';
    html += '<tr>';
    html += '<td>' + (idx + 1) + '</td>';
    html += '<td>' + s.studentId + '</td>';
    html += '<td>' + s.thaiName + '</td>';
    html += '<td>' + s.englishName + '</td>';
    html += '<td>' + s.section + '</td>';
    html += '<td>' + s.classNumber + '</td>';
    html += '<td>' + (s.midtermTotal || '-') + '</td>';
    html += '<td>' + (s.midtermEquivalent || '-') + '</td>';
    html += '<td>' + (s.midtermResult || '-') + '</td>';
    html += '<td>' + (s.finalInitialTotal || '-') + '</td>';
    html += '<td>' + (s.finalInitialEquivalent || '-') + '</td>';
    html += '<td>' + (s.finalFinalTotal || '-') + '</td>';
    html += '<td>' + (s.finalFinalEquivalent || '-') + '</td>';
    html += '<td>' + (s.finalExamTotal || '-') + '</td>';
    html += '<td>' + (s.finalExamEquivalent || '-') + '</td>';
    html += '<td>' + (s.overallTotal || '-') + '</td>';
    html += '<td class="' + resultClass + '">' + (s.result || '-') + '</td>';
    html += '</tr>';
  });


  html += '</table></body></html>';


  return html;
}


function generateAllGradesPDFContent(link) {
  var grades = getAllGrades(link);


  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  html += '<style>';
  html += '@page { size: A4 landscape; margin: 10mm; }';
  html += 'body { font-family: Arial, sans-serif; font-size: 8pt; color: #333; }';
  html += '.header { text-align: center; border-bottom: 2px solid #264653; padding-bottom: 10px; margin-bottom: 15px; }';
  html += '.header h1 { margin: 0; color: #264653; font-size: 14pt; }';
  html += 'table { width: 100%; border-collapse: collapse; font-size: 7pt; }';
  html += 'th, td { border: 1px solid #333; padding: 3px 4px; text-align: center; }';
  html += 'th { background: #264653; color: white; }';
  html += 'tr:nth-child(even) { background: #f5f5f5; }';
  html += '.pass { color: #2a9d8f; font-weight: bold; }';
  html += '.fail { color: #e63946; font-weight: bold; }';
  html += '</style></head><body>';


  html += '<div class="header"><h1>COMPLETE GRADE REPORT - ALL SECTIONS</h1></div>';


  html += '<table>';
  html += '<tr><th>#</th><th>ID</th><th>Thai Name</th><th>English Name</th><th>Sec</th><th>Class</th>';
  html += '<th>Mid Tot</th><th>Mid Eq</th>';
  html += '<th>Fin Init</th><th>Fin Init Eq</th>';
  html += '<th>Fin Fin</th><th>Fin Fin Eq</th>';
  html += '<th>Exam</th><th>Exam Eq</th>';
  html += '<th>Total</th><th>Result</th></tr>';


  grades.students.forEach(function(s, idx) {
    var resultClass = (s.result || '').toLowerCase().indexOf('pass') >= 0 ? 'pass' : 'fail';
    html += '<tr>';
    html += '<td>' + (idx + 1) + '</td>';
    html += '<td>' + s.studentId + '</td>';
    html += '<td>' + s.thaiName + '</td>';
    html += '<td>' + s.englishName + '</td>';
    html += '<td>' + s.section + '</td>';
    html += '<td>' + s.classNumber + '</td>';
    html += '<td>' + (s.midtermTotal || '-') + '</td>';
    html += '<td>' + (s.midtermEquivalent || '-') + '</td>';
    html += '<td>' + (s.finalInitialTotal || '-') + '</td>';
    html += '<td>' + (s.finalInitialEquivalent || '-') + '</td>';
    html += '<td>' + (s.finalFinalTotal || '-') + '</td>';
    html += '<td>' + (s.finalFinalEquivalent || '-') + '</td>';
    html += '<td>' + (s.finalExamTotal || '-') + '</td>';
    html += '<td>' + (s.finalExamEquivalent || '-') + '</td>';
    html += '<td>' + (s.overallTotal || '-') + '</td>';
    html += '<td class="' + resultClass + '">' + (s.result || '-') + '</td>';
    html += '</tr>';
  });


  html += '</table></body></html>';


  return html;
}


function generatePassFailPDFContent(link) {
  var students = getPassFailList(link);


  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  html += '<style>';
  html += '@page { size: A4; margin: 15mm; }';
  html += 'body { font-family: Arial, sans-serif; font-size: 10pt; color: #333; }';
  html += '.header { text-align: center; border-bottom: 2px solid #264653; padding-bottom: 15px; margin-bottom: 20px; }';
  html += '.header h1 { margin: 0; color: #264653; font-size: 18pt; }';
  html += 'table { width: 100%; border-collapse: collapse; margin: 15px 0; }';
  html += 'th, td { border: 1px solid #333; padding: 8px; text-align: left; }';
  html += 'th { background: #264653; color: white; }';
  html += '.pass { background: #d4edda; color: #155724; font-weight: bold; }';
  html += '.fail { background: #f8d7da; color: #721c24; font-weight: bold; }';
  html += '.summary { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }';
  html += '</style></head><body>';


  html += '<div class="header"><h1>PASS / FAIL LIST</h1></div>';


  var passCount = 0;
  var failCount = 0;


  html += '<table>';
  html += '<tr><th>#</th><th>Student ID</th><th>English Name</th><th>Thai Name</th><th>Section</th><th>Class</th><th>Overall</th><th>Result</th></tr>';


  students.forEach(function(s, idx) {
    var isPass = (s.finalResult || '').toLowerCase().indexOf('pass') >= 0;
    if (isPass) passCount++; else failCount++;


html += '<tr>';
html += '<td>' + (idx + 1) + '</td>';
html += '<td>' + s.studentId + '</td>';
html += '<td>' + s.englishName + '</td>';
html += '<td>' + s.thaiName + '</td>';
html += '<td>' + s.section + '</td>';
html += '<td>' + s.classNumber + '</td>';
html += '<td>' + (s.overallTotal || '-') + '</td>';
html += '<td class="' + (isPass ? 'pass' : 'fail') + '">' + (s.finalResult || '-') + '</td>';
html += '</tr>';

  });


  html += '</table>';


  html += '<div class="summary">';
  html += '<strong>Summary:</strong> Passed: ' + passCount + ' | Failed: ' + failCount + ' | Total: ' + students.length;
  html += '</div>';


  html += '</body></html>';


  return html;
}


// ==================== LEGACY COMPATIBILITY ====================


function downloadAllGradesCsv(link) {
  return downloadAllGradesExcel(link);
}


function downloadSectionCsv(link, sectionNumber) {
  return downloadSectionExcel(link, sectionNumber);
}


function loadSectionRows(link, sectionNumber) {
  return getSectionStudents(link, sectionNumber);
}


function loadPassFailRows(link, studentId) {
  var db = loadDatabase(link).sheets.tblDatabase;
  var rows = [];
  for (var i = 3; i < db.length; i++) {
    var row = db[i];
    if (!row[0]) continue;
    if (studentId && normalizeId(row[0]) !== normalizeId(studentId)) continue;
    rows.push(row);
  }
  return rows;
}
