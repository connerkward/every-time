 import React, { useState, useEffect } from 'react';
import './Settings.css';

const Settings = () => {
  console.log('Settings component rendering...');
  
  try {
    const [timers, setTimers] = useState([]);
    const [calendars, setCalendars] = useState([]);
    const [editingTimer, setEditingTimer] = useState(null);
    const [hiddenCalendars, setHiddenCalendars] = useState([]);
    const [formData, setFormData] = useState({ name: '', calendarId: '' });

  useEffect(() => {
    loadData();
    const savedHidden = JSON.parse(localStorage.getItem('hiddenCalendars') || '[]');
    setHiddenCalendars(savedHidden);
  }, []);

  const loadData = async () => {
    try {
      const [calendarsData, timersData] = await Promise.all([
        window.api.getCalendars(),
        window.api.getAllTimers()
      ]);
      setCalendars(calendarsData);
      setTimers(timersData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

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

  const visibleCalendars = calendars.filter(cal => !hiddenCalendars.includes(cal.id));

  } catch (error) {
    console.error('Settings component error:', error);
    return <div>Error loading settings: {error.message}</div>;
  }

  return (
    <div className="settings-container">
      <div className="header">
        <h1>trackd Settings</h1>
      </div>

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

      <div className="section">
        <h2>Claude Desktop Integration</h2>
        <p className="help-text">
          Connect Trackd with Claude Desktop to manage timers through natural language.
        </p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            console.log('Connect with Claude Desktop button clicked!');
            // Use the preload API to open the file
            window.api.openDxtFile();
          }}
        >
          Connect with Claude Desktop
        </button>
      </div>
    </div>
  );
};

export default Settings; 