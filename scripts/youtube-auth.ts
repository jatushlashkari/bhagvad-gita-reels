// One-time helper: mints a YouTube OAuth refresh token for the daily workflow.
// Usage: YT_CLIENT_ID=... YT_CLIENT_SECRET=... npm run auth:youtube
import { createServer } from 'node:http';
import { google } from 'googleapis';

const clientId = process.env.YT_CLIENT_ID;
const clientSecret = process.env.YT_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set YT_CLIENT_ID and YT_CLIENT_SECRET first (see SETUP.md step 4).');
  process.exit(1);
}

const server = createServer();
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address === 'string' || !address) throw new Error('no port');
  const redirect = `http://127.0.0.1:${address.port}/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirect);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  console.log('\n1. Open this URL in your browser and approve access:\n');
  console.log(url);
  console.log('\n2. Waiting for Google to redirect back...\n');

  server.on('request', async (req, res) => {
    const u = new URL(req.url ?? '/', redirect);
    if (u.pathname !== '/callback') {
      res.end();
      return;
    }
    const code = u.searchParams.get('code');
    res.setHeader('content-type', 'text/html');
    if (!code) {
      res.end('<h3>No code in callback. Try again.</h3>');
      return;
    }
    try {
      const { tokens } = await oauth2.getToken(code);
      res.end('<h3>Done! Return to the terminal — you can close this tab.</h3>');
      console.log('Refresh token (store as repo secret YT_REFRESH_TOKEN):\n');
      console.log(tokens.refresh_token);
      console.log('\ngh secret set YT_REFRESH_TOKEN --body "<paste the token>"');
    } catch (e) {
      res.end(`<h3>Token exchange failed: ${(e as Error).message}</h3>`);
      console.error(e);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
});
