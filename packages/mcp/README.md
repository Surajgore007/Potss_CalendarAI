# Vanko Calendar MCP Server (`@eventpulse/mcp-server`)

Connect your **Vanko Calendar** schedule directly to **Claude** (Claude Desktop, Claude Web) and **ChatGPT** using the open [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Chat naturally with your AI assistant about:
- 📅 **Schedule Overview**: *"What do I have planned for this week?"*
- ⏰ **Deadline Warnings**: *"Any hackathon or exam deadlines closing in the next 48 hours?"*
- ⚔️ **Conflict Detection**: *"Do I have any schedule clashes on Friday?"*
- 🔔 **Critical Alarms**: *"Which events have high-priority alarms set?"*
- ➕ **Event Creation**: *"Add a workshop for Web3 & Rust on Saturday from 2 PM to 5 PM"*
- ✅ **Mark as Submitted**: *"I submitted my project for HackPrix, mark it done and stop the alarms."*

---

## 🚀 Quick Setup for Claude Desktop

### 1. Locate Claude Desktop Configuration
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 2. Add the Vanko MCP Server
Add the following configuration under `mcpServers`:

```json
{
  "mcpServers": {
    "vanko-calendar": {
      "command": "node",
      "args": [
        "c:/Users/suraj/Documents/MY_Projects/Calendar/packages/mcp/dist/cli.js"
      ],
      "env": {
        "VANKO_API_URL": "https://vanko-api.vanko-app.workers.dev",
        "VANKO_AUTH_TOKEN": "<YOUR_FIREBASE_ID_TOKEN>"
      }
    }
  }
}
```

> **Note**: To obtain your `VANKO_AUTH_TOKEN`, open Vanko on your phone or web, go to **Settings → Account → Export Data** or copy your Firebase session token.

---

## 🤖 ChatGPT Setup (Custom GPT Actions)

You can connect ChatGPT directly to Vanko with zero local installation using OpenAI Custom GPT Actions!

1. Open **ChatGPT** → **Explore GPTs** → **Create a GPT**.
2. Go to the **Configure** tab.
3. Under **Actions**, click **Create new action**.
4. In the **Schema** box, choose **Import from URL** and paste:
   ```
   https://vanko-api.vanko-app.workers.dev/api/openapi.json
   ```
5. Under **Authentication**:
   - Authentication Type: **API Key** or **Bearer**
   - Header Name: `Authorization`
   - Paste your token.
6. Save and test! You can now chat in ChatGPT about your Vanko calendar schedule in real-time.

---

## 🛠 Available MCP Tools

| Tool | Description | Parameters |
|---|---|---|
| `list_events` | Query upcoming/past events with filters | `time_filter` (`upcoming`, `this_week`, `this_month`), `type`, `status`, `has_alarm`, `limit` |
| `get_event_details` | Retrieve full event details | `event_id` |
| `check_conflicts` | Detect overlapping events & date collisions | `date` (optional YYYY-MM-DD) |
| `get_deadlines` | Ranked registration deadlines by urgency | `days_ahead` (default 7), `include_registered` |
| `add_event` | Create new event/deadline with critical alarm | `title`, `event_start_date`, `time`, `mode`, `location`, `has_critical_alarm`, etc. |
| `mark_submitted` | Disarm alarms and mark registration submitted | `event_id` |
| `search_events` | Text search across titles, tags, and venues | `query` |

---

## 📚 Resources & Prompts

- **Resource `calendar://events/upcoming`**: Live JSON stream of upcoming events.
- **Resource `calendar://events/deadlines`**: Live JSON stream of pending registration deadlines.
- **Prompt `daily_briefing`**: Morning summary of today's schedule, cutoffs, and clashes.
- **Prompt `deadline_alert`**: Urgent lookahead of deadlines closing in 7 days.

