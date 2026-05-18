import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Teacher: Create live game from existing quiz
router.post('/create', (req, res) => {
  const { quizId, hostId, questionDuration } = req.body;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quizId);
  if (questions.length === 0) return res.json({ success: false, error: 'Quiz has no questions' });

  let pin = generatePin();
  let attempts = 0;
  while (db.prepare('SELECT id FROM live_games WHERE pin = ? AND status != ?').get(pin, 'ENDED') && attempts < 10) {
    pin = generatePin();
    attempts++;
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO live_games (id, quiz_id, pin, host_id, status, question_duration)
    VALUES (?, ?, ?, ?, 'LOBBY', ?)`).run(id, quizId, pin, hostId || '', questionDuration || 20);

  res.json({ success: true, data: { gameId: id, pin, questionCount: questions.length, quizTitle: quiz.title } });
});

// Student: Join live game with PIN
router.post('/join', (req, res) => {
  const { pin, studentId, nickname } = req.body;
  const game = db.prepare("SELECT * FROM live_games WHERE pin = ? AND status = 'LOBBY'").get(pin);
  if (!game) return res.json({ success: false, error: 'Game not found or already started' });

  try {
    db.prepare('INSERT INTO live_game_players (game_id, student_id, nickname) VALUES (?, ?, ?)')
      .run(game.id, studentId, nickname || studentId);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.json({ success: false, error: 'Already joined' });
    throw e;
  }

  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY joined_at').all(game.id);
  res.json({ success: true, data: { gameId: game.id, players: players.map(p => ({ studentId: p.student_id, nickname: p.nickname })) } });
});

// Get game state (polled by both teacher and students)
router.get('/:gameId/state', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY total_score DESC')
    .all(game.id);
  const quiz = db.prepare('SELECT title, question_count FROM quizzes WHERE id = ?').get(game.quiz_id);

  let currentQuestion = null;
  let answeredCount = 0;
  let timeRemaining = 0;

  if (game.current_question >= 0) {
    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
    if (game.current_question < questions.length) {
      const q = questions[game.current_question];
      currentQuestion = {
        index: game.current_question,
        total: questions.length,
        questionText: q.question_text,
        choices: [q.choice_a, q.choice_b, q.choice_c, q.choice_d].filter(c => c),
        points: q.points || 1,
        timeLimit: game.question_duration
      };
    }
    answeredCount = db.prepare('SELECT COUNT(*) as cnt FROM live_game_answers WHERE game_id = ? AND question_index = ?')
      .get(game.id, game.current_question).cnt;

    if (game.question_start_time) {
      const elapsed = (Date.now() - new Date(game.question_start_time).getTime()) / 1000;
      timeRemaining = Math.max(0, game.question_duration - elapsed);
    }
  }

  res.json({
    success: true,
    data: {
      gameId: game.id,
      pin: game.pin,
      status: game.status,
      quizTitle: quiz?.title || '',
      questionCount: quiz?.question_count || 0,
      currentQuestion,
      answeredCount,
      totalPlayers: players.length,
      timeRemaining: Math.round(timeRemaining),
      leaderboard: players.map(p => ({
        studentId: p.student_id,
        nickname: p.nickname,
        score: p.total_score,
        correctCount: p.correct_count,
        streak: p.streak
      }))
    }
  });
});

// Teacher: Start the game
router.post('/:gameId/start', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  db.prepare("UPDATE live_games SET status = 'PLAYING', current_question = 0, question_start_time = ? WHERE id = ?")
    .run(new Date().toISOString(), req.params.gameId);

  res.json({ success: true });
});

// Teacher: Next question
router.post('/:gameId/next', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const nextQ = game.current_question + 1;

  if (nextQ >= questions.length) {
    db.prepare("UPDATE live_games SET status = 'RESULTS', current_question = ? WHERE id = ?")
      .run(nextQ, req.params.gameId);
    return res.json({ success: true, data: { finished: true } });
  }

  db.prepare("UPDATE live_games SET current_question = ?, question_start_time = ?, status = 'PLAYING' WHERE id = ?")
    .run(nextQ, new Date().toISOString(), req.params.gameId);

  res.json({ success: true, data: { finished: false, questionIndex: nextQ } });
});

// Teacher: Show results between questions
router.post('/:gameId/show-results', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  db.prepare("UPDATE live_games SET status = 'SHOWING_RESULTS' WHERE id = ?").run(req.params.gameId);

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const q = questions[game.current_question];
  const answers = db.prepare('SELECT * FROM live_game_answers WHERE game_id = ? AND question_index = ?')
    .all(game.id, game.current_question);

  const choiceCounts = { A: 0, B: 0, C: 0, D: 0 };
  answers.forEach(a => {
    const upper = (a.answer || '').toUpperCase();
    if (choiceCounts[upper] !== undefined) choiceCounts[upper]++;
  });

  res.json({
    success: true,
    data: {
      correctAnswer: q?.correct_answer || '',
      choiceCounts,
      totalAnswered: answers.length,
      correctCount: answers.filter(a => a.is_correct).length
    }
  });
});

// Student: Submit answer for current question
router.post('/:gameId/answer', (req, res) => {
  const { studentId, answer } = req.body;
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });
  if (game.status !== 'PLAYING') return res.json({ success: false, error: 'Not accepting answers' });

  const existing = db.prepare('SELECT id FROM live_game_answers WHERE game_id = ? AND question_index = ? AND student_id = ?')
    .get(game.id, game.current_question, studentId);
  if (existing) return res.json({ success: false, error: 'Already answered' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const q = questions[game.current_question];
  if (!q) return res.json({ success: false, error: 'Question not found' });

  const isCorrect = String(answer || '').trim().toUpperCase() === String(q.correct_answer || '').trim().toUpperCase();

  let timeTaken = 0;
  if (game.question_start_time) {
    timeTaken = (Date.now() - new Date(game.question_start_time).getTime()) / 1000;
  }

  let points = 0;
  if (isCorrect) {
    const maxPoints = 1000;
    const timeBonus = Math.max(0, 1 - (timeTaken / game.question_duration));
    points = Math.round(maxPoints * (0.5 + 0.5 * timeBonus));
  }

  db.prepare(`INSERT INTO live_game_answers (game_id, question_index, student_id, answer, is_correct, time_taken, points_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(game.id, game.current_question, studentId, answer || '', isCorrect ? 1 : 0, timeTaken, points);

  const player = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? AND student_id = ?').get(game.id, studentId);
  if (player) {
    const newStreak = isCorrect ? player.streak + 1 : 0;
    const streakBonus = isCorrect && newStreak >= 3 ? Math.min(newStreak - 2, 5) * 100 : 0;
    db.prepare('UPDATE live_game_players SET total_score = ?, correct_count = ?, streak = ? WHERE game_id = ? AND student_id = ?')
      .run(player.total_score + points + streakBonus, player.correct_count + (isCorrect ? 1 : 0), newStreak, game.id, studentId);
  }

  res.json({ success: true, data: { isCorrect, points, timeTaken: timeTaken.toFixed(1) } });
});

// Teacher: End game
router.post('/:gameId/end', (req, res) => {
  db.prepare("UPDATE live_games SET status = 'ENDED' WHERE id = ?").run(req.params.gameId);
  res.json({ success: true });
});

// Get final results / podium
router.get('/:gameId/final', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(game.quiz_id);
  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY total_score DESC')
    .all(game.id);
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);

  const questionResults = questions.map((q, i) => {
    const answers = db.prepare('SELECT * FROM live_game_answers WHERE game_id = ? AND question_index = ?').all(game.id, i);
    return {
      questionText: q.question_text,
      correctAnswer: q.correct_answer,
      totalAnswered: answers.length,
      correctCount: answers.filter(a => a.is_correct).length,
      avgTime: answers.length > 0 ? (answers.reduce((s, a) => s + a.time_taken, 0) / answers.length).toFixed(1) : 0
    };
  });

  res.json({
    success: true,
    data: {
      quizTitle: quiz?.title || '',
      totalQuestions: questions.length,
      totalPlayers: players.length,
      podium: players.slice(0, 3).map(p => ({ nickname: p.nickname, score: p.total_score, correct: p.correct_count })),
      leaderboard: players.map((p, i) => ({ rank: i + 1, nickname: p.nickname, studentId: p.student_id, score: p.total_score, correct: p.correct_count })),
      questionResults
    }
  });
});

// List active games
router.get('/active', (req, res) => {
  const games = db.prepare("SELECT lg.*, q.title as quiz_title, q.question_count FROM live_games lg JOIN quizzes q ON lg.quiz_id = q.id WHERE lg.status != 'ENDED' ORDER BY lg.created_at DESC").all();
  const result = games.map(g => {
    const playerCount = db.prepare('SELECT COUNT(*) as cnt FROM live_game_players WHERE game_id = ?').get(g.id).cnt;
    return { ...g, playerCount };
  });
  res.json({ success: true, data: result });
});

export default router;
