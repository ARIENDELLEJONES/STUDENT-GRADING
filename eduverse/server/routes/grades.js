import { Router } from 'express';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';

const router = Router();

// ─── Preserves loginStudent from Student/Code.gs ────────────────
router.post('/login-student', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.json({ success: false, message: 'Student ID and password are required' });
    return;
  }
  const student = db.prepare(`
    SELECT gs.*, gd.name as db_name FROM grade_students gs
    JOIN grade_databases gd ON gs.database_id = gd.id
    WHERE gs.student_id = ?
  `).get(String(username).trim());

  if (!student || String(student.password).trim() !== String(password).trim()) {
    res.json({ success: false, message: 'Invalid Student ID or Password' });
    return;
  }

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(student.database_id);
  const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
    .all(student.database_id, student.student_id);
  const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
    .all(student.database_id, student.student_id);
  const examTypesData = db.prepare('SELECT * FROM exam_types WHERE database_id = ?')
    .all(student.database_id);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ?')
    .all(student.database_id);

  res.json({
    success: true,
    student: {
      id: student.student_id,
      thai: student.thai_name,
      english: student.english_name,
      section: student.section,
      class: student.class_number
    },
    weights: weights || {},
    scores,
    examScores: examScoresData,
    examTypes: examTypesData,
    activities
  });
});

// ─── Preserves requestPasswordReset from Student/Code.gs ────────
router.post('/password-reset', (req, res) => {
  const { studentID } = req.body;
  const student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(String(studentID).trim());
  if (!student) {
    res.json({ success: false, message: 'Student ID not found.' });
    return;
  }
  db.prepare('UPDATE grade_students SET password_reset_request = ?, password_reset_date = ? WHERE student_id = ?')
    .run('PASSWORD CHANGE REQUEST', new Date().toISOString(), student.student_id);
  res.json({ success: true, message: 'Password request submitted successfully.' });
});

// ─── Database Management (preserves loadDatabase logic) ─────────
router.get('/databases', (req, res) => {
  const databases = db.prepare('SELECT * FROM grade_databases ORDER BY id').all();
  res.json({ success: true, databases });
});

router.post('/databases', (req, res) => {
  const { name, spreadsheetLink } = req.body;
  const count = db.prepare('SELECT COUNT(*) as cnt FROM grade_databases').get().cnt;
  if (count >= 5) {
    res.json({ success: false, message: 'Maximum 5 databases allowed' });
    return;
  }
  const result = db.prepare('INSERT INTO grade_databases (name, spreadsheet_link) VALUES (?, ?)')
    .run(name, spreadsheetLink || '');
  invalidateCache('/api/grades');
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/databases/:id', (req, res) => {
  db.prepare('DELETE FROM grade_databases WHERE id = ?').run(req.params.id);
  invalidateCache('/api/grades');
  res.json({ success: true });
});

router.get('/database/:id', (req, res) => {
  const database = db.prepare('SELECT * FROM grade_databases WHERE id = ?').get(req.params.id);
  if (!database) {
    res.json({ success: false, message: 'Database not found' });
    return;
  }
  const students = db.prepare('SELECT * FROM grade_students WHERE database_id = ? ORDER BY section, class_number').all(req.params.id);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(req.params.id);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ? ORDER BY period, type, slot').all(req.params.id);
  const examTypes = db.prepare('SELECT * FROM exam_types WHERE database_id = ? ORDER BY side, slot').all(req.params.id);

  res.json({ success: true, database, students, weights: weights || {}, activities, examTypes });
});

// ─── Student search (preserves searchStudentRecords) ────────────
router.get('/student/:studentId/search', (req, res) => {
  const { databaseId } = req.query;
  const studentId = req.params.studentId;

  let student;
  if (databaseId) {
    student = db.prepare('SELECT * FROM grade_students WHERE student_id = ? AND database_id = ?').get(studentId, databaseId);
  } else {
    student = db.prepare('SELECT * FROM grade_students WHERE student_id = ?').get(studentId);
  }

  if (!student) {
    res.json({ success: false, message: 'Student not found' });
    return;
  }

  const dbId = student.database_id;
  const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?').all(dbId, studentId);
  const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?').all(dbId, studentId);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(dbId);
  const examTypes = db.prepare('SELECT * FROM exam_types WHERE database_id = ?').all(dbId);
  const activities = db.prepare('SELECT * FROM activity_config WHERE database_id = ?').all(dbId);

  res.json({
    success: true,
    student: {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      databaseId: dbId
    },
    scores,
    examScores: examScoresData,
    weights: weights || {},
    examTypes,
    activities
  });
});

// ─── Save scores (preserves saveStudentScoreBlock) ──────────────
router.post('/student/scores', (req, res) => {
  const { databaseId, studentId, period, scoreType, scores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO student_scores (database_id, student_id, period, score_type, slot, score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, period, score_type, slot)
    DO UPDATE SET score = excluded.score
  `);

  const transaction = db.transaction(() => {
    for (const s of scores) {
      upsert.run(databaseId, studentId, period, scoreType, s.slot, s.score);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Scores saved' });
});

// ─── Save exam scores ───────────────────────────────────────────
router.post('/student/exam-scores', (req, res) => {
  const { databaseId, studentId, side, scores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO exam_scores (database_id, student_id, side, slot, score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id, side, slot)
    DO UPDATE SET score = excluded.score
  `);

  const transaction = db.transaction(() => {
    for (const s of scores) {
      upsert.run(databaseId, studentId, side, s.slot, s.score);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Exam scores saved' });
});

// ─── Sections (preserves getSections) ───────────────────────────
router.get('/sections', (req, res) => {
  const { databaseId } = req.query;
  const sections = db.prepare(
    'SELECT DISTINCT section FROM grade_students WHERE database_id = ? AND section != "" ORDER BY section'
  ).all(databaseId);
  res.json({ success: true, sections: sections.map(s => s.section) });
});

// ─── Section students (preserves getSectionStudents) ────────────
router.get('/section/:num/students', (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(
    'SELECT * FROM grade_students WHERE database_id = ? AND section = ? ORDER BY class_number'
  ).all(databaseId, req.params.num);
  res.json({ success: true, students });
});

// ─── Section grades (preserves getSectionGrades) ────────────────
router.get('/section/:num/grades', (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(
    'SELECT * FROM grade_students WHERE database_id = ? AND section = ? ORDER BY class_number'
  ).all(databaseId, req.params.num);

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => {
      const items = scores.filter(s => s.period === period && s.score_type === type);
      return items.reduce((sum, s) => sum + (s.score || 0), 0);
    };

    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = (
      midtermTotal * ((w.midterm_collective || 0) / 100) +
      finalInitialTotal * ((w.final_initial || 0) / 100) +
      finalFinalTotal * ((w.final_final || 0) / 100) +
      midtermExamTotal * ((w.midterm_exam || 0) / 100) +
      finalExamTotal * ((w.final_exam || 0) / 100)
    );

    const passScore = w.pass_overall || 50;
    const result = overallTotal >= passScore ? 'PASSED' : 'FAILED';

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      midtermTotal,
      midtermEquivalent: midtermTotal > 0 ? midtermTotal.toFixed(2) : '-',
      finalInitialTotal,
      finalInitialEquivalent: finalInitialTotal > 0 ? finalInitialTotal.toFixed(2) : '-',
      finalFinalTotal,
      finalFinalEquivalent: finalFinalTotal > 0 ? finalFinalTotal.toFixed(2) : '-',
      finalExamTotal,
      finalExamEquivalent: finalExamTotal > 0 ? finalExamTotal.toFixed(2) : '-',
      overallTotal: overallTotal.toFixed(2),
      result
    };
  });

  res.json({ success: true, students: result });
});

// ─── All grades (preserves getAllGrades) ─────────────────────────
router.get('/all', (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare(
    'SELECT * FROM grade_students WHERE database_id = ? ORDER BY section, class_number'
  ).all(databaseId);

  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => {
      return scores.filter(s => s.period === period && s.score_type === type).reduce((sum, s) => sum + (s.score || 0), 0);
    };

    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = (
      midtermTotal * ((w.midterm_collective || 0) / 100) +
      finalInitialTotal * ((w.final_initial || 0) / 100) +
      finalFinalTotal * ((w.final_final || 0) / 100) +
      midtermExamTotal * ((w.midterm_exam || 0) / 100) +
      finalExamTotal * ((w.final_exam || 0) / 100)
    );
    const passScore = w.pass_overall || 50;

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      midtermTotal: midtermTotal.toFixed(2),
      midtermEquivalent: midtermTotal > 0 ? midtermTotal.toFixed(2) : '-',
      finalInitialTotal: finalInitialTotal.toFixed(2),
      finalInitialEquivalent: finalInitialTotal > 0 ? finalInitialTotal.toFixed(2) : '-',
      finalFinalTotal: finalFinalTotal.toFixed(2),
      finalFinalEquivalent: finalFinalTotal > 0 ? finalFinalTotal.toFixed(2) : '-',
      finalExamTotal: finalExamTotal.toFixed(2),
      finalExamEquivalent: finalExamTotal > 0 ? finalExamTotal.toFixed(2) : '-',
      overallTotal: overallTotal.toFixed(2),
      result: overallTotal >= passScore ? 'PASSED' : 'FAILED'
    };
  });

  res.json({ success: true, students: result });
});

// ─── Grading weights (preserves saveGradingWeights / getSubjectConfig) ──
router.get('/weights/:databaseId', (req, res) => {
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(req.params.databaseId);
  res.json({ success: true, weights: weights || {} });
});

router.post('/weights', (req, res) => {
  const { databaseId, midtermCollective, finalInitial, finalFinal, midtermExam, finalExam,
    passMidterm, passInitial, passFinal, passOverall, freezeFinal } = req.body;

  db.prepare(`
    INSERT INTO grading_weights (database_id, midterm_collective, final_initial, final_final, midterm_exam, final_exam,
      pass_midterm, pass_initial, pass_final, pass_overall, freeze_final)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id) DO UPDATE SET
      midterm_collective=excluded.midterm_collective, final_initial=excluded.final_initial,
      final_final=excluded.final_final, midterm_exam=excluded.midterm_exam, final_exam=excluded.final_exam,
      pass_midterm=excluded.pass_midterm, pass_initial=excluded.pass_initial,
      pass_final=excluded.pass_final, pass_overall=excluded.pass_overall, freeze_final=excluded.freeze_final
  `).run(databaseId, midtermCollective || 0, finalInitial || 0, finalFinal || 0,
    midtermExam || 0, finalExam || 0, passMidterm || 0, passInitial || 0,
    passFinal || 0, passOverall || 0, freezeFinal ? 1 : 0);

  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Grading weights saved' });
});

// ─── Exam types (preserves saveExamTypes) ───────────────────────
router.post('/exam-types', (req, res) => {
  const { databaseId, side, types } = req.body;

  const upsert = db.prepare(`
    INSERT INTO exam_types (database_id, side, slot, type_name, max_score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(database_id, side, slot) DO UPDATE SET
      type_name=excluded.type_name, max_score=excluded.max_score
  `);

  const transaction = db.transaction(() => {
    for (let i = 0; i < types.length; i++) {
      upsert.run(databaseId, side, i, types[i].name || '', types[i].maxScore || 0);
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Exam types saved' });
});

// ─── Activity names/scores (preserves saveActivityNamesScores) ──
router.post('/activity-config', (req, res) => {
  const { databaseId, period, individualNames, individualScores, groupNames, groupScores } = req.body;

  const upsert = db.prepare(`
    INSERT INTO activity_config (database_id, period, type, slot, name, max_score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, period, type, slot) DO UPDATE SET
      name=excluded.name, max_score=excluded.max_score
  `);

  const transaction = db.transaction(() => {
    if (individualNames) {
      for (let i = 0; i < individualNames.length; i++) {
        upsert.run(databaseId, period, 'individual', i, individualNames[i] || '', (individualScores && individualScores[i]) || 0);
      }
    }
    if (groupNames) {
      for (let i = 0; i < groupNames.length; i++) {
        upsert.run(databaseId, period, 'group', i, groupNames[i] || '', (groupScores && groupScores[i]) || 0);
      }
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: 'Activity configuration saved' });
});

// ─── Groups (preserves generateAutoGroups / group management) ───
router.post('/groups/auto', (req, res) => {
  const { databaseId, section, period, activityNumber, groupCount } = req.body;

  const students = db.prepare(
    'SELECT * FROM grade_students WHERE database_id = ? AND section = ? ORDER BY class_number'
  ).all(databaseId, section);

  if (students.length === 0) {
    res.json({ success: false, message: 'No students found in this section' });
    return;
  }

  const shuffled = [...students].sort(() => Math.random() - 0.5);
  const groups = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((s, i) => groups[i % groupCount].push(s));

  db.prepare('DELETE FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ?')
    .run(databaseId, section, period, activityNumber);

  const insert = db.prepare(
    'INSERT INTO student_groups (database_id, section, period, activity_number, group_number, student_id) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    groups.forEach((group, gi) => {
      group.forEach(student => {
        insert.run(databaseId, section, period, activityNumber, gi + 1, student.student_id);
      });
    });
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({
    success: true,
    groups: groups.map((g, i) => ({
      groupNumber: i + 1,
      members: g.map(s => ({ studentId: s.student_id, englishName: s.english_name, thaiName: s.thai_name }))
    }))
  });
});

router.get('/groups', (req, res) => {
  const { databaseId, section, period, activityNumber } = req.query;
  const groups = db.prepare(
    'SELECT * FROM student_groups WHERE database_id = ? AND section = ? AND period = ? AND activity_number = ?'
  ).all(databaseId, section, period, activityNumber);
  res.json({ success: true, groups });
});

// ─── Pass/Fail (preserves getPassFailList) ──────────────────────
router.get('/pass-fail', (req, res) => {
  const { databaseId } = req.query;
  const students = db.prepare('SELECT * FROM grade_students WHERE database_id = ? ORDER BY section, class_number').all(databaseId);
  const weights = db.prepare('SELECT * FROM grading_weights WHERE database_id = ?').get(databaseId);

  const result = students.map(student => {
    const scores = db.prepare('SELECT * FROM student_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);
    const examScoresData = db.prepare('SELECT * FROM exam_scores WHERE database_id = ? AND student_id = ?')
      .all(databaseId, student.student_id);

    const getTotal = (period, type) => scores.filter(s => s.period === period && s.score_type === type).reduce((sum, s) => sum + (s.score || 0), 0);
    const midtermTotal = getTotal('midterm', 'individual') + getTotal('midterm', 'group');
    const finalInitialTotal = getTotal('final_initial', 'individual') + getTotal('final_initial', 'group');
    const finalFinalTotal = getTotal('final_final', 'individual') + getTotal('final_final', 'group');
    const midtermExamTotal = examScoresData.filter(e => e.side === 'midterm').reduce((s, e) => s + (e.score || 0), 0);
    const finalExamTotal = examScoresData.filter(e => e.side === 'final').reduce((s, e) => s + (e.score || 0), 0);

    const w = weights || {};
    const overallTotal = (
      midtermTotal * ((w.midterm_collective || 0) / 100) +
      finalInitialTotal * ((w.final_initial || 0) / 100) +
      finalFinalTotal * ((w.final_final || 0) / 100) +
      midtermExamTotal * ((w.midterm_exam || 0) / 100) +
      finalExamTotal * ((w.final_exam || 0) / 100)
    );

    return {
      studentId: student.student_id,
      thaiName: student.thai_name,
      englishName: student.english_name,
      section: student.section,
      classNumber: student.class_number,
      overallTotal: overallTotal.toFixed(2),
      finalResult: overallTotal >= (w.pass_overall || 50) ? 'PASSED' : 'FAILED'
    };
  });

  res.json({ success: true, students: result });
});

// ─── Import students (batch) ────────────────────────────────────
router.post('/students/import', (req, res) => {
  const { databaseId, students } = req.body;

  const upsert = db.prepare(`
    INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(database_id, student_id) DO UPDATE SET
      thai_name=excluded.thai_name, english_name=excluded.english_name,
      section=excluded.section, class_number=excluded.class_number
  `);

  const transaction = db.transaction(() => {
    for (const s of students) {
      upsert.run(databaseId, s.studentId, s.thaiName || '', s.englishName || '',
        s.section || '', s.classNumber || '', s.password || 'default');
    }
  });

  transaction();
  invalidateCache('/api/grades');
  res.json({ success: true, message: `${students.length} students imported` });
});

export default router;
