# One-time Setup Guide

Work through these steps once (~1 hour). At the end, the system posts a reel every morning at 7:00 AM IST with zero involvement from you.

Each step ends with the **repo secret(s)** it produces. Add secrets with:
`gh secret set NAME --body "value"` — or on github.com → your repo → Settings → Secrets and variables → Actions → New repository secret.

## 0. Prerequisites on your Mac

```bash
brew install gh          # GitHub CLI (if not installed)
gh auth login            # log in to your GitHub account
pipx install edge-tts    # only needed for local test renders (brew install pipx first if needed)
```

## 1. Create the GitHub repository (public)

Public = unlimited free Actions minutes + public release URLs that Instagram can fetch.

```bash
cd /Users/jatush/bhagvad-gita-reels-v1
gh repo create bhagvad-gita-reels --public --source=. --push
```

Also set your real Instagram/YouTube handle in `config.json` (`"handle": "@yourhandle"`), commit, and push.

**Secrets produced:** none yet.

## 2. Instagram: switch to a Professional account

On your phone: Instagram → Profile → ☰ → Settings and privacy → Account type and tools → **Switch to professional account** → choose **Creator**. Free, takes 2 minutes. (Business type also works.)

## 3. Meta developer app → Instagram token

1. Go to https://developers.facebook.com/apps → **Create App**.
2. Use case: select **"Instagram"** (shown as *Instagram API with Instagram Login*). Business portfolio: not required for your own account.
3. In the app dashboard → **Instagram** → **API setup with Instagram login**.
4. Under *Generate access tokens*, click **Add account** and log in with YOUR Instagram professional account, approving the requested permissions (must include `instagram_business_basic` and `instagram_business_content_publish`).
5. Click **Generate token** next to the connected account, copy the long-lived token (valid 60 days; our weekly workflow keeps it fresh forever).
6. On the same page, note the **Instagram user ID** shown for the connected account (a long number).

**Secrets produced:** `IG_USER_ID`, `IG_ACCESS_TOKEN`.

## 4. Google Cloud → YouTube refresh token

1. https://console.cloud.google.com → New project (name: `gita-reels`).
2. **APIs & Services → Library** → search *YouTube Data API v3* → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External** → create.
   - Fill app name + your email; add your own Google account as a **test user**.
   - Then on the consent screen page press **Publish app** (status: *In production*). You'll see an "unverified app" warning during your own consent — that's expected and fine for personal use.
4. **APIs & Services → Credentials** → Create credentials → **OAuth client ID** → Application type **Desktop app**. Copy client ID + secret.
5. Mint the refresh token locally:

```bash
YT_CLIENT_ID='<id>' YT_CLIENT_SECRET='<secret>' npm run auth:youtube
# opens a Google consent URL — approve with the YouTube channel's account
```

**Secrets produced:** `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

⚠️ **Known caveat:** until Google audits the project, some API uploads may be locked private. Submit the free audit form early (https://support.google.com/youtube/contact/yt_api_form — choose *Audit and quota extension*). If early Shorts land as private, tap "make public" in YouTube Studio that day; this resolves once the audit clears (typically 1-2 weeks).

## 5. Personal access token (for the weekly Instagram token refresh)

The refresh workflow needs permission to write the new token back into repo secrets.

github.com → Settings (your account) → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token → scope: **repo** → generate.

**Secret produced:** `GH_PAT`.

## 6. Verify everything locally (optional but recommended)

```bash
npm run assets                                   # downloads + normalizes backgrounds/music
npm run generate -- --verse gita:2:47 --dry-run  # renders out/reel.mp4, posts nothing
open out/reel.mp4
```

## 7. Supervised first run

1. Push everything; check the **ci** workflow is green in the Actions tab.
2. Actions tab → **daily-reel** → *Run workflow* → set verse `gita:1:1` → Run.
3. Verify:
   - YouTube Studio shows the Short (public, or private if pre-audit — see step 4),
   - the reel is live on Instagram,
   - a release `reel-gita-1-1` exists with the MP4,
   - `state.json` on main now records both platform IDs.
4. Do nothing tomorrow — at 7:00 AM IST the schedule posts `gita:1:2` by itself.

**Success gate:** 7 consecutive automatic days on both platforms.

## When something fails

- GitHub emails you when a run fails. Open the run → download the **reel** artifact → post manually that day if you want.
- Re-running a failed run is always safe: `state.json` guarantees nothing double-posts; only the missing platform is retried.
- Instagram token refresh failing? Re-do step 3.5 to mint a fresh token, update the `IG_ACCESS_TOKEN` secret.

Prefer a browser over the CLI for step 6? `npm run dashboard` gives you upload/generate/sync from http://localhost:4000 — see README's **Dashboard** section. Want to design the cinema look before flipping `config.json` to it? `/studio` on that same dashboard — see README's **Studio** subsection.
