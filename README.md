# ZMCP - Obsidian MCP Server

## What it does

ZMCP turns your Obsidian vault into an AI-accessible workspace. It creates a bridge between your notes and AI assistants like Claude, allowing them to read, write, and manage your knowledge base directly.

Think of it as giving AI tools permission to work with your notes - they can search through your documentation, create new notes, update existing ones, and help manage tasks across your entire vault.

## Tools & Capabilities

### Note Operations

- **Browse & Search**: AI can find and read any note in your vault instantly
- **Create & Edit**: Generate new notes or update existing ones based on your requests
- **Organize**: Manage tags, find related content, and maintain consistency across notes

<details>
<summary><h3>Task Management</h3></summary>

- **Smart Task Queries**: Find tasks by status, priority, due dates, or tags
- **Create with Dates**: Add tasks with due dates, scheduled dates, and recurrence patterns
- **Status Updates**: Mark tasks complete, change priorities, or update any task properties
- **Context-Aware**: AI understands where tasks belong in your notes and maintains your formatting
</details>

### Plugin Intelligence

- **Vault Awareness**: AI can see what Obsidian plugins you have installed
- **Workflow Integration**: Works alongside your existing Obsidian setup without disruption

## Prompts & Resources

The real power comes from turning your notes into reusable AI instructions:

### Dynamic Prompts & Commands

Configure which folders or tags the server monitors for prompts - any note in those locations becomes an AI instruction template. Access them instantly with `/` in Claude or Cursor. Edit the note in Obsidian, and AI assistants see the changes immediately. Create templates with `{{placeholders}}` that AI fills dynamically, perfect for standardized workflows like bug reports, meeting notes, or code reviews.

### Resources

Keep coding standards, writing guidelines, or project requirements in your vault. Reference them with `@` in Claude Code or Cursor to give AI instant context. AI assistants will follow these rules consistently across all interactions. No more copy-pasting instructions or explaining context repeatedly.

### Real-time Sync

Changes to prompts and resources sync instantly. Edit your guidelines while AI is working, and it adapts on the fly. Your knowledge base becomes a living instruction set that evolves with your projects.

## Installation

### Plugin Installation

Install using [BRAT](https://tfthacker.com/BRAT) (Beta Reviewers Auto-update Tool), which lets you install Obsidian plugins directly from GitHub:

1. Search for "BRAT" in Obsidian's Community Plugins and install it
2. In BRAT settings, click "Add Beta Plugin"
3. Enter: `https://github.com/lrangell/zmcp`
4. Enable ZMCP in your Community Plugins list
5. Configure your prompt folders and tags in the plugin settings

### Client Configuration

#### Claude Code
```bash
claude mcp add zmcp -t http http://localhost:3983/mcp
```

#### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "zmcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3983/mcp"
      ]
    }
  }
}
```

#### Cursor

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=zmcp&config=eyJ0cmFuc3BvcnQiOiJodHRwIiwidXJsIjoiaHR0cDovL2xvY2FsaG9zdDozOTgzL21jcCJ9)

Or manually add to Cursor settings:
```json
{
  "mcp": {
    "servers": {
      "zmcp": {
        "transport": "http",
        "url": "http://localhost:3983/mcp"
      }
    }
  }
}
```

## Implementation

Built on top of [ts-mcp-forge](https://github.com/lrangell/ts-mcp-forge), a TypeScript framework for creating MCP servers with decorators. The plugin runs an HTTP server inside Obsidian's Electron environment, exposing vault operations as MCP tools and notes as resources. Uses Obsidian's Vault API for all file operations, ensuring compatibility with sync and other plugins.
