import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const App = () => {
  const [timers, setTimers] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [activeTimers, setActiveTimers] = useState({});
  const [hiddenCalendars, setHiddenCalendars] = useState([]);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [selectedCalendar, setSelectedCalendar] = useState('');
  const taskListRef = useRef(null);

  useEffect(() => {
    loadData();
    loadHiddenCalendars();
    loadLastUsedCalendar();
    
    // Listen for data changes from other windows
    const handleDataChanged = () => {
                console.log('Data changed, refreshing...');
                loadData();
                loadHiddenCalendars();
              };
    
    if (window.api && window.api.onDataChanged) {
      window.api.onDataChanged(handleDataChanged);
    }
    
    // Cleanup listener on unmount
    return () => {
      if (window.api && window.api.removeDataChangedListener) {
        window.api.removeDataChangedListener(handleDataChanged);
      }
    };
  }, []);

  useEffect(() => {
    if (shouldScrollToBottom && taskListRef.current && timers.length > 0) {
      const scrollToBottom = () => {
        const container = taskListRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      };
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 200);
      setShouldScrollToBottom(false);
    }
  }, [timers.length, shouldScrollToBottom]);

  const loadHiddenCalendars = () => {
    const saved = JSON.parse(localStorage.getItem('hiddenCalendars') || '[]');
    setHiddenCalendars(saved);
  };

  const loadLastUsedCalendar = () => {
    const lastUsed = localStorage.getItem('lastUsedCalendar') || '';
    setSelectedCalendar(lastUsed);
  };

  const saveLastUsedCalendar = (calendarId) => {
    localStorage.setItem('lastUsedCalendar', calendarId);
    setSelectedCalendar(calendarId);
  };

  const loadData = async () => {
    try {
      if (!window.api) {
        console.error('window.api is not defined. Cannot load data.');
        return;
      }
      const [calendarsData, timersData, activeTimersData] = await Promise.all([
        window.api.getCalendars(),
        window.api.getAllTimers(),
        window.api.getActiveTimers()
      ]);
      setCalendars(calendarsData);
      setTimers(timersData);
      setActiveTimers(activeTimersData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const refreshTimers = async () => {
    try {
      const [timersData, activeTimersData] = await Promise.all([
        window.api.getAllTimers(),
        window.api.getActiveTimers()
      ]);
      setTimers(timersData);
      setActiveTimers(activeTimersData);
    } catch (error) {
      console.error('Failed to refresh timers:', error);
    }
  };

  const handleStartStop = async (timer) => {
    try {
      const result = await window.api.startStopTimer(timer.name);
      
      if (result.action === 'started') {
        setActiveTimers(prev => ({
          ...prev,
          [timer.name]: result.startTime.toISOString()
        }));
        // Don't scroll when starting a timer
      } else {
        setActiveTimers(prev => {
          const newActive = { ...prev };
          delete newActive[timer.name];
          return newActive;
        });
      }
    } catch (error) {
      console.error('Failed to start/stop timer:', error);
      alert('Failed to start/stop timer');
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name').trim();
    const calendarId = formData.get('calendarId');

    if (!name || !calendarId) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await window.api.addTimer(name, calendarId);
      saveLastUsedCalendar(calendarId); // Save the last used calendar
      await refreshTimers();
      e.target.reset();
      // Reset the form but keep the selected calendar
      const form = e.target;
      const calendarSelect = form.querySelector('select[name="calendarId"]');
      if (calendarSelect) {
        calendarSelect.value = calendarId;
      }
      setShouldScrollToBottom(true);
    } catch (error) {
      console.error('Failed to add timer:', error);
      alert('Failed to add timer');
    }
  };

  const handleCalendarChange = (e) => {
    const calendarId = e.target.value;
    saveLastUsedCalendar(calendarId);
  };

  const getCalendarName = (calendarId) => {
    const calendar = calendars.find(cal => cal.id === calendarId);
    return calendar ? calendar.name : calendarId;
  };

  const openSettings = () => {
    window.api.openSettings();
  };

  const startAuth = async () => {
    try {
      await window.api.startAuth();
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const quitApp = () => {
    window.api.quitApp();
  };

  const visibleCalendars = calendars.filter(cal => !hiddenCalendars.includes(cal.id));

  return (
    <div className="app">
      <div className="task-list-container" ref={taskListRef}>
        {timers.length === 0 ? (
          <div className="empty-state">
            {calendars.length === 0 ? (
              <>
                <div>No Google Calendar access</div>
                <small>Connect your Google Calendar to get started</small>
                <button className="auth-button" onClick={startAuth}>
                  🔐 Connect Google Calendar
                </button>
              </>
            ) : (
              <>
                <div>No timers configured</div>
                <small>Add timers in settings to get started</small>
              </>
            )}
          </div>
        ) : (
          timers.map((timer) => {
            const isActive = activeTimers[timer.name];
            const startTime = isActive ? new Date(activeTimers[timer.name]) : null;
            
            return (
              <div key={timer.name} className="task-item">
                <div className="task-info">
                  <div className="task-name">{timer.name}</div>
                  <div className="task-calendar">{getCalendarName(timer.calendarId)}</div>
                  {isActive && startTime && (
                    <div className="task-duration">
                      Started: {startTime.toLocaleTimeString()}
                    </div>
                  )}
                </div>
                <button
                  className={`task-button ${isActive ? 'stop' : ''}`}
                  onClick={() => handleStartStop(timer)}
                >
                  {isActive ? 'Stop' : 'Start'}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="quick-input">
        <form onSubmit={handleAddTask} className="quick-input-row">
          <select 
            name="calendarId" 
            value={selectedCalendar}
            onChange={handleCalendarChange}
            required
          >
            <option value="">Select...</option>
            {visibleCalendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="name"
            placeholder="Quick add task..."
            required
          />
        </form>
      </div>

      <div className="footer-menu">
        <div className="menu-item" onClick={openSettings}>
          <span className="menu-item-text">⚙️</span>
        </div>
        <div className="menu-item" onClick={quitApp}>
          <span className="menu-item-text">✕</span>
        </div>
      </div>
    </div>
  );
};

export default App; 