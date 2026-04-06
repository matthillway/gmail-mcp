#!/usr/bin/env node

/**
 * Gmail MCP Server — Label modification tools for Claude Code
 * Reads OAuth credentials from ~/.gmail-mcp-credentials.json
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

const CREDENTIALS_PATH = join(homedir(), ".gmail-mcp-credentials.json");

function loadCredentials() {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Cannot read ${CREDENTIALS_PATH}. Run setup-auth.sh first.`
    );
  }
}

function getGmailClient() {
  const creds = loadCredentials();
  const oauth2 = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret
  );
  oauth2.setCredentials({ refresh_token: creds.refresh_token });
  return google.gmail({ version: "v1", auth: oauth2 });
}

const server = new McpServer({
  name: "gmail-modify",
  version: "1.0.0",
});

// Tool: List all labels
server.tool(
  "gmail_list_labels",
  "List all Gmail labels with their IDs and names",
  {},
  async () => {
    const gmail = getGmailClient();
    const res = await gmail.users.labels.list({ userId: "me" });
    const labels = (res.data.labels || [])
      .map((l) => ({ id: l.id, name: l.name, type: l.type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(labels, null, 2),
        },
      ],
    };
  }
);

// Tool: Modify labels on a message
server.tool(
  "gmail_modify_labels",
  "Add and/or remove labels from a Gmail message",
  {
    messageId: z.string().describe("Gmail message ID"),
    addLabelIds: z
      .array(z.string())
      .optional()
      .describe("Label IDs to add"),
    removeLabelIds: z
      .array(z.string())
      .optional()
      .describe("Label IDs to remove"),
  },
  async ({ messageId, addLabelIds, removeLabelIds }) => {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || [],
      },
    });
    return {
      content: [
        {
          type: "text",
          text: `Modified message ${messageId}. Labels now: ${(res.data.labelIds || []).join(", ")}`,
        },
      ],
    };
  }
);

// Tool: Archive a message (remove INBOX label)
server.tool(
  "gmail_archive",
  "Archive a Gmail message (removes INBOX label)",
  {
    messageId: z.string().describe("Gmail message ID"),
  },
  async ({ messageId }) => {
    const gmail = getGmailClient();
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });
    return {
      content: [
        {
          type: "text",
          text: `Archived message ${messageId} (removed from INBOX)`,
        },
      ],
    };
  }
);

// Tool: Move a message to a label
server.tool(
  "gmail_move",
  "Move a Gmail message to a label (adds label + removes INBOX)",
  {
    messageId: z.string().describe("Gmail message ID"),
    labelName: z
      .string()
      .describe("Label name to move to (will find the label ID automatically)"),
  },
  async ({ messageId, labelName }) => {
    const gmail = getGmailClient();

    // Find label ID by name
    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    const label = (labelsRes.data.labels || []).find(
      (l) => l.name.toLowerCase() === labelName.toLowerCase()
    );

    if (!label) {
      return {
        content: [
          {
            type: "text",
            text: `Label "${labelName}" not found. Use gmail_list_labels to see available labels.`,
          },
        ],
      };
    }

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: [label.id],
        removeLabelIds: ["INBOX"],
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Moved message ${messageId} to "${label.name}" (${label.id}) and removed from INBOX`,
        },
      ],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
