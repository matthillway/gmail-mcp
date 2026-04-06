# Gmail MCP Server

Local MCP server that lets Claude Code modify Gmail labels (archive, move, file emails).

## Setup
1. Run `bash setup-auth.sh` to create OAuth credentials
2. Add to `~/.claude/settings.json` under mcpServers
3. Restart Claude Code

## Tools
- `gmail_list_labels` — list all labels
- `gmail_modify_labels` — add/remove labels from a message
- `gmail_archive` — remove INBOX label
- `gmail_move` — move to a label (adds label + removes INBOX)

## Credentials
Stored at `~/.gmail-mcp-credentials.json` (client_id, client_secret, refresh_token).
Never committed. chmod 600.

## Stack
Node.js, ES modules, @modelcontextprotocol/sdk, googleapis
