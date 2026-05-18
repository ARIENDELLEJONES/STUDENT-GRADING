import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AdminPanel({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('system');
  const [systemInfo, setSystemInfo] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [importData, setImportData] = useState('');
  const [syncDirection, setSyncDirection] = useState('grades-to-quiz');
  const [syncDbId, setSyncDbId] = useState('');
  const [syncGradeLevel, setSyncGradeLevel] = useState('');
  const [databases, setDatabases] = useState([]);

  useEffect(() => { loadSystemInfo(); loadBackups(); loadDatabases(); }, []);

  const loadSystemInfo = async () => {
    const res = await api.get('/system/info');
    setSystemInfo(res);
  };

  const loadBackups = async () => {
    const res = await api.get('/backup');
    if (res.success) setBackups(res.data);
  };

  const loadDatabases = async () => {
    const res = await api.get('/grades/databases');
    if (res.success) setDatabases(res.databases);
  };

  const createJsonBackup = async () => {
    setBackupLoading(true);
    const res = await api.post('/backup/json', { modules: ['students', 'grades', 'quizzes', 'settings'] });
    if (res.success) {
      showToast(`Backup created: ${res.filename}`);
      loadBackups();
    } else showToast(res.message || 'Backup failed', 'error');
    setBackupLoading(false);
  };

  const createSqliteBackup = async () => {
    setBackupLoading(true);
    const res = await api.post('/backup/sqlite');
    if (res.success) {
      showToast(`SQLite backup: ${res.filename}`);
      loadBackups();
    } else showToast(res.message || 'Backup failed', 'error');
    setBackupLoading(false);
  };

  const downloadBackup = (filename) => {
    window.open(`/api/backup/download/${filename}`, '_blank');
  };

  const deleteBackup = async (id) => {
    if (!confirm('Delete this backup?')) return;
    await api.del(`/backup/${id}`);
    showToast('Backup deleted');
    loadBackups();
  };

  const restoreFromJson = async () => {
    if (!importData.trim()) { showToast('Paste backup JSON data', 'error'); return; }
    try {
      const data = JSON.parse(importData);
      const res = await api.post('/backup/restore/json', { data });
      showToast(res.message || 'Restored', res.success ? 'success' : 'error');
      if (res.success) setImportData('');
    } catch (e) {
      showToast('Invalid JSON data', 'error');
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => { setImportData(evt.target.result); };
    reader.readAsText(file);
  };

  const syncStudents = async () => {
    const res = await api.post('/students/sync', {
      direction: syncDirection,
      databaseId: parseInt(syncDbId),
      gradeLevel: syncGradeLevel
    });
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const exportExcel = async (type) => {
    const params = type === 'grades' ? `type=grades&databaseId=${syncDbId}` : 'type=quiz-results';
    const res = await api.get(`/backup/export/excel?${params}`);
    if (res.success && res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eduverse_${type}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded');
    }
  };

  const tabs = [
    { id: 'system', label: 'System Info' },
    { id: 'backup', label: 'Backup' },
    { id: 'restore', label: 'Restore' },
    { id: 'sync', label: 'Student Sync' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>EDUVERSE — Admin Panel</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>System Management</p>
        </div>
        <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(253,121,168,0.15)' : 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'system' && systemInfo && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>System Information</h3>
              <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  <InfoItem label="App Name" value={systemInfo.appName} />
                  <InfoItem label="Version" value={systemInfo.version} />
                  <InfoItem label="Author" value={systemInfo.author} />
                  <InfoItem label="Year" value={systemInfo.year} />
                  <InfoItem label="Port" value={systemInfo.port} />
                  <InfoItem label="Hostname" value={systemInfo.hostname} />
                  <InfoItem label="Platform" value={systemInfo.platform} />
                  <InfoItem label="Uptime" value={`${Math.floor(systemInfo.uptime)}s`} />
                </div>
                {systemInfo.lanAddresses?.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>LAN Access URLs</h4>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Students can connect via WiFi at:</p>
                    {systemInfo.lanAddresses.map((addr, i) => (
                      <div key={i} style={{ padding: '0.4rem 0.8rem', background: 'var(--bg-input)', borderRadius: 6, marginBottom: '0.3rem', fontFamily: 'monospace', color: 'var(--secondary)' }}>
                        {addr}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Create Backup</h3>
              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem' }}>
                <button onClick={createJsonBackup} className="btn btn-primary" disabled={backupLoading}>
                  {backupLoading ? 'Creating...' : 'JSON Backup'}
                </button>
                <button onClick={createSqliteBackup} className="btn btn-secondary" disabled={backupLoading}>
                  {backupLoading ? 'Creating...' : 'SQLite Backup'}
                </button>
              </div>
              <h4 style={{ marginBottom: '0.8rem' }}>Backup History</h4>
              {backups.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No backups yet</p>}
              {backups.map(b => (
                <div key={b.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{b.filename}</strong>
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Type: {b.type} | Size: {(b.size / 1024).toFixed(1)} KB | {b.created_at}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button onClick={() => downloadBackup(b.filename)} className="btn btn-outline btn-sm">Download</button>
                    <button onClick={() => deleteBackup(b.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'restore' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Restore from Backup</h3>
              <div className="card">
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Import backup file</label>
                  <input type="file" accept=".json" onChange={handleFileImport} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Or paste JSON data</label>
                  <textarea value={importData} onChange={e => setImportData(e.target.value)} rows={6} style={{ width: '100%' }} placeholder="Paste backup JSON here..." />
                </div>
                <button onClick={restoreFromJson} className="btn btn-primary">Restore</button>
                <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Warning: This will overwrite existing data for the restored modules.</p>
              </div>
            </div>
          )}

          {tab === 'sync' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Sync Students Between Modes</h3>
              <div className="card">
                <div style={{ display: 'grid', gap: '0.8rem', maxWidth: 400 }}>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Direction</label>
                    <select value={syncDirection} onChange={e => setSyncDirection(e.target.value)} style={{ width: '100%' }}>
                      <option value="grades-to-quiz">Grades → Quiz (Mode A → B)</option>
                      <option value="quiz-to-grades">Quiz → Grades (Mode B → A)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Grade Database</label>
                    <select value={syncDbId} onChange={e => setSyncDbId(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Select database</option>
                      {databases.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Grade Level</label>
                    <select value={syncGradeLevel} onChange={e => setSyncGradeLevel(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Select grade level</option>
                      {['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'].map(gl =>
                        <option key={gl} value={gl}>{gl}</option>)}
                    </select>
                  </div>
                  <button onClick={syncStudents} className="btn btn-primary">Sync Students</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'export' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Export Data</h3>
              <div style={{ display: 'grid', gap: '0.8rem', maxWidth: 400 }}>
                <div className="card">
                  <h4 style={{ marginBottom: '0.5rem' }}>Export Grades</h4>
                  <select value={syncDbId} onChange={e => setSyncDbId(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <option value="">Select database</option>
                    {databases.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button onClick={() => exportExcel('grades')} className="btn btn-primary btn-sm" disabled={!syncDbId}>Export Grades (JSON)</button>
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: '0.5rem' }}>Export Quiz Results</h4>
                  <button onClick={() => exportExcel('quiz-results')} className="btn btn-secondary btn-sm">Export Quiz Results (JSON)</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>{label}</span>
      <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>{value || '-'}</span>
    </div>
  );
}
