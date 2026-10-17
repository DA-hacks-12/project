# Day planner for Canvas

Team: Joshua Leonora, Jonathan Bruennert, Atticus Xu


Problem: Canvas has a built in calendar that contains assignment deadlines. The task of creating a schedule around those deadlines, however, still falls on the user, which can be difficult or stressful for students with loaded schedules. Moreover, even after students go through the effort of planning out their day, constant distractions like social media and video platforms hinder productivity and often make those shedules invalid, while physical and mental wellness is neglected as most consider it an afterthought.

Solution: This project aims to solve these problems by dynamically creating a shedule for you based around your assignment deadlines, personal body clock, and study habits. To ensure your wellness, the planner can automatically insert nature breaks in between your tasks, providing you with a map to a nearby park or trail. It can also quickly rearrange your shedule upon request, adapting to the situation, so unexpected circumstances like a family emergency or sick day won't leave you feeling short on time. When you want to work without distraction, the built in focus mode can block distracting sites while providing you with a promodoro timer to help you pace your studying.


## Setup

<u>For Judging and demo:</u>

We already have an instance up and running if you want to test the program without setting up a local version yourself.

Go to https://dahacksproj.vercel.app/login

This project includes a dummy user authentication system so you can use your own calendars without conflicting with us or other testers. Enter an email (doesn't have to be a real one) and use the password `aa124a3` (same for all accounts). Sample calendar is included below.



<u>To run the project yourself:</u>

You need [Bun](https://bun.sh), [Supabase CLI](https://supabase.com/docs/guides/local-development), a Docker runtime (OrbStack or Docker Desktop), and an Anthropic API key.

1. Install packages: `bun install`
2. Start local Supabase (ports API 54421, DB 54422, Studio 54423): `supabase start`. It applies `supabase/migrations/`.
3. Copy `.env.example` to `.env.development.local` and fill in the values. The URL, publishable key and secret key come from `supabase status`; the Anthropic key is yours, and the OpenRouter key (optional) makes Reschedule → Week take seconds.
4. Run the app: `bun run dev`, then open http://localhost:3000. Sign-in is an email and nothing more: any email gets its own planner. Fine for demos, not for real students.

After a schema change: `supabase db reset` (wipes local data), then `bun run db:types`.

## Chrome extension (optional)

The chrome extension uses your browser history to calculate your sleed schedule and is what enables the site block feature.

Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick the `extension/` folder. Reload the app. Options then shows the extension as connected and your body clock learned from your browser; turn on Lockdown in Options, under Focus.

## Sample calendar

Go to `Options > canvas`, paste in the link and click "add" 

- http://dahacksproj.vercel.app/mock/college.ics 

## Usage

> The app will ask for your location as part of the park/trail feature.

### <u>Options</u>

<b>Body clock</b><br>
Here you can view/adjust your body clock


<b>Preferences</b><br>
Adjust scheduling preferences


<b>Focus</b><br>
Adjust your promodoro timer here. The `lockdown` toggle enables site blocking for distracting sites when the extension is installed


<b>Account</b><br>
The currently connected email

### <u>Reschedule</u>

Adjusts your shedule according to your prompt. Try "I'm sick today and can't work as much" or "I have a meeting from 5-6"




