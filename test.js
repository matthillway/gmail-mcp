#!/usr/bin/env node

/**
 * Quick test — lists Gmail labels to verify OAuth credentials work
 */

import { google } from "googleapis";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const creds = JSON.parse(
  readFileSync(join(homedir(), ".gmail-mcp-credentials.json"), "utf-8")
);

const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret);
oauth2.setCredentials({ refresh_token: creds.refresh_token });

const gmail = google.gmail({ version: "v1", auth: oauth2 });

const res = await gmail.users.labels.list({ userId: "me" });
console.log("✅ Gmail API working!");
console.log(`Found ${res.data.labels.length} labels:`);
res.data.labels
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((l) => console.log(`  ${l.id.padEnd(25)} ${l.name}`));
