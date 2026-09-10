# One-time Setup Guide

Work through these steps once (~1 hour). At the end, an hourly publisher posts reels — Instagram, Facebook and YouTube — around 7:00 AM IST every day, with zero involvement from you.

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

## 3b. Facebook Page → Reels token

Reels publishing reuses the Meta app from §3 — no new app needed, just a Facebook Page and one more product enabled on that app.

1. If you don't already have one, create a Facebook Page from your personal Facebook account (any account can create one for free).
2. In the same Meta app from §3 (developers.facebook.com/apps → your app), add the **Facebook Login for Business** product to the app.
3. Open the **Graph API Explorer** (developers.facebook.com/tools/explorer), select your app, and click **Generate Access Token**. When prompted for permissions, grant `pages_manage_posts`, `pages_read_engagement`, and `publish_video`. Copy the resulting (short-lived) user token.
4. Exchange it for a long-lived user token — the app's App ID and App Secret are on the app dashboard's basic settings page:

```bash
curl "https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<app id>&client_secret=<app secret>&fb_exchange_token=<token from step 3>"
```

5. Use that long-lived user token to list the Pages you manage — this single call returns both the Page ID and a Page access token:

```bash
curl "https://graph.facebook.com/v23.0/me/accounts?access_token=<long-lived token from step 4>"
```

Find your Page in the returned list: its `id` field is the Page ID, its `access_token` field is the Page token.

Unlike the Instagram token, a Page token minted this way (from a long-lived user token) does not expire — there's no refresh workflow to maintain for Facebook.

**Secrets produced:** `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`.

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

## 7. Go-live: supervised first run (calendar mode)

`config.json`'s `"mode": "calendar"` is the default, so this is what "go live" means day to day:
`publisher.yml` runs every hour, keeps `config.schedule.daysAhead` days of reels rendered and ready,
and posts each one — Instagram, Facebook, YouTube — at its own scheduled time. `daily-reel` stays
**idle** the whole time (it only runs when `config.json`'s `mode` is `"daily"` — see README's "How
it works") — there is nothing to dispatch on it here.

1. Push everything; check the **ci** workflow is green in the Actions tab.
2. Add every secret §§3-4 produced: `IG_USER_ID`, `IG_ACCESS_TOKEN`, `FB_PAGE_ID`,
   `FB_PAGE_ACCESS_TOKEN`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` — seven in total.
   (`publisher.yml`'s `GH_TOKEN` needs no secret of its own; the workflow gets it for free as
   `github.token`.)
3. `gh workflow list --all` — if `publisher` already shows `active` before your secrets are set,
   run `gh workflow disable publisher` first. Then enable it — it ships disabled like
   `daily-reel`: `gh workflow enable publisher`.
4. Dispatch a dry run first, to watch rows appear without posting anything: Actions tab →
   **publisher** → *Run workflow* → check `dry_run` → Run. When it finishes, `/calendar` (or
   `schedule.json`) should show `config.schedule.daysAhead` rows, each with a thumbnail and
   prefilled captions, every post still `scheduled` — none `published`. `dry_run` only skips
   posting — the auto-filled rows are still archived as real GitHub Releases (by design: the
   rows must be publishable later).
5. Let it run from here — do nothing. `publisher.yml`'s cron checks every hour; as each post's own
   scheduled time arrives, that hour's run publishes it, marks it `failed` with whatever the
   platform's own API returned (a bad or expired credential shows up as that platform's error, not
   as a secret name), or — when a secret is absent entirely rather than merely wrong — marks it
   `skipped` with `missing secrets: ...` in the log.
6. Verify the first row across all three platforms: YouTube Studio shows the Short (public, or
   private if pre-audit — see §4 above), the reel is live on Instagram and on the Facebook Page,
   a release for that row's ref exists with the MP4, and `state.json` records the platform IDs.

Once it's live, the cloud publisher commits `schedule.json`, `state.json` and `public/thumbs/` to
`main` every hour on its own — run `git pull` before editing the calendar locally, and if the
dashboard's Sync is rejected as non-fast-forward, pull first and retry.

**Success gate:** 7 consecutive days, all three platforms, with no manual intervention beyond what
"When something fails" below describes.

A post can come back `skipped` rather than `failed` — most often a run that landed before every
secret above was in place. `skipped` posts are **never retried automatically** (the hourly publisher
only auto-retries `failed` posts, up to 3 attempts) — once the missing secret is fixed, press
**Retry** on `/calendar` for that post, or run
`npx tsx pipeline/publisher.ts --publish-item <id> --platform <platform>` from the CLI.

## When something fails

- GitHub emails you when a run fails. Open the run → download the **reel** artifact → post manually that day if you want.
- Re-running is always safe: in daily mode `state.json` guarantees nothing double-posts and only the missing platform is retried; in calendar mode each post's own status in `schedule.json` is that guard — a `failed` post is retried automatically (up to 3 attempts), a `skipped` one only on a manual Retry (see §7), and a `published` one never again.
- Instagram token refresh failing? Re-do step 3.5 to mint a fresh token, update the `IG_ACCESS_TOKEN` secret.

Prefer a browser over the CLI for step 6? `npm run dashboard` gives you upload/generate/sync from http://localhost:4000 — see README's **Dashboard** section. Want to design the cinema look before flipping `config.json` to it? `/studio` on that same dashboard — see README's **Studio** subsection.
