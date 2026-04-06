#!/bin/bash
# Gmail MCP OAuth Setup
# Creates ~/.gmail-mcp-credentials.json with refresh token

set -e

CREDS_FILE="$HOME/.gmail-mcp-credentials.json"
PORT=3456
REDIRECT_URI="http://localhost:$PORT/callback"
SCOPE="https://www.googleapis.com/auth/gmail.modify"

echo "========================================="
echo "  Gmail MCP Server — OAuth Setup"
echo "========================================="
echo ""

# Check if credentials already exist
if [ -f "$CREDS_FILE" ]; then
    echo "⚠️  Credentials already exist at $CREDS_FILE"
    read -p "Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Get client ID and secret
echo "You need OAuth2 credentials from Google Cloud Console."
echo ""
echo "If you don't have them yet:"
echo "  1. Go to https://console.cloud.google.com/apis/credentials"
echo "  2. Create OAuth 2.0 Client ID (type: Desktop app)"
echo "  3. Enable Gmail API at https://console.cloud.google.com/apis/library/gmail.googleapis.com"
echo "  4. Add $REDIRECT_URI to authorized redirect URIs"
echo ""

read -p "Client ID: " CLIENT_ID
read -p "Client Secret: " CLIENT_SECRET

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "Error: Both Client ID and Secret are required."
    exit 1
fi

# Build auth URL
AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent"

echo ""
echo "Opening browser for Google login..."
echo ""

# Create a temporary Node.js server to catch the callback
TEMP_SERVER=$(mktemp /tmp/gmail-mcp-auth-XXXX.js)
cat > "$TEMP_SERVER" << 'SERVEREOF'
import http from 'http';
import { URL } from 'url';

const port = parseInt(process.argv[2]);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>✅ Authorised!</h1><p>You can close this tab and return to the terminal.</p></body></html>');
      console.log(code);
      setTimeout(() => process.exit(0), 500);
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>❌ Error</h1><p>No auth code received.</p></body></html>');
      process.exit(1);
    }
  }
});
server.listen(port, () => {
  // Server ready
});
SERVEREOF

# Start callback server and open browser
AUTH_CODE=$(node --input-type=module "$TEMP_SERVER" $PORT &
SERVER_PID=$!
sleep 1

# Open browser
open "$AUTH_URL" 2>/dev/null || xdg-open "$AUTH_URL" 2>/dev/null || echo "Open this URL manually: $AUTH_URL"

echo "Waiting for Google login callback on port $PORT..."
wait $SERVER_PID)

rm -f "$TEMP_SERVER"

if [ -z "$AUTH_CODE" ]; then
    echo "Error: No auth code received."
    exit 1
fi

echo ""
echo "Auth code received. Exchanging for tokens..."

# Exchange auth code for tokens
TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "code=${AUTH_CODE}" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "grant_type=authorization_code")

# Check for error
ERROR=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
if [ -n "$ERROR" ]; then
    echo "Error: $ERROR"
    echo "$TOKEN_RESPONSE" | python3 -m json.tool 2>/dev/null
    exit 1
fi

# Extract refresh token
REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)

if [ -z "$REFRESH_TOKEN" ]; then
    echo "Error: No refresh token in response. Make sure you used access_type=offline&prompt=consent."
    echo "$TOKEN_RESPONSE" | python3 -m json.tool 2>/dev/null
    exit 1
fi

# Save credentials
cat > "$CREDS_FILE" << CREDEOF
{
  "client_id": "$CLIENT_ID",
  "client_secret": "$CLIENT_SECRET",
  "refresh_token": "$REFRESH_TOKEN"
}
CREDEOF

chmod 600 "$CREDS_FILE"

echo ""
echo "✅ Credentials saved to $CREDS_FILE"
echo ""
echo "To test: node /Users/matt/Projects/gmail-mcp/test.js"
echo "To add to Claude Code: update ~/.claude/settings.json mcpServers"
