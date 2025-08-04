import Store from 'electron-store';
import { GoogleCalendarService, CalendarEvent } from './googleCalendarService';

export interface Timer {
  name: string;
  calendarId: string;
}

export interface ActiveTimer {
  name: string;
  startTime: Date;
}

export interface TimerSession {
  name: string;
  calendarId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in minutes
}

export class TimerService {
  private store: Store;
  private googleCalendarService: GoogleCalendarService;
  private activeTimers: Map<string, ActiveTimer> = new Map();
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(store: Store, googleCalendarService: GoogleCalendarService) {
    this.store = store;
    this.googleCalendarService = googleCalendarService;
  }

  initialize(): void {
    // Load active timers from storage
    const savedActiveTimers = this.store.get('activeTimers', {}) as Record<string, string>;
    for (const [name, startTimeString] of Object.entries(savedActiveTimers)) {
      this.activeTimers.set(name, {
        name,
        startTime: new Date(startTimeString)
      });
    }

    // Set up auto-save for active timers
    this.autoSaveInterval = setInterval(() => {
      this.saveActiveTimersToStore();
    }, 30000); // Save every 30 seconds
  }

  cleanup(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.saveActiveTimersToStore();
  }

  private saveActiveTimersToStore(): void {
    const activeTimersData: Record<string, string> = {};
    for (const [name, timer] of this.activeTimers) {
      activeTimersData[name] = timer.startTime.toISOString();
    }
    this.store.set('activeTimers', activeTimersData);
  }

  getAllTimers(): Timer[] {
    return this.store.get('timers', []) as Timer[];
  }

  getActiveTimers(): Record<string, string> {
    const activeTimersData: Record<string, string> = {};
    for (const [name, timer] of this.activeTimers) {
      activeTimersData[name] = timer.startTime.toISOString();
    }
    return activeTimersData;
  }

  addTimer(name: string, calendarId: string): boolean {
    const timers = this.getAllTimers();
    
    // Check if timer already exists
    if (timers.find(t => t.name === name)) {
      throw new Error('Timer with this name already exists');
    }

    const newTimer: Timer = { name, calendarId };
    timers.push(newTimer);
    this.store.set('timers', timers);
    
    return true;
  }

  saveTimer(name: string, calendarId: string): boolean {
    const timers = this.getAllTimers();
    const existingIndex = timers.findIndex(t => t.name === name);
    
    if (existingIndex >= 0) {
      // Update existing timer
      timers[existingIndex] = { name, calendarId };
    } else {
      // Add new timer
      timers.push({ name, calendarId });
    }
    
    this.store.set('timers', timers);
    return true;
  }

  deleteTimer(name: string): boolean {
    const timers = this.getAllTimers();
    const filteredTimers = timers.filter(t => t.name !== name);
    
    if (filteredTimers.length === timers.length) {
      return false; // Timer not found
    }
    
    // Stop timer if it's active
    if (this.activeTimers.has(name)) {
      this.stopTimer(name);
    }
    
    this.store.set('timers', filteredTimers);
    return true;
  }

  async startStopTimer(name: string): Promise<{ action: 'started' | 'stopped', startTime?: Date, duration?: number }> {
    const timers = this.getAllTimers();
    const timer = timers.find(t => t.name === name);
    
    if (!timer) {
      throw new Error('Timer not found');
    }

    if (this.activeTimers.has(name)) {
      // Stop timer
      const duration = await this.stopTimer(name);
      return { action: 'stopped', duration };
    } else {
      // Start timer
      const startTime = new Date();
      this.activeTimers.set(name, { name, startTime });
      this.saveActiveTimersToStore();
      return { action: 'started', startTime };
    }
  }

  private async stopTimer(name: string): Promise<number> {
    const activeTimer = this.activeTimers.get(name);
    if (!activeTimer) {
      throw new Error('Timer is not active');
    }

    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - activeTimer.startTime.getTime()) / 1000 / 60); // duration in minutes
    
    // Remove from active timers
    this.activeTimers.delete(name);
    this.saveActiveTimersToStore();

    // Find the timer configuration
    const timers = this.getAllTimers();
    const timer = timers.find(t => t.name === name);
    
    if (timer && duration > 0) {
      // Create calendar event
      try {
        const event: CalendarEvent = {
          summary: timer.name,
          start: activeTimer.startTime,
          end: endTime,
          calendarId: timer.calendarId
        };
        
        await this.googleCalendarService.createEvent(event);
        
        // Save session history
        this.saveTimerSession({
          name: timer.name,
          calendarId: timer.calendarId,
          startTime: activeTimer.startTime,
          endTime,
          duration
        });
      } catch (error) {
        console.error('Error creating calendar event:', error);
        // Still save the session even if calendar creation fails
        this.saveTimerSession({
          name: timer.name,
          calendarId: timer.calendarId,
          startTime: activeTimer.startTime,
          endTime,
          duration
        });
      }
    }

    return duration;
  }

  private saveTimerSession(session: TimerSession): void {
    const sessions = this.store.get('timerSessions', []) as TimerSession[];
    sessions.push({
      ...session,
      startTime: new Date(session.startTime),
      endTime: session.endTime ? new Date(session.endTime) : undefined
    });
    
    // Keep only last 100 sessions
    if (sessions.length > 100) {
      sessions.splice(0, sessions.length - 100);
    }
    
    this.store.set('timerSessions', sessions);
  }

  getTimerSessions(): TimerSession[] {
    return this.store.get('timerSessions', []) as TimerSession[];
  }

  isTimerActive(name: string): boolean {
    return this.activeTimers.has(name);
  }

  getTimerStartTime(name: string): Date | null {
    const activeTimer = this.activeTimers.get(name);
    return activeTimer ? activeTimer.startTime : null;
  }
}