import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './Settings.css';

const Settings = () => {
  const [timers, setTimers] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [editingTimer, setEditingTimer] = useState(null);
  const [hiddenCalendars, setHiddenCalendars] = useState([]);
  const [formData, setFormData] = useState({ name: '', calendarId: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loadData = async () => {
    try {
      if (!window.api) {
        console.log('window.api not available yet, skipping loadData');
        return;
      }
      const [calendarsData, timersData] = await Promise.all([
        window.api.getCalendars(),
        window.api.getAllTimers()
      ]);
      setCalendars(calendarsData);
      setTimers(timersData);
      setIsAuthenticated(calendarsData.length > 0);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  // Load mock API only in development (when served via HTTP)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && !window.api) {
      console.log('Loading mock API for settings...');
      import('./mock-api.js').then(() => {
        console.log('Mock API loaded, window.api:', window.api);
        // Trigger a re-render after mock API loads
        setTimeout(() => loadData(), 100);
      });
    } else {
      console.log('Mock API conditions not met:', {
        protocol: window.location?.protocol,
        hasApi: !!window.api
      });
    }
  }, []);

  useEffect(() => {
    loadData();
    const savedHidden = JSON.parse(localStorage.getItem('hiddenCalendars') || '[]');
    setHiddenCalendars(savedHidden);
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.calendarId) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await window.api.saveTimer(formData.name.trim(), formData.calendarId);
      
      // Update local state
      if (editingTimer) {
        setTimers(prev => prev.map(t => 
          t.name === editingTimer.name 
            ? { name: formData.name.trim(), calendarId: formData.calendarId }
            : t
        ));
      } else {
        setTimers(prev => [...prev, { 
          name: formData.name.trim(), 
          calendarId: formData.calendarId 
        }]);
      }

      // Reset form
      setFormData({ name: '', calendarId: '' });
      setEditingTimer(null);

      // Notify main window of data change
      window.api.notifyDataChanged();
    } catch (error) {
      console.error('Failed to save timer:', error);
      alert('Failed to save timer');
    }
  };

  const handleEdit = (timer) => {
    setEditingTimer(timer);
    setFormData({ name: timer.name, calendarId: timer.calendarId });
  };

  const handleDelete = async (name) => {
    if (!confirm(`Are you sure you want to delete the timer "${name}"?`)) {
      return;
    }

    try {
      await window.api.deleteTimer(name);
      setTimers(prev => prev.filter(t => t.name !== name));
      
      // Notify main window of data change
      window.api.notifyDataChanged();
    } catch (error) {
      console.error('Failed to delete timer:', error);
      alert('Failed to delete timer');
    }
  };

  const toggleCalendarVisibility = (calendarId) => {
    const newHidden = hiddenCalendars.includes(calendarId)
      ? hiddenCalendars.filter(id => id !== calendarId)
      : [...hiddenCalendars, calendarId];
    
    setHiddenCalendars(newHidden);
    localStorage.setItem('hiddenCalendars', JSON.stringify(newHidden));
    
    if (window.api && window.api.notifyCalendarChange) {
      window.api.notifyCalendarChange();
    }
  };

  const getCalendarName = (calendarId) => {
    const calendar = calendars.find(c => c.id === calendarId);
    return calendar ? calendar.name : calendarId;
  };

  const startAuth = async () => {
    try {
      await window.api.startAuth();
      // Reload data after auth
      setTimeout(loadData, 1000);
    } catch (error) {
      console.error('Auth error:', error);
    }
  };



  const visibleCalendars = calendars.filter(cal => !hiddenCalendars.includes(cal.id));

  return (
    <div className="settings-container">
      <div className="header">
        <h1>Timer Tracker Settings</h1>
      </div>

      {!isAuthenticated && (
        <div className="section">
          <h2>Authentication</h2>
          <p className="help-text">
            Connect your Google Calendar to start tracking time.
          </p>
          <button className="btn btn-primary" onClick={startAuth}>
            🔐 Connect Google Calendar
          </button>
        </div>
      )}

      {isAuthenticated && (
        <>
          <div className="section">
            <h2>Add New Timer</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Task Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g., Coding, Meetings, Exercise"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="calendarId">Calendar</label>
                <select
                  id="calendarId"
                  name="calendarId"
                  value={formData.calendarId}
                  onChange={handleFormChange}
                  required
                >
                  <option value="">Select a calendar...</option>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name} {calendar.primary ? '(Primary)' : ''} 
                      ({calendar.accessRole === 'owner' ? 'Owner' : 'Writer'})
                    </option>
                  ))}
                </select>
                <div className="help-text">Select which calendar to create events in</div>
              </div>
              <button type="submit" className="btn btn-primary">
                {editingTimer ? 'Update Timer' : 'Add Timer'}
              </button>
              {editingTimer && (
                <button 
                  type="button" 
                  className="btn"
                  onClick={() => {
                    setEditingTimer(null);
                    setFormData({ name: '', calendarId: '' });
                  }}
                  style={{ marginLeft: '12px' }}
                >
                  Cancel
                </button>
              )}
            </form>
          </div>

          <div className="section">
            <h2>Calendars</h2>
            <div className="calendar-list">
              {calendars.length === 0 ? (
                <div className="empty-state">Loading calendars...</div>
              ) : (
                calendars.map((calendar) => (
                  <div key={calendar.id} className="calendar-item">
                    <div className="calendar-info">
                      <div className="calendar-name">{calendar.name}</div>
                      <div className="calendar-details">
                        {calendar.accessRole === 'owner' ? 'Owner' : 'Writer'}
                        {calendar.primary && ' • Primary'}
                      </div>
                    </div>
                    <div className="calendar-actions">
                      <div
                        className={`toggle-switch ${!hiddenCalendars.includes(calendar.id) ? 'active' : ''}`}
                        onClick={() => toggleCalendarVisibility(calendar.id)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="section">
            <h2>Timers</h2>
            <div className="timer-list">
              {timers.length === 0 ? (
                <div className="empty-state">
                  No timers configured<br />
                  <small>Add your first timer above</small>
                </div>
              ) : (
                timers.map((timer) => (
                  <div key={timer.name} className="timer-item">
                    <div className="timer-info">
                      <div className="timer-name">{timer.name}</div>
                      <div className="timer-calendar">
                        Calendar: {getCalendarName(timer.calendarId)}
                      </div>
                    </div>
                    <div className="timer-actions">
                      <button
                        className="btn"
                        onClick={() => handleEdit(timer)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(timer.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}


    </div>
  );
};

// Initialize the settings app
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Settings />);