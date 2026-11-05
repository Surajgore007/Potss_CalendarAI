import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { VankoClient, VankoClientConfig } from './client.js';

export function createVankoMcpServer(config: VankoClientConfig = {}) {
  const client = new VankoClient(config);

  const server = new Server(
    {
      name: 'vanko-calendar-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // 1. Tools List
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_events',
          description:
            'List calendar events with optional filters (e.g. upcoming, this week, hackathons, workshops, deadlines).',
          inputSchema: {
            type: 'object',
            properties: {
              time_filter: {
                type: 'string',
                enum: ['all', 'upcoming', 'past', 'this_week', 'this_month'],
                description: 'Filter events by timeframe relative to today.',
                default: 'upcoming',
              },
              type: {
                type: 'string',
                enum: ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'],
                description: 'Filter events by category.',
              },
              status: {
                type: 'string',
                enum: ['upcoming', 'registered', 'skipped'],
                description: 'Filter events by user status.',
              },
              has_alarm: {
                type: 'boolean',
                description: 'Filter only events that have critical alarms enabled.',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of events to return (default: 20).',
                default: 20,
              },
            },
          },
        },
        {
          name: 'get_event_details',
          description: 'Get full details for a specific calendar event including venue, links, deadlines, and alarms.',
          inputSchema: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'The unique ID of the event to retrieve.',
              },
            },
            required: ['event_id'],
          },
        },
        {
          name: 'check_conflicts',
          description: 'Check for scheduling conflicts or overlapping events on the calendar.',
          inputSchema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Optional specific date (YYYY-MM-DD) to check for conflicts.',
              },
            },
          },
        },
        {
          name: 'get_deadlines',
          description: 'Get pending registration deadlines and submission cutoffs sorted by urgency.',
          inputSchema: {
            type: 'object',
            properties: {
              days_ahead: {
                type: 'number',
                description: 'Lookahead window in days (default: 7).',
                default: 7,
              },
              include_registered: {
                type: 'boolean',
                description: 'Whether to include deadlines that have already been submitted/registered.',
                default: false,
              },
            },
          },
        },
        {
          name: 'add_event',
          description: 'Create a new event or deadline in the user calendar.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the event or deadline.',
              },
              type: {
                type: 'string',
                enum: ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'],
                description: 'Type of event.',
                default: 'other',
              },
              event_start_date: {
                type: 'string',
                description: 'Event start date in YYYY-MM-DD format.',
              },
              event_end_date: {
                type: 'string',
                description: 'Event end date in YYYY-MM-DD format.',
              },
              registration_deadline: {
                type: 'string',
                description: 'Registration or submission deadline in YYYY-MM-DD format.',
              },
              time: {
                type: 'string',
                description: 'Event time (e.g. "10:00 AM", "6:00 PM", or "18:00").',
              },
              mode: {
                type: 'string',
                enum: ['online', 'offline', 'hybrid'],
                description: 'Event format.',
                default: 'online',
              },
              location: {
                type: 'string',
                description: 'Physical location, venue, or online platform URL.',
              },
              registration_link: {
                type: 'string',
                description: 'Official registration form or website URL.',
              },
              has_critical_alarm: {
                type: 'boolean',
                description: 'Whether to enable high-priority critical deadline alarm.',
                default: false,
              },
            },
            required: ['title'],
          },
        },
        {
          name: 'mark_submitted',
          description: 'Mark an event registration or deadline submission as completed (disarms critical alarms).',
          inputSchema: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'The unique ID of the event to mark as submitted.',
              },
            },
            required: ['event_id'],
          },
        },
        {
          name: 'search_events',
          description: 'Search events by keyword across title, location, notes, and tags.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search keyword or phrase.',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  });

  // 2. Tool Execution Handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'list_events': {
          const events = await client.listEvents(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(events, null, 2),
              },
            ],
          };
        }

        case 'get_event_details': {
          const eventId = String(args.event_id || '');
          const event = await client.getEvent(eventId);
          if (!event) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Event not found with ID: ${eventId}` }],
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(event, null, 2) }],
          };
        }

        case 'check_conflicts': {
          const date = args.date ? String(args.date) : undefined;
          const conflicts = await client.checkConflicts(date);
          return {
            content: [{ type: 'text', text: JSON.stringify(conflicts, null, 2) }],
          };
        }

        case 'get_deadlines': {
          const daysAhead = typeof args.days_ahead === 'number' ? args.days_ahead : 7;
          const includeRegistered = Boolean(args.include_registered);
          const deadlines = await client.getDeadlines(daysAhead, includeRegistered);
          return {
            content: [{ type: 'text', text: JSON.stringify(deadlines, null, 2) }],
          };
        }

        case 'add_event': {
          const newEvent = await client.addEvent(args);
          return {
            content: [
              {
                type: 'text',
                text: `Successfully created event "${newEvent.title}" (ID: ${newEvent.id})!\n${JSON.stringify(newEvent, null, 2)}`,
              },
            ],
          };
        }

        case 'mark_submitted': {
          const eventId = String(args.event_id || '');
          const updated = await client.markSubmitted(eventId);
          return {
            content: [
              {
                type: 'text',
                text: `Event "${updated.title}" marked as submitted! Critical alarms disarmed.`,
              },
            ],
          };
        }

        case 'search_events': {
          const query = String(args.query || '');
          const results = await client.searchEvents(query);
          return {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error executing ${name}: ${err?.message || err}` }],
      };
    }
  });

  // 3. Resources List
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'calendar://events/upcoming',
          name: 'Upcoming Events',
          description: 'Live feed of upcoming events scheduled in Vanko Calendar.',
          mimeType: 'application/json',
        },
        {
          uri: 'calendar://events/deadlines',
          name: 'Pending Deadlines',
          description: 'Live feed of pending registration cutoffs in the next 7 days.',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // 4. Resource Readers
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'calendar://events/upcoming') {
      const events = await client.listEvents({ time_filter: 'upcoming' });
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(events, null, 2),
          },
        ],
      };
    }

    if (uri === 'calendar://events/deadlines') {
      const deadlines = await client.getDeadlines(7, false);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(deadlines, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unsupported resource URI: ${uri}`);
  });

  // 5. Prompts List
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'daily_briefing',
          description: 'Generate a morning schedule brief covering today events, deadlines, and conflicts.',
        },
        {
          name: 'deadline_alert',
          description: 'Summarize urgent deadlines closing soon with direct registration links.',
        },
      ],
    };
  });

  // 6. Prompt Generators
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;

    if (name === 'daily_briefing') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Please review my Vanko Calendar schedule for today and this week. Provide a concise, clear briefing including:\n1. Any events or sessions scheduled for today\n2. Any upcoming registration deadlines closing in the next 48 hours\n3. Any schedule conflicts or overlapping sessions\n4. Recommended actions (e.g. submit registration form now, prepare submission).',
            },
          },
        ],
      };
    }

    if (name === 'deadline_alert') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Check all pending deadlines in my Vanko calendar closing in the next 7 days. Highlight any critical alarms, registration links, and recommend priority order.',
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

  return server;
}

