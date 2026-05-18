import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { KahootHostView } from './KahootGame';

export default function QuizTeacherDashboard({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('quizzes');
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [retakeRequests, setRetakeRequests] = useState([]);
  const [deadlineRequests, setDeadlineRequests] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [studentDbs, setStudentDbs] = useState([]);
  const [showLiveGame, setShowLiveGame] = useState(false);

  // Quiz form state
  const [form, setForm] = useState({
    title: '', type: 'QUIZ', subject: '', passingScore: 50, attemptsAllowed: 1,
    timeLimit: 0, retakeAllowed: 'NO', randomizeQuestions: 'NO', randomizeChoices: 'NO',
    startDate: '', deadline: '', gradeLevels: [], questions: []
  });
  const [questionForm, setQuestionForm] = useState({
    questionText: '', questionType: 'MCQ', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1
  });

  useEffect(() => { loadQuizzes(); loadGradeLevels(); loadStudentDbs(); }, []);

  const loadQuizzes = async () => {
    const res = await api.get('/quiz/list');
    if (res.success) setQuizzes(res.data);
  };

  const loadGradeLevels = async () => {
    const res = await api.get('/quiz/grade-levels');
    if (res.success) setGradeLevels(res.data);
  };

  const loadStudentDbs = async () => {
    const res = await api.get('/quiz/student-databases');
    if (res.success) setStudentDbs(res.data);
  };

  const loadResults = async (quizId) => {
    setLoading(true);
    const res = await api.get(`/quiz/${quizId}/results`);
    if (res.success) setQuizResults(res.data);
    setLoading(false);
  };

  const loadRetakeRequests = async () => {
    const res = await api.get('/quiz/retake-requests');
    if (res.success) setRetakeRequests(res.data);
  };

  const loadDeadlineRequests = async () => {
    const res = await api.get('/quiz/deadline-requests');
    if (res.success) setDeadlineRequests(res.data);
  };

  const loadLeaderboard = async () => {
    const res = await api.get('/quiz/leaderboard');
    if (res.success) setLeaderboard(res.data);
  };

  const addQuestion = () => {
    if (!questionForm.questionText.trim()) { showToast('Question text required', 'error'); return; }
    setForm({ ...form, questions: [...form.questions, { ...questionForm }] });
    setQuestionForm({ questionText: '', questionType: 'MCQ', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });
  };

  const removeQuestion = (index) => {
    setForm({ ...form, questions: form.questions.filter((_, i) => i !== index) });
  };

  const createQuiz = async () => {
    if (!form.title.trim()) { showToast('Title required', 'error'); return; }
    if (form.questions.length === 0) { showToast('Add at least one question', 'error'); return; }
    const res = await api.post('/quiz/create', { ...form, createdBy: user.name || user.id || '' });
    if (res.success) { showToast('Quiz created'); setShowCreate(false); loadQuizzes(); resetForm(); }
    else showToast(res.error || 'Failed', 'error');
  };

  const resetForm = () => {
    setForm({ title: '', type: 'QUIZ', subject: '', passingScore: 50, attemptsAllowed: 1, timeLimit: 0, retakeAllowed: 'NO', randomizeQuestions: 'NO', randomizeChoices: 'NO', startDate: '', deadline: '', gradeLevels: [], questions: [] });
  };

  const publishQuiz = async (id) => { await api.post(`/quiz/${id}/publish`); showToast('Quiz published'); loadQuizzes(); };
  const closeQuiz = async (id) => { await api.post(`/quiz/${id}/close`); showToast('Quiz closed'); loadQuizzes(); };
  const reopenQuiz = async (id) => { await api.post(`/quiz/${id}/reopen`); showToast('Quiz reopened'); loadQuizzes(); };
  const deleteQuiz = async (id) => { if (!confirm('Delete this quiz?')) return; await api.del(`/quiz/${id}`); showToast('Quiz deleted'); loadQuizzes(); };

  const approveRetake = async (id) => { await api.post(`/quiz/retake-request/${id}/approve`); showToast('Approved'); loadRetakeRequests(); };
  const denyRetake = async (id) => { await api.post(`/quiz/retake-request/${id}/deny`); showToast('Denied'); loadRetakeRequests(); };
  const approveDeadline = async (id) => { await api.post(`/quiz/deadline-request/${id}/approve`); showToast('Approved'); loadDeadlineRequests(); };
  const denyDeadline = async (id) => { await api.post(`/quiz/deadline-request/${id}/deny`); showToast('Denied'); loadDeadlineRequests(); };

  const toggleGradeLevel = (gl) => {
    const current = form.gradeLevels || [];
    setForm({ ...form, gradeLevels: current.includes(gl) ? current.filter(g => g !== gl) : [...current, gl] });
  };

  const allGradeLevels = ['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'];
  const tabs = [
    { id: 'quizzes', label: 'Quizzes' },
    { id: 'create', label: 'Create Quiz' },
    { id: 'results', label: 'Results' },
    { id: 'retakes', label: 'Retake Requests' },
    { id: 'deadlines', label: 'Deadline Requests' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'students', label: 'Student DBs' },
    { id: 'livegame', label: 'Live Game' },
  ];

  if (showLiveGame) {
    return <KahootHostView user={user} quizzes={quizzes} showToast={showToast} onBack={() => setShowLiveGame(false)} />;
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--secondary)', fontSize: '1.2rem' }}>EDUVERSE — Quiz Teacher Dashboard</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{user.name || user.username || 'Teacher'}</p>
        </div>
        <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'retakes') loadRetakeRequests(); if (t.id === 'deadlines') loadDeadlineRequests(); if (t.id === 'leaderboard') loadLeaderboard(); }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(0,206,201,0.15)' : 'transparent', color: tab === t.id ? 'var(--secondary)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--secondary)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'quizzes' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>All Quizzes</h3>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {quizzes.map(q => (
                  <div key={q.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ color: 'var(--text-bright)' }}>{q.title}</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        {q.type} | {q.subject} | {q.question_count} questions | Pass: {q.passing_score}%
                      </p>
                      <span className={`badge ${q.status === 'ACTIVE' ? 'badge-success' : q.status === 'DRAFT' ? 'badge-warning' : 'badge-danger'}`}>{q.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button onClick={() => { setSelectedQuiz(q); loadResults(q.id); setTab('results'); }} className="btn btn-outline btn-sm">Results</button>
                      {q.status === 'DRAFT' && <button onClick={() => publishQuiz(q.id)} className="btn btn-secondary btn-sm">Publish</button>}
                      {q.status === 'ACTIVE' && <button onClick={() => closeQuiz(q.id)} className="btn btn-outline btn-sm">Close</button>}
                      {q.status === 'CLOSED' && <button onClick={() => reopenQuiz(q.id)} className="btn btn-secondary btn-sm">Reopen</button>}
                      <button onClick={() => deleteQuiz(q.id)} className="btn btn-danger btn-sm">Delete</button>
                    </div>
                  </div>
                ))}
                {quizzes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No quizzes yet. Create one to get started.</p>}
              </div>
            </div>
          )}

          {tab === 'create' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Create New Quiz</h3>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Type</label>
                    <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={{ width: '100%' }}>
                      <option>QUIZ</option><option>EXAM</option><option>PRACTICE</option><option>HOMEWORK</option><option>GAME</option>
                    </select></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Subject</label><input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Passing Score (%)</label><input type="number" value={form.passingScore} onChange={e => setForm({...form, passingScore: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Attempts Allowed</label><input type="number" value={form.attemptsAllowed} onChange={e => setForm({...form, attemptsAllowed: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Time Limit (min, 0=none)</label><input type="number" value={form.timeLimit} onChange={e => setForm({...form, timeLimit: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Deadline</label><input type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Questions</label>
                    <select value={form.randomizeQuestions} onChange={e => setForm({...form, randomizeQuestions: e.target.value})} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Choices</label>
                    <select value={form.randomizeChoices} onChange={e => setForm({...form, randomizeChoices: e.target.value})} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Grade Levels</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                    {allGradeLevels.map(gl => (
                      <button key={gl} onClick={() => toggleGradeLevel(gl)}
                        className={`btn btn-sm ${(form.gradeLevels || []).includes(gl) ? 'btn-secondary' : 'btn-outline'}`}>{gl}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <h4 style={{ marginBottom: '0.8rem' }}>Add Question ({form.questions.length} added)</h4>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <textarea placeholder="Question text" value={questionForm.questionText} onChange={e => setQuestionForm({...questionForm, questionText: e.target.value})} rows={2} style={{ width: '100%' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input placeholder="Choice A" value={questionForm.choiceA} onChange={e => setQuestionForm({...questionForm, choiceA: e.target.value})} />
                    <input placeholder="Choice B" value={questionForm.choiceB} onChange={e => setQuestionForm({...questionForm, choiceB: e.target.value})} />
                    <input placeholder="Choice C" value={questionForm.choiceC} onChange={e => setQuestionForm({...questionForm, choiceC: e.target.value})} />
                    <input placeholder="Choice D" value={questionForm.choiceD} onChange={e => setQuestionForm({...questionForm, choiceD: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select value={questionForm.correctAnswer} onChange={e => setQuestionForm({...questionForm, correctAnswer: e.target.value})} style={{ flex: 1 }}>
                      <option value="">Correct Answer</option><option>A</option><option>B</option><option>C</option><option>D</option>
                    </select>
                    <input type="number" placeholder="Points" value={questionForm.points} onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})} style={{ width: 80 }} />
                    <button onClick={addQuestion} className="btn btn-secondary btn-sm">Add</button>
                  </div>
                </div>

                {form.questions.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    {form.questions.map((q, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.85rem' }}>{i + 1}. {q.questionText.substring(0, 60)}... (Answer: {q.correctAnswer})</span>
                        <button onClick={() => removeQuestion(i)} style={{ background: 'none', color: 'var(--danger)', fontSize: '0.8rem' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={createQuiz} className="btn btn-primary">Create Quiz</button>
            </div>
          )}

          {tab === 'results' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Quiz Results {selectedQuiz ? `— ${selectedQuiz.title}` : ''}</h3>
              {!selectedQuiz && (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {quizzes.map(q => (
                    <button key={q.id} onClick={() => { setSelectedQuiz(q); loadResults(q.id); }} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}>
                      <strong>{q.title}</strong> — {q.status}
                    </button>
                  ))}
                </div>
              )}
              {selectedQuiz && quizResults && (
                <div>
                  <button onClick={() => { setSelectedQuiz(null); setQuizResults(null); }} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>Back to list</button>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                    <StatCard label="Total Attempts" value={quizResults.statistics.totalAttempts} />
                    <StatCard label="Average Score" value={`${quizResults.statistics.averageScore}%`} />
                    <StatCard label="Highest" value={`${quizResults.statistics.highestScore}%`} />
                    <StatCard label="Lowest" value={`${quizResults.statistics.lowestScore}%`} />
                    <StatCard label="Passed" value={quizResults.statistics.passCount} />
                    <StatCard label="Failed" value={quizResults.statistics.failCount} />
                  </div>
                  <table>
                    <thead><tr><th>Student ID</th><th>Name</th><th>Grade</th><th>Section</th><th>Score</th><th>%</th><th>Result</th><th>Tab Switches</th></tr></thead>
                    <tbody>
                      {quizResults.attempts.map(a => (
                        <tr key={a.id}>
                          <td>{a.student_id}</td><td>{a.student_name}</td><td>{a.grade_level}</td><td>{a.section}</td>
                          <td>{a.score}/{a.total_points}</td><td>{a.percentage}%</td>
                          <td><span className={`badge ${a.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{a.result}</span></td>
                          <td>{a.tab_switch_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'retakes' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Retake Requests</h3>
              {retakeRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No retake requests</p>}
              {retakeRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | Status: </span>
                    <span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                  </div>
                  {r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => approveRetake(r.id)} className="btn btn-secondary btn-sm">Approve</button>
                      <button onClick={() => denyRetake(r.id)} className="btn btn-danger btn-sm">Deny</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'deadlines' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Deadline Extension Requests</h3>
              {deadlineRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No deadline requests</p>}
              {deadlineRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | </span>
                    <span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                  </div>
                  {r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => approveDeadline(r.id)} className="btn btn-secondary btn-sm">Approve</button>
                      <button onClick={() => denyDeadline(r.id)} className="btn btn-danger btn-sm">Deny</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'leaderboard' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Leaderboard</h3>
              <table>
                <thead><tr><th>Rank</th><th>Student ID</th><th>Name</th><th>Grade</th><th>Quizzes</th><th>Avg Score</th><th>Best</th><th>Passed</th></tr></thead>
                <tbody>
                  {leaderboard.map((s, i) => (
                    <tr key={s.student_id}>
                      <td style={{ fontWeight: 700, color: i < 3 ? 'var(--warning)' : 'var(--text)' }}>{i + 1}</td>
                      <td>{s.student_id}</td><td>{s.student_name}</td><td>{s.grade_level}</td>
                      <td>{s.quizzes_taken}</td><td>{parseFloat(s.avg_score).toFixed(1)}%</td>
                      <td>{parseFloat(s.best_score).toFixed(1)}%</td><td>{s.passed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'livegame' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Kahoot-Style Live Game</h3>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Host a live quiz game where students join with a PIN and answer questions in real-time. Points are awarded based on speed and accuracy.</p>
              <button onClick={() => setShowLiveGame(true)} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Start Live Game</button>
            </div>
          )}

          {tab === 'students' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Student Databases</h3>
              {studentDbs.map(d => (
                <div key={d.id} className="card" style={{ marginBottom: '0.5rem' }}>
                  <strong>{d.name}</strong> — {d.grade_level}
                  <span className={`badge badge-info`} style={{ marginLeft: '0.5rem' }}>{d.status}</span>
                </div>
              ))}
              {studentDbs.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No student databases configured</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.8rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{label}</p>
      <p style={{ color: 'var(--text-bright)', fontSize: '1.3rem', fontWeight: 700 }}>{value}</p>
    </div>
  );
}
