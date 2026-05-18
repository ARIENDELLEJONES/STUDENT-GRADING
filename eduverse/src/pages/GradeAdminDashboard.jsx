import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function GradeAdminDashboard({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('databases');
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [dbData, setDbData] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [sectionStudents, setSectionStudents] = useState([]);
  const [sectionGrades, setSectionGrades] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [newDbName, setNewDbName] = useState('');
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState({});
  const [passwordRequests, setPasswordRequests] = useState([]);

  useEffect(() => { loadDatabases(); }, []);

  const loadDatabases = async () => {
    const res = await api.get('/grades/databases');
    if (res.success) setDatabases(res.databases);
  };

  const selectDatabase = async (db) => {
    setSelectedDb(db);
    setLoading(true);
    const res = await api.get(`/grades/database/${db.id}`);
    if (res.success) {
      setDbData(res);
      setWeights(res.weights || {});
    }
    const secRes = await api.get(`/grades/sections?databaseId=${db.id}`);
    if (secRes.success) setSections(secRes.sections);
    setLoading(false);
  };

  const createDatabase = async () => {
    if (!newDbName.trim()) return;
    const res = await api.post('/grades/databases', { name: newDbName });
    if (res.success) { showToast('Database created'); loadDatabases(); setNewDbName(''); }
    else showToast(res.message, 'error');
  };

  const deleteDatabase = async (id) => {
    if (!confirm('Delete this database?')) return;
    await api.del(`/grades/databases/${id}`);
    showToast('Database deleted');
    loadDatabases();
    if (selectedDb?.id === id) { setSelectedDb(null); setDbData(null); }
  };

  const loadSectionStudents = async (section) => {
    setSelectedSection(section);
    const res = await api.get(`/grades/section/${section}/students?databaseId=${selectedDb.id}`);
    if (res.success) setSectionStudents(res.students);
    const gradesRes = await api.get(`/grades/section/${section}/grades?databaseId=${selectedDb.id}`);
    if (gradesRes.success) setSectionGrades(gradesRes.students);
  };

  const searchStudent = async () => {
    if (!searchId.trim()) return;
    const res = await api.get(`/grades/student/${searchId}/search?databaseId=${selectedDb?.id || ''}`);
    if (res.success) setSearchResult(res);
    else { showToast(res.message, 'error'); setSearchResult(null); }
  };

  const saveWeights = async () => {
    const res = await api.post('/grades/weights', { databaseId: selectedDb.id, ...weights });
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const loadPasswordRequests = async () => {
    const res = await api.get('/students/password-requests');
    if (res.success) setPasswordRequests(res.data);
  };

  const resetPassword = async (studentId) => {
    const res = await api.post(`/students/${studentId}/reset-password`, { mode: 'grades' });
    showToast(res.message, res.success ? 'success' : 'error');
    loadPasswordRequests();
  };

  const saveScore = async (studentId, period, scoreType, slot, value) => {
    await api.post('/grades/student/scores', {
      databaseId: selectedDb.id, studentId, period, scoreType,
      scores: [{ slot, score: parseFloat(value) || 0 }]
    });
    showToast('Score saved');
  };

  const tabs = [
    { id: 'databases', label: 'Databases' },
    { id: 'students', label: 'Students' },
    { id: 'grades', label: 'Grades' },
    { id: 'search', label: 'Search Student' },
    { id: 'weights', label: 'Grading Weights' },
    { id: 'passwords', label: 'Password Requests' },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>EDUVERSE — Grade Admin</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {user.name || user.id} | {selectedDb ? `DB: ${selectedDb.name}` : 'Select a database'}
          </p>
        </div>
        <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'passwords') loadPasswordRequests(); }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(108,92,231,0.15)' : 'transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--primary)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'databases' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grade Databases</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input placeholder="New database name" value={newDbName} onChange={e => setNewDbName(e.target.value)} />
                <button onClick={createDatabase} className="btn btn-primary btn-sm">Create</button>
              </div>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {databases.map(db => (
                  <div key={db.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: selectedDb?.id === db.id ? 'var(--primary)' : 'var(--border)', cursor: 'pointer' }}
                    onClick={() => selectDatabase(db)}>
                    <div>
                      <h4 style={{ color: 'var(--text-bright)' }}>{db.name}</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Created: {db.created_at}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteDatabase(db.id); }} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                ))}
                {databases.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No databases yet. Create one to get started.</p>}
              </div>
            </div>
          )}

          {tab === 'students' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Students — {selectedDb.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {sections.map(s => (
                  <button key={s} onClick={() => loadSectionStudents(s)}
                    className={`btn btn-sm ${selectedSection === s ? 'btn-primary' : 'btn-outline'}`}>
                    Section {s}
                  </button>
                ))}
              </div>
              {sectionStudents.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>#</th><th>Student ID</th><th>Thai Name</th><th>English Name</th><th>Section</th><th>Class No</th></tr></thead>
                    <tbody>
                      {sectionStudents.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{s.student_id}</td>
                          <td>{s.thai_name}</td>
                          <td>{s.english_name}</td>
                          <td>{s.section}</td>
                          <td>{s.class_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'grades' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Section Grades — {selectedDb.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {sections.map(s => (
                  <button key={s} onClick={() => loadSectionStudents(s)}
                    className={`btn btn-sm ${selectedSection === s ? 'btn-primary' : 'btn-outline'}`}>
                    Section {s}
                  </button>
                ))}
              </div>
              {sectionGrades.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th><th>English Name</th><th>Section</th>
                        <th>Midterm</th><th>Final Initial</th><th>Final</th>
                        <th>Exam</th><th>Overall</th><th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionGrades.map(s => (
                        <tr key={s.studentId}>
                          <td>{s.studentId}</td>
                          <td>{s.englishName}</td>
                          <td>{s.section}</td>
                          <td>{s.midtermEquivalent}</td>
                          <td>{s.finalInitialEquivalent}</td>
                          <td>{s.finalFinalEquivalent}</td>
                          <td>{s.finalExamEquivalent}</td>
                          <td style={{ fontWeight: 600 }}>{s.overallTotal}</td>
                          <td><span className={`badge ${s.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{s.result}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'search' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Search Student</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input placeholder="Student ID" value={searchId} onChange={e => setSearchId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchStudent()} />
                <button onClick={searchStudent} className="btn btn-primary btn-sm">Search</button>
              </div>
              {searchResult && (
                <div className="card">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Student ID</span><br/><strong>{searchResult.student.studentId}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Thai Name</span><br/><strong>{searchResult.student.thaiName}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>English Name</span><br/><strong>{searchResult.student.englishName}</strong></div>
                    <div><span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Section</span><br/><strong>{searchResult.student.section}</strong></div>
                  </div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Scores</h4>
                  <table>
                    <thead><tr><th>Period</th><th>Type</th><th>Slot</th><th>Score</th></tr></thead>
                    <tbody>
                      {(searchResult.scores || []).map((s, i) => (
                        <tr key={i}>
                          <td>{s.period}</td><td>{s.score_type}</td><td>{s.slot}</td>
                          <td>
                            <input type="number" defaultValue={s.score} style={{ width: 80 }}
                              onBlur={e => saveScore(searchResult.student.studentId, s.period, s.score_type, s.slot, e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'weights' && selectedDb && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grading Weights — {selectedDb.name}</h3>
              <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <WeightInput label="Midterm Collective (%)" value={weights.midterm_collective} onChange={v => setWeights({...weights, midtermCollective: v})} />
                  <WeightInput label="Final Initial (%)" value={weights.final_initial} onChange={v => setWeights({...weights, finalInitial: v})} />
                  <WeightInput label="Final Final (%)" value={weights.final_final} onChange={v => setWeights({...weights, finalFinal: v})} />
                  <WeightInput label="Midterm Exam (%)" value={weights.midterm_exam} onChange={v => setWeights({...weights, midtermExam: v})} />
                  <WeightInput label="Final Exam (%)" value={weights.final_exam} onChange={v => setWeights({...weights, finalExam: v})} />
                  <WeightInput label="Pass Midterm" value={weights.pass_midterm} onChange={v => setWeights({...weights, passMidterm: v})} />
                  <WeightInput label="Pass Initial" value={weights.pass_initial} onChange={v => setWeights({...weights, passInitial: v})} />
                  <WeightInput label="Pass Final" value={weights.pass_final} onChange={v => setWeights({...weights, passFinal: v})} />
                  <WeightInput label="Pass Overall" value={weights.pass_overall} onChange={v => setWeights({...weights, passOverall: v})} />
                </div>
                <button onClick={saveWeights} className="btn btn-primary" style={{ marginTop: '1rem' }}>Save Weights</button>
              </div>
            </div>
          )}

          {tab === 'passwords' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Password Reset Requests</h3>
              {passwordRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No pending requests</p>}
              {passwordRequests.map((r, i) => (
                <div key={i} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.studentId}</strong> — {r.englishName} ({r.section})
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{r.date}</span>
                  </div>
                  <button onClick={() => resetPassword(r.studentId)} className="btn btn-secondary btn-sm">Reset to Default</button>
                </div>
              ))}
            </div>
          )}

          {!selectedDb && tab !== 'search' && tab !== 'databases' && tab !== 'passwords' && (
            <p style={{ color: 'var(--text-dim)' }}>Please select a database from the Databases tab first.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function WeightInput({ label, value, onChange }) {
  return (
    <div>
      <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>{label}</label>
      <input type="number" value={value || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
    </div>
  );
}
