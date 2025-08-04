import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import { app } from 'electron';

export interface Calendar {
  id: string;
  name: string;
  primary?: boolean;
  accessRole: string;
}

export interface CalendarEvent {
  summary: string;
  start: Date;
  end: Date;
  calendarId: string;
}

export class GoogleCalendarService {
  private oauth2Client: any | null = null;
  private readonly credentialsPath: string;
  private readonly tokenPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.credentialsPath = path.join(userDataPath, 'credentials.json');
    this.tokenPath = path.join(userDataPath, 'token.json');
    
    this.initializeOAuth();
  }

  private initializeOAuth(): void {
    let credentials: any;
    
    try {
      // Try to load credentials from the desktop directory first
      const appCredentialsPath = path.join(__dirname, 'credentials.json');
      if (fs.existsSync(appCredentialsPath)) {
        const credentialsContent = fs.readFileSync(appCredentialsPath, 'utf8');
        credentials = JSON.parse(credentialsContent).installed;
      } else if (fs.existsSync(this.credentialsPath)) {
        // Fallback to user data directory
        const credentialsContent = fs.readFileSync(this.credentialsPath, 'utf8');
        credentials = JSON.parse(credentialsContent).installed;
      } else {
        throw new Error('No credentials.json found');
      }
    } catch (error) {
      console.error('Error loading credentials:', error);
      // Fallback to environment variables
      credentials = {
        client_id: process.env.GOOGLE_CLIENT_ID || 'your-client-id',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret',
        redirect_uris: ['http://localhost']
      };
    }

    this.oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      'http://localhost'
    );

    // Load existing token if available
    try {
      if (fs.existsSync(this.tokenPath)) {
        const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        this.oauth2Client.setCredentials(token);
      }
    } catch (error) {
      console.error('Error loading token:', error);
    }
  }

  async authenticate(): Promise<boolean> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      // Check if we already have valid credentials
      if (this.oauth2Client.credentials && this.oauth2Client.credentials.access_token) {
        return true;
      }

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ]
      });

      // Open auth URL in default browser
      require('electron').shell.openExternal(authUrl);

      console.log('Please visit the URL and authorize the application');
      
      // Start a simple HTTP server to capture the auth code
      return new Promise((resolve) => {
        
        const server = http.createServer(async (req: any, res: any) => {
          const queryObject = url.parse(req.url, true).query;
          
          if (queryObject.code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');
            
            try {
              const { tokens } = await this.oauth2Client.getToken(queryObject.code);
              this.oauth2Client.setCredentials(tokens);
              
              // Save tokens to file
              fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
              
              server.close();
              resolve(true);
            } catch (error) {
              console.error('Error getting tokens:', error);
              server.close();
              resolve(false);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authorization failed!</h1><p>No authorization code received.</p>');
            server.close();
            resolve(false);
          }
        });
        
        // Try to find an available port starting from 80
        const tryPort = (port: number) => {
          server.listen(port, () => {
            console.log(`Auth server listening on port ${port}`);
            if (port !== 80) {
              console.log(`Note: Expected http://localhost but using port ${port}`);
              console.log('If authentication fails, the redirect URI mismatch may be the cause');
            }
          }).on('error', (err: any) => {
            if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
              if (port < 8090) {
                tryPort(port + 1);
              } else {
                console.error('Could not find available port for auth server');
                resolve(false);
              }
            } else {
              console.error('Server error:', err);
              resolve(false);
            }
          });
        };
        
        tryPort(80);
        
        // Timeout after 5 minutes
        setTimeout(() => {
          server.close();
          resolve(false);
        }, 300000);
      });
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  async getCalendars(): Promise<Calendar[]> {
    if (!this.oauth2Client || !this.oauth2Client.credentials?.access_token) {
      return [];
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      const response = await calendar.calendarList.list();
      
      return (response.data.items || [])
        .filter(cal => cal.accessRole === 'owner' || cal.accessRole === 'writer')
        .map(cal => ({
          id: cal.id!,
          name: cal.summary!,
          primary: cal.primary || false,
          accessRole: cal.accessRole!
        }));
    } catch (error) {
      console.error('Error fetching calendars:', error);
      return [];
    }
  }

  async createEvent(event: CalendarEvent): Promise<boolean> {
    if (!this.oauth2Client || !this.oauth2Client.credentials?.access_token) {
      throw new Error('Not authenticated');
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      
      await calendar.events.insert({
        calendarId: event.calendarId,
        requestBody: {
          summary: event.summary,
          start: {
            dateTime: event.start.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          end: {
            dateTime: event.end.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        }
      });

      return true;
    } catch (error) {
      console.error('Error creating event:', error);
      return false;
    }
  }

  isAuthenticated(): boolean {
    return !!(this.oauth2Client && this.oauth2Client.credentials?.access_token);
  }
}