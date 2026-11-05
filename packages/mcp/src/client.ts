import { VankoEvent, VankoFilterParams, ConflictResult } from './types.js';

export interface VankoClientConfig {
  apiUrl?: string;
  authToken?: string;
  userId?: string;
}

export class VankoClient {
  private apiUrl: string;
  private authToken?: string;
  private userId?: string;

  constructor(config: VankoClientConfig = {}) {
    this.apiUrl = (config.apiUrl || process.env.VANKO_API_URL || 'https://vanko-api.vanko-app.workers.dev').replace(/\/$/, '');
    this.authToken = config.authToken || process.env.VANKO_AUTH_TOKEN;
    this.userId = config.userId || process.env.VANKO_USER_ID;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Vanko-MCP-Server/1.0.0',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * List calendar events with flexible filtering
   */
  async listEvents(params: VankoFilterParams = {}): Promise<VankoEvent[]> {
    const query = new URLSearchParams();
    if (params.time_filter) query.set('time_filter', params.time_filter);
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    if (params.has_alarm !== undefined) query.set('has_alarm', String(params.has_alarm));
    if (params.limit) query.set('limit', String(params.limit));

    const url = `${this.apiUrl}/api/mcp/events?${query.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to list events (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { events: VankoEvent[] };
    return data.events || [];
  }

  /**
   * Get a single event by ID or query by title
   */
  async getEvent(eventId: string): Promise<VankoEvent | null> {
    const url = `${this.apiUrl}/api/mcp/events/${encodeURIComponent(eventId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to get event (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { event: VankoEvent };
    return data.event || null;
  }

  /**
   * Search events by keyword matching
   */
  async searchEvents(query: string): Promise<VankoEvent[]> {
    const url = `${this.apiUrl}/api/mcp/events/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to search events (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { results: VankoEvent[] };
    return data.results || [];
  }

  /**
   * Detect clashes and overlapping events
   */
  async checkConflicts(date?: string): Promise<ConflictResult> {
    const url = date
      ? `${this.apiUrl}/api/mcp/conflicts?date=${encodeURIComponent(date)}`
      : `${this.apiUrl}/api/mcp/conflicts`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to check conflicts (${res.status}): ${err}`);
    }

    return (await res.json()) as ConflictResult;
  }

  /**
   * Get pending registration deadlines sorted by urgency
   */
  async getDeadlines(daysAhead = 7, includeRegistered = false): Promise<VankoEvent[]> {
    const url = `${this.apiUrl}/api/mcp/deadlines?days=${daysAhead}&include_registered=${includeRegistered}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to get deadlines (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { deadlines: VankoEvent[] };
    return data.deadlines || [];
  }

  /**
   * Add a new event to the user's calendar
   */
  async addEvent(eventData: Partial<VankoEvent>): Promise<VankoEvent> {
    const url = `${this.apiUrl}/api/mcp/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(eventData),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to add event (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { event: VankoEvent };
    return data.event;
  }

  /**
   * Mark event as submitted/registered (disarms critical alarms)
   */
  async markSubmitted(eventId: string): Promise<VankoEvent> {
    const url = `${this.apiUrl}/api/mcp/events/${encodeURIComponent(eventId)}/submit`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to mark event submitted (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { event: VankoEvent };
    return data.event;
  }
}

