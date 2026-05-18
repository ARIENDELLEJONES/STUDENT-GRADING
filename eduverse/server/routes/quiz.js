import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { invalidateCache } from '../middleware/cache.js';

const router = Router();

// ─── Teacher login (preserves quiz-spa teacher auth) ────────────
router.post('/teacher/login', (req, res) => {
  const { username, password } = req.body;
  const teacher = db.prepare('SELECT * FROM quiz_teachers WHERE username = ?').get(username);
  if (!teacher || teacher.password !== password) {
    res.json({ success: false, error: 'Invalid username or password' });
    return;
  }
  res.json({
    success: true,
    data: {
      id: teacher.id,
      username: teacher.username,
      name: teacher.name,
      subjects: teacher.subjects,
      gradeLevels: teacher.grade_levels
    }
  });
});

// ─── Student login for quiz (preserves quiz-spa student auth) ───
router.post('/student/login', (req, res) => {
  const { studentId, password, gradeLevel } = req.body;
  const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ? AND grade_level = ?')
    .get(studentId, gradeLevel);
  if (!student || student.password !== (password || 'default')) {
    res.json({ success: false, error: 'Invalid Student ID or Password' });
    return;
  }
  res.json({
    success: true,
    data: {
      studentId: student.student_id,
      englishName: student.english_name,
      thaiName: student.thai_name,
      gradeLevel: student.grade_level,
      section: student.section,
      classNo: student.class_no
    }
  });
});

// ─── Student databases (preserves quiz-spa DB management) ───────
router.get('/student-databases', (req, res) => {
  const dbs = db.prepare('SELECT * FROM quiz_student_databases ORDER BY date_added DESC').all();
  res.json({ success: true, data: dbs });
});

router.post('/student-databases', (req, res) => {
  const { name, gradeLevel, spreadsheetUrl, teacherId } = req.body;
  const result = db.prepare(
    'INSERT INTO quiz_student_databases (name, grade_level, spreadsheet_url, teacher_id) VALUES (?, ?, ?, ?)'
  ).run(name, gradeLevel, spreadsheetUrl || '', teacherId || '');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

router.delete('/student-databases/:id', (req, res) => {
  db.prepare('DELETE FROM quiz_student_databases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Import students to quiz system ─────────────────────────────
router.post('/students/import', (req, res) => {
  const { students, databaseId, gradeLevel } = req.body;
  const upsert = db.prepare(`
    INSERT INTO quiz_students (student_id, thai_name, english_name, section, class_no, grade_level, password, database_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, grade_level) DO UPDATE SET
      thai_name=excluded.thai_name, english_name=excluded.english_name,
      section=excluded.section, class_no=excluded.class_no, database_id=excluded.database_id
  `);

  const transaction = db.transaction(() => {
    for (const s of students) {
      upsert.run(s.studentId, s.thaiName || '', s.englishName || '', s.section || '',
        s.classNo || '', gradeLevel, s.password || 'default', databaseId || null);
    }
  });

  transaction();
  res.json({ success: true, data: { count: students.length } });
});

// ─── Get students by grade level ────────────────────────────────
router.get('/students', (req, res) => {
  const { gradeLevel, section } = req.query;
  let query = 'SELECT * FROM quiz_students WHERE 1=1';
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (section) { query += ' AND section = ?'; params.push(section); }
  query += ' ORDER BY section, class_no';
  const students = db.prepare(query).all(...params);
  res.json({ success: true, data: students });
});

// ─── Quiz CRUD (preserves quiz-spa quiz management) ─────────────
router.get('/list', (req, res) => {
  const { status, gradeLevel, createdBy, type } = req.query;
  let query = 'SELECT * FROM quizzes WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (createdBy) { query += ' AND created_by = ?'; params.push(createdBy); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';

  let quizzes = db.prepare(query).all(...params);

  if (gradeLevel) {
    const quizIds = db.prepare('SELECT quiz_id FROM quiz_grade_levels WHERE grade_level = ?')
      .all(gradeLevel).map(r => r.quiz_id);
    quizzes = quizzes.filter(q => quizIds.includes(q.id));
  }

  res.json({ success: true, data: quizzes });
});

router.get('/:id', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quiz.id);
  const gradeLevels = db.prepare('SELECT grade_level FROM quiz_grade_levels WHERE quiz_id = ?')
    .all(quiz.id).map(r => r.grade_level);
  res.json({ success: true, data: { ...quiz, questions, gradeLevels } });
});

router.post('/create', (req, res) => {
  const { title, type, subject, gradeLevel, passingScore, attemptsAllowed,
    timeLimit, retakeAllowed, randomizeQuestions, randomizeChoices,
    startDate, deadline, createdBy, questions, gradeLevels } = req.body;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO quizzes (id, title, type, subject, grade_level, passing_score, attempts_allowed,
      time_limit, retake_allowed, randomize_questions, randomize_choices, status,
      created_by, start_date, deadline, question_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, type || 'QUIZ', subject || '', gradeLevel || '',
    passingScore || 50, attemptsAllowed || 1, timeLimit || 0,
    retakeAllowed || 'NO', randomizeQuestions || 'NO', randomizeChoices || 'NO',
    'DRAFT', createdBy || '', startDate || '', deadline || '',
    (questions && questions.length) || 0);

  if (questions && questions.length > 0) {
    const insertQ = db.prepare(`
      INSERT INTO questions (quiz_id, question_text, question_type, choice_a, choice_b, choice_c, choice_d,
        correct_answer, points, question_time_limit, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const txn = db.transaction(() => {
      questions.forEach((q, i) => {
        insertQ.run(id, q.questionText || q.question || '', q.questionType || q.type || 'MCQ',
          q.choiceA || q.choices?.[0] || '', q.choiceB || q.choices?.[1] || '',
          q.choiceC || q.choices?.[2] || '', q.choiceD || q.choices?.[3] || '',
          q.correctAnswer || q.answer || '', q.points || 1, q.questionTimeLimit || 0, i);
      });
    });
    txn();
  }

  if (gradeLevels && gradeLevels.length > 0) {
    const insertGL = db.prepare('INSERT OR IGNORE INTO quiz_grade_levels (quiz_id, grade_level) VALUES (?, ?)');
    gradeLevels.forEach(gl => insertGL.run(id, gl));
  }

  invalidateCache('/api/quiz');
  res.json({ success: true, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, type, subject, gradeLevel, passingScore, attemptsAllowed,
    timeLimit, retakeAllowed, randomizeQuestions, randomizeChoices,
    startDate, deadline, status, questions, gradeLevels } = req.body;

  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }

  db.prepare(`
    UPDATE quizzes SET title=?, type=?, subject=?, grade_level=?, passing_score=?,
      attempts_allowed=?, time_limit=?, retake_allowed=?, randomize_questions=?,
      randomize_choices=?, start_date=?, deadline=?, status=?, question_count=?
    WHERE id=?
  `).run(
    title || existing.title, type || existing.type, subject || existing.subject,
    gradeLevel || existing.grade_level, passingScore ?? existing.passing_score,
    attemptsAllowed ?? existing.attempts_allowed, timeLimit ?? existing.time_limit,
    retakeAllowed || existing.retake_allowed, randomizeQuestions || existing.randomize_questions,
    randomizeChoices || existing.randomize_choices, startDate || existing.start_date,
    deadline || existing.deadline, status || existing.status,
    (questions && questions.length) || existing.question_count, req.params.id
  );

  if (questions) {
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
    const insertQ = db.prepare(`
      INSERT INTO questions (quiz_id, question_text, question_type, choice_a, choice_b, choice_c, choice_d,
        correct_answer, points, question_time_limit, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const txn = db.transaction(() => {
      questions.forEach((q, i) => {
        insertQ.run(req.params.id, q.questionText || q.question || '', q.questionType || q.type || 'MCQ',
          q.choiceA || q.choices?.[0] || '', q.choiceB || q.choices?.[1] || '',
          q.choiceC || q.choices?.[2] || '', q.choiceD || q.choices?.[3] || '',
          q.correctAnswer || q.answer || '', q.points || 1, q.questionTimeLimit || 0, i);
      });
    });
    txn();
  }

  if (gradeLevels) {
    db.prepare('DELETE FROM quiz_grade_levels WHERE quiz_id = ?').run(req.params.id);
    const insertGL = db.prepare('INSERT OR IGNORE INTO quiz_grade_levels (quiz_id, grade_level) VALUES (?, ?)');
    gradeLevels.forEach(gl => insertGL.run(req.params.id, gl));
  }

  invalidateCache('/api/quiz');
  res.json({ success: true, data: { id: req.params.id } });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quiz_grade_levels WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM retake_requests WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM deadline_requests WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true });
});

// ─── Quiz status management (preserves publish/close flow) ──────
router.post('/:id/publish', (req, res) => {
  db.prepare('UPDATE quizzes SET status = ? WHERE id = ?').run('ACTIVE', req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true });
});

router.post('/:id/close', (req, res) => {
  db.prepare('UPDATE quizzes SET status = ? WHERE id = ?').run('CLOSED', req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true });
});

router.post('/:id/reopen', (req, res) => {
  db.prepare('UPDATE quizzes SET status = ? WHERE id = ?').run('ACTIVE', req.params.id);
  invalidateCache('/api/quiz');
  res.json({ success: true });
});

// ─── Available quizzes for students ─────────────────────────────
router.get('/available/:gradeLevel', (req, res) => {
  const { studentId } = req.query;
  const quizIds = db.prepare('SELECT quiz_id FROM quiz_grade_levels WHERE grade_level = ?')
    .all(req.params.gradeLevel).map(r => r.quiz_id);

  if (quizIds.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const placeholders = quizIds.map(() => '?').join(',');
  const quizzes = db.prepare(`SELECT * FROM quizzes WHERE id IN (${placeholders}) AND status = 'ACTIVE' ORDER BY created_at DESC`)
    .all(...quizIds);

  const result = quizzes.map(quiz => {
    let attempts = [];
    if (studentId) {
      attempts = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
        .all(quiz.id, studentId);
    }
    const isExpired = quiz.deadline && new Date(quiz.deadline) < new Date();
    const attemptsUsed = attempts.length;
    const maxAttempts = quiz.attempts_allowed || 1;
    const canTake = !isExpired && attemptsUsed < maxAttempts;
    const bestScore = attempts.length > 0 ? Math.max(...attempts.map(a => a.percentage || 0)) : null;

    return {
      ...quiz,
      attemptsUsed,
      maxAttempts,
      canTake,
      isExpired,
      bestScore,
      lastAttempt: attempts.length > 0 ? attempts[attempts.length - 1] : null
    };
  });

  res.json({ success: true, data: result });
});

// ─── Start quiz attempt (preserves quiz-spa startAttempt) ───────
router.post('/attempt/start', (req, res) => {
  const { quizId, studentId, studentName, gradeLevel, section, classNo } = req.body;

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }
  if (quiz.status !== 'ACTIVE') {
    res.json({ success: false, error: 'Quiz is not active' });
    return;
  }

  const existingAttempts = db.prepare('SELECT COUNT(*) as cnt FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
    .get(quizId, studentId).cnt;
  if (existingAttempts >= (quiz.attempts_allowed || 1)) {
    res.json({ success: false, error: 'Maximum attempts reached' });
    return;
  }

  if (quiz.deadline && new Date(quiz.deadline) < new Date()) {
    res.json({ success: false, error: 'Quiz deadline has passed' });
    return;
  }

  let questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quizId);
  if (quiz.randomize_questions === 'YES') {
    questions = questions.sort(() => Math.random() - 0.5);
  }

  const attemptId = uuidv4();
  db.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, grade_level, section, class_no, total_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attemptId, quizId, studentId, studentName || '', gradeLevel || '', section || '', classNo || '',
    questions.reduce((sum, q) => sum + (q.points || 1), 0));

  const sanitizedQuestions = questions.map((q, i) => {
    const choices = [q.choice_a, q.choice_b, q.choice_c, q.choice_d].filter(c => c);
    const displayChoices = quiz.randomize_choices === 'YES'
      ? choices.sort(() => Math.random() - 0.5) : choices;
    return {
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      choices: displayChoices,
      points: q.points,
      questionTimeLimit: q.question_time_limit,
      order: i
    };
  });

  res.json({
    success: true,
    data: {
      attemptId,
      quizTitle: quiz.title,
      timeLimit: quiz.time_limit,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + (q.points || 1), 0),
      questions: sanitizedQuestions
    }
  });
});

// ─── Submit quiz (preserves quiz-spa submitAttempt) ──────────────
router.post('/attempt/submit', (req, res) => {
  const { attemptId, answers, tabSwitchCount } = req.body;

  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId);
  if (!attempt) {
    res.json({ success: false, error: 'Attempt not found' });
    return;
  }
  if (attempt.submitted) {
    res.json({ success: false, error: 'Already submitted' });
    return;
  }

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(attempt.quiz_id);
  const questionMap = {};
  questions.forEach(q => { questionMap[q.id] = q; });

  let totalScore = 0;
  let totalPoints = 0;

  const insertAnswer = db.prepare(`
    INSERT INTO quiz_answers (attempt_id, question_id, student_answer, is_correct, points_earned)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const ans of (answers || [])) {
      const question = questionMap[ans.questionId];
      if (!question) continue;
      const isCorrect = String(ans.answer || '').trim().toUpperCase() ===
        String(question.correct_answer || '').trim().toUpperCase();
      const pointsEarned = isCorrect ? (question.points || 1) : 0;
      totalScore += pointsEarned;
      totalPoints += (question.points || 1);
      insertAnswer.run(attemptId, ans.questionId, ans.answer || '', isCorrect ? 1 : 0, pointsEarned);
    }

    for (const q of questions) {
      if (!answers || !answers.find(a => a.questionId === q.id)) {
        totalPoints += (q.points || 1);
        insertAnswer.run(attemptId, q.id, '', 0, 0);
      }
    }

    const percentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
    const quiz = db.prepare('SELECT passing_score FROM quizzes WHERE id = ?').get(attempt.quiz_id);
    const result = percentage >= (quiz?.passing_score || 50) ? 'PASSED' : 'FAILED';

    db.prepare(`
      UPDATE quiz_attempts SET end_time=?, score=?, total_points=?, percentage=?,
        result=?, tab_switch_count=?, submitted=1
      WHERE id=?
    `).run(new Date().toISOString(), totalScore, totalPoints, percentage.toFixed(2),
      result, tabSwitchCount || 0, attemptId);
  });

  transaction();
  invalidateCache('/api/quiz');

  const updated = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId);
  const answersResult = db.prepare(`
    SELECT qa.*, q.question_text, q.correct_answer, q.choice_a, q.choice_b, q.choice_c, q.choice_d
    FROM quiz_answers qa
    JOIN questions q ON qa.question_id = q.id
    WHERE qa.attempt_id = ?
  `).all(attemptId);

  res.json({
    success: true,
    data: {
      score: updated.score,
      totalPoints: updated.total_points,
      percentage: updated.percentage,
      result: updated.result,
      tabSwitchCount: updated.tab_switch_count,
      answers: answersResult.map(a => ({
        questionText: a.question_text,
        studentAnswer: a.student_answer,
        correctAnswer: a.correct_answer,
        isCorrect: a.is_correct === 1,
        pointsEarned: a.points_earned
      }))
    }
  });
});

// ─── Auto-save (preserves AnswerSaver pattern) ──────────────────
router.post('/attempt/autosave', (req, res) => {
  const { attemptId, answers, tabSwitchCount } = req.body;
  if (!attemptId) {
    res.json({ success: false, error: 'No attempt ID' });
    return;
  }
  db.prepare('UPDATE quiz_attempts SET tab_switch_count = ? WHERE id = ? AND submitted = 0')
    .run(tabSwitchCount || 0, attemptId);
  res.json({ success: true });
});

// ─── Quiz results for teacher ───────────────────────────────────
router.get('/:id/results', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    res.json({ success: false, error: 'Quiz not found' });
    return;
  }

  const attempts = db.prepare(`
    SELECT * FROM quiz_attempts WHERE quiz_id = ? AND submitted = 1 ORDER BY percentage DESC
  `).all(req.params.id);

  const statistics = {
    totalAttempts: attempts.length,
    averageScore: attempts.length > 0 ? (attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length).toFixed(2) : 0,
    highestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.percentage || 0)).toFixed(2) : 0,
    lowestScore: attempts.length > 0 ? Math.min(...attempts.map(a => a.percentage || 0)).toFixed(2) : 0,
    passCount: attempts.filter(a => a.result === 'PASSED').length,
    failCount: attempts.filter(a => a.result === 'FAILED').length
  };

  res.json({ success: true, data: { quiz, attempts, statistics } });
});

// ─── Student quiz history ───────────────────────────────────────
router.get('/student/:studentId/history', (req, res) => {
  const { gradeLevel } = req.query;
  let query = 'SELECT qa.*, q.title as quiz_title, q.type as quiz_type, q.subject FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id WHERE qa.student_id = ? AND qa.submitted = 1';
  const params = [req.params.studentId];
  if (gradeLevel) { query += ' AND qa.grade_level = ?'; params.push(gradeLevel); }
  query += ' ORDER BY qa.end_time DESC';

  const history = db.prepare(query).all(...params);
  res.json({ success: true, data: history });
});

// ─── Attempt details ────────────────────────────────────────────
router.get('/attempt/:attemptId', (req, res) => {
  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(req.params.attemptId);
  if (!attempt) {
    res.json({ success: false, error: 'Attempt not found' });
    return;
  }
  const answers = db.prepare(`
    SELECT qa.*, q.question_text, q.correct_answer, q.choice_a, q.choice_b, q.choice_c, q.choice_d
    FROM quiz_answers qa JOIN questions q ON qa.question_id = q.id
    WHERE qa.attempt_id = ? ORDER BY q.order_num
  `).all(req.params.attemptId);

  res.json({ success: true, data: { ...attempt, answers } });
});

// ─── Retake requests (preserves quiz-spa missed quiz flow) ──────
router.post('/retake-request', (req, res) => {
  const { studentId, studentName, quizId, quizTitle, reason } = req.body;
  db.prepare(`
    INSERT INTO retake_requests (student_id, student_name, quiz_id, quiz_title, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, studentName || '', quizId, quizTitle || '', reason || '');
  res.json({ success: true });
});

router.get('/retake-requests', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM retake_requests';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const requests = db.prepare(query).all(...params);
  res.json({ success: true, data: requests });
});

router.post('/retake-request/:id/approve', (req, res) => {
  db.prepare('UPDATE retake_requests SET status = ? WHERE id = ?').run('APPROVED', req.params.id);
  const request = db.prepare('SELECT * FROM retake_requests WHERE id = ?').get(req.params.id);
  if (request) {
    db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?')
      .run(request.quiz_id, request.student_id);
  }
  res.json({ success: true });
});

router.post('/retake-request/:id/deny', (req, res) => {
  db.prepare('UPDATE retake_requests SET status = ? WHERE id = ?').run('DENIED', req.params.id);
  res.json({ success: true });
});

// ─── Deadline extension requests ────────────────────────────────
router.post('/deadline-request', (req, res) => {
  const { studentId, studentName, quizId, quizTitle, reason } = req.body;
  db.prepare(`
    INSERT INTO deadline_requests (student_id, student_name, quiz_id, quiz_title, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, studentName || '', quizId, quizTitle || '', reason || '');
  res.json({ success: true });
});

router.get('/deadline-requests', (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM deadline_requests';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const requests = db.prepare(query).all(...params);
  res.json({ success: true, data: requests });
});

router.post('/deadline-request/:id/approve', (req, res) => {
  db.prepare('UPDATE deadline_requests SET status = ? WHERE id = ?').run('APPROVED', req.params.id);
  res.json({ success: true });
});

router.post('/deadline-request/:id/deny', (req, res) => {
  db.prepare('UPDATE deadline_requests SET status = ? WHERE id = ?').run('DENIED', req.params.id);
  res.json({ success: true });
});

// ─── Leaderboard ────────────────────────────────────────────────
router.get('/leaderboard', (req, res) => {
  const { gradeLevel, quizId } = req.query;
  let query = `
    SELECT student_id, student_name, grade_level, section,
      COUNT(*) as quizzes_taken,
      AVG(percentage) as avg_score,
      MAX(percentage) as best_score,
      SUM(CASE WHEN result='PASSED' THEN 1 ELSE 0 END) as passed_count
    FROM quiz_attempts WHERE submitted = 1
  `;
  const params = [];
  if (gradeLevel) { query += ' AND grade_level = ?'; params.push(gradeLevel); }
  if (quizId) { query += ' AND quiz_id = ?'; params.push(quizId); }
  query += ' GROUP BY student_id ORDER BY avg_score DESC LIMIT 100';

  const leaderboard = db.prepare(query).all(...params);
  res.json({ success: true, data: leaderboard });
});

// ─── Grade levels ───────────────────────────────────────────────
router.get('/grade-levels', (req, res) => {
  const gradeLevels = db.prepare('SELECT DISTINCT grade_level FROM quiz_students ORDER BY grade_level').all();
  res.json({ success: true, data: gradeLevels.map(g => g.grade_level) });
});

// ─── Quiz types ─────────────────────────────────────────────────
router.get('/types', (req, res) => {
  const types = db.prepare('SELECT * FROM quiz_types ORDER BY name').all();
  res.json({ success: true, data: types.map(t => t.name) });
});

export default router;
