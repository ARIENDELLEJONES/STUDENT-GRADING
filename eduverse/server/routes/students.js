import { Router } from 'express';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';

const router = Router();

// ─── Get all students (unified across both modes) ───────────────
router.get('/', (req, res) => {
  const { mode, databaseId, gradeLevel, section } = req.query;

  if (mode === 'grades' || mode === 'A') {
    let query = 'SELECT * FROM grade_students WHERE 1=1';
    const params = [];
    if (databaseId) { query += ' AND database_id = ?'; params.push(databaseId); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_number';
    const students = db.prepare(query).all(...params);
    res.json({ success: true, data: students });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    let query = 'SELECT * FROM quiz_students WHERE 1=1';
    const params = [];
    if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_no';
    const students = db.prepare(query).all(...params);
    res.json({ success: true, data: students });
    return;
  }

  const gradeStudents = db.prepare('SELECT * FROM grade_students ORDER BY section, class_number').all();
  const quizStudents = db.prepare('SELECT * FROM quiz_students ORDER BY grade_level, section, class_no').all();
  res.json({ success: true, data: { gradeStudents, quizStudents } });
});

// ─── Add student ────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { mode, databaseId, studentId, thaiName, englishName, section, classNumber, gradeLevel, password } = req.body;

  if (mode === 'grades' || mode === 'A') {
    try {
      db.prepare(`
        INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(databaseId, studentId, thaiName || '', englishName || '', section || '', classNumber || '', password || 'default');
      invalidateCache('/api/students');
      invalidateCache('/api/grades');
      res.json({ success: true, message: 'Student added' });
    } catch (e) {
      res.json({ success: false, message: e.message.includes('UNIQUE') ? 'Student ID already exists' : e.message });
    }
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    try {
      db.prepare(`
        INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(studentId, thaiName || '', englishName || '', section || '', classNumber || '', gradeLevel, password || 'default');
      invalidateCache('/api/students');
      invalidateCache('/api/quiz');
      res.json({ success: true, message: 'Student added' });
    } catch (e) {
      res.json({ success: false, message: e.message.includes('UNIQUE') ? 'Student ID already exists for this grade level' : e.message });
    }
    return;
  }

  res.json({ success: false, message: 'Mode is required (grades or quiz)' });
});

// ─── Update student ─────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { mode, thaiName, englishName, section, classNumber, password } = req.body;

  if (mode === 'grades' || mode === 'A') {
    db.prepare(`
      UPDATE grade_students SET thai_name=?, english_name=?, section=?, class_number=?, password=COALESCE(?, password)
      WHERE id=?
    `).run(thaiName, englishName, section, classNumber, password || null, req.params.id);
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true, message: 'Student updated' });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    db.prepare(`
      UPDATE quiz_students SET thai_name=?, english_name=?, section=?, class_no=?, password=COALESCE(?, password)
      WHERE id=?
    `).run(thaiName, englishName, section, classNumber, password || null, req.params.id);
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true, message: 'Student updated' });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

// ─── Delete student ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const { mode } = req.query;

  if (mode === 'grades' || mode === 'A') {
    db.prepare('DELETE FROM grade_students WHERE id = ?').run(req.params.id);
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    db.prepare('DELETE FROM quiz_students WHERE id = ?').run(req.params.id);
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

// ─── Reset student password (admin action) ──────────────────────
router.post('/:studentId/reset-password', (req, res) => {
  const { mode } = req.body;
  const studentId = req.params.studentId;

  if (mode === 'grades' || mode === 'A') {
    db.prepare('UPDATE grade_students SET password = ?, password_reset_request = ? WHERE student_id = ?')
      .run('default', '', studentId);
    res.json({ success: true, message: 'Password reset to default' });
    return;
  }

  if (mode === 'quiz' || mode === 'B') {
    db.prepare('UPDATE quiz_students SET password = ? WHERE student_id = ?')
      .run('default', studentId);
    res.json({ success: true, message: 'Password reset to default' });
    return;
  }

  res.json({ success: false, message: 'Mode is required' });
});

// ─── Password reset requests (for admin to view) ────────────────
router.get('/password-requests', (req, res) => {
  const requests = db.prepare(
    "SELECT * FROM grade_students WHERE password_reset_request != '' AND password_reset_request IS NOT NULL ORDER BY password_reset_date DESC"
  ).all();
  res.json({
    success: true,
    data: requests.map(r => ({
      studentId: r.student_id,
      thaiName: r.thai_name,
      englishName: r.english_name,
      section: r.section,
      request: r.password_reset_request,
      date: r.password_reset_date
    }))
  });
});

// ─── Sync students between Mode A and Mode B ────────────────────
router.post('/sync', (req, res) => {
  const { direction, databaseId, gradeLevel } = req.body;

  if (direction === 'grades-to-quiz') {
    const gradeStudents = db.prepare('SELECT * FROM grade_students WHERE database_id = ?').all(databaseId);
    const upsert = db.prepare(`
      INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, grade_level) DO UPDATE SET
        thai_name=excluded.thai_name, english_name=excluded.english_name,
        section=excluded.section, class_no=excluded.class_no
    `);
    const txn = db.transaction(() => {
      for (const s of gradeStudents) {
        upsert.run(s.student_id, s.thai_name, s.english_name, s.section, s.class_number, gradeLevel, s.password);
      }
    });
    txn();
    invalidateCache('/api/students');
    invalidateCache('/api/quiz');
    res.json({ success: true, message: `${gradeStudents.length} students synced from grades to quiz` });
    return;
  }

  if (direction === 'quiz-to-grades') {
    const quizStudents = db.prepare('SELECT * FROM quiz_students WHERE grade_level = ?').all(gradeLevel);
    const upsert = db.prepare(`
      INSERT INTO grade_students (database_id, student_id, thai_name, english_name, section, class_number, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, student_id) DO UPDATE SET
        thai_name=excluded.thai_name, english_name=excluded.english_name,
        section=excluded.section, class_number=excluded.class_no
    `);
    const txn = db.transaction(() => {
      for (const s of quizStudents) {
        upsert.run(databaseId, s.student_id, s.thai_name, s.english_name, s.section, s.class_no, s.password);
      }
    });
    txn();
    invalidateCache('/api/students');
    invalidateCache('/api/grades');
    res.json({ success: true, message: `${quizStudents.length} students synced from quiz to grades` });
    return;
  }

  res.json({ success: false, message: 'Invalid sync direction' });
});

// ─── Copy/paste format export ───────────────────────────────────
router.get('/export-text', (req, res) => {
  const { mode, databaseId, gradeLevel, section } = req.query;
  let students = [];

  if (mode === 'grades') {
    let query = 'SELECT * FROM grade_students WHERE database_id = ?';
    const params = [databaseId];
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_number';
    students = db.prepare(query).all(...params);
  } else {
    let query = 'SELECT * FROM quiz_students WHERE grade_level = ?';
    const params = [gradeLevel];
    if (section) { query += ' AND section = ?'; params.push(section); }
    query += ' ORDER BY section, class_no';
    students = db.prepare(query).all(...params);
  }

  const text = students.map(s => [
    s.student_id, s.thai_name, s.english_name,
    s.section, s.class_number || s.class_no,
    gradeLevel || '', ''
  ].join('\t')).join('\n');

  res.json({ success: true, data: text, count: students.length });
});

export default router;
