# Day planner for Canvas

A day planner for college students on Canvas. It turns their assignments into a plan that fits their body clock, then helps them focus through it. Not a todo app, a chatbot, or a Canvas replacement. Laptop browser.

Import a school's Canvas calendar feed, get a week plan that fits your body clock and preferences, reschedule when something goes wrong (with a line of advice), take one walk a day to a real park nearby, and work through each session in focus mode. An optional Chrome extension learns your sleep times from browser history and, with Lockdown on, keeps distracting sites closed during sessions and focus mode. The full spec and vocabulary are in `CLAUDE.md`.

## Setup

You need [Bun](https://bun.sh), [Supabase CLI](https://supabase.com/docs/guides/local-development), a Docker runtime (OrbStack or Docker Desktop), and an Anthropic API key.

1. Install packages: `bun install`
2. Start local Supabase (ports API 54421, DB 54422, Studio 54423): `supabase start`. It applies `supabase/migrations/`.
3. Copy `.env.example` to `.env.development.local` and fill in the four values. The URL, publishable key and secret key come from `supabase status`; the Anthropic key is yours.
4. Run the app: `bun run dev`, then open http://localhost:3000. Sign-in is an email and nothing more: any email gets its own planner. Fine for demos, not for real students.

After a schema change: `supabase db reset` (wipes local data), then `bun run db:types`.

## Try it with the mock schools

Paste either link into Options, under Canvas:

- http://localhost:3000/mock/state.ics (Mock State University, 17 entries)
- http://localhost:3000/mock/college.ics (Mock Community College, 4 entries)

Dates are relative to today, squeezed into this calendar week. `?at=HH:MM` on any page pins "now". The first Reschedule asks the browser for your location, to find parks for the walks.

## Chrome extension (optional)

Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick the `extension/` folder. Reload the app. Options then shows the extension as connected and your body clock learned from your browser; turn on Lockdown in Options, under Focus.

## Checks

    bun run lint && bun run typecheck && bun run test && bun run build

With Supabase and the dev server running:

- `bun run e2e` plays real visitors against the mock schools (about a cent of Claude Haiku per run).
- `bun scripts/e2e-ui.ts` drives Chrome through every screen and saves screenshots to `.e2e-ui/`. It needs Chrome installed.

## Deploying

Not set up yet. When it is:

- Set the four environment variables from `.env.example` on the host (Vercel), pointing at a hosted Supabase project with the migrations applied.
- Add the deployed address to the content script `matches` in `extension/manifest.json` (it only lists localhost:3000 and 127.0.0.1:3000), then reload the extension.
- Sign-in by email alone means anyone can open anyone's planner; put real authentication in before real students use it.
