# Pedantic - Day planner for Canvas

A biology & psychology-backed college coursework planner. It learns your sleep rhythm, puts hard work in peak hours, replans guilt-free, locks out distractions, and restores attention outdoors.

Team: Joshua Leonora, Jonathan Bruennert, Atticus Xu


Problem: Canvas has a built in calendar that contains assignment deadlines. The task of creating a schedule around those deadlines, however, still falls on the user, which can be difficult or stressful for students with loaded schedules. Moreover, even after students go through the effort of planning out their day, constant distractions like social media and video platforms hinder productivity and often make those schedules invalid, while physical and mental wellness is neglected as most consider it an afterthought.

Solution: This project aims to solve these problems by dynamically creating a schedule for you based around your assignment deadlines, classes, personal body clock, and study habits. To ensure your wellness, the planner can automatically insert nature breaks in between your tasks, providing you with a map to a nearby park or trail. It can also quickly rearrange your schedule upon request, adapting to the situation, so unexpected circumstances like a family emergency or sick day won't leave you feeling short on time. When you want to work without distraction, the built in focus mode can block distracting sites while providing you with a pomodoro timer to help you pace your studying.


## The science behind it

Every rule the planner follows comes from research on sleep, attention and memory. A language model proposes the plan, and code checks it against these rules, so the plan can't quietly break them.

### Your body clock

We model how alert you are, hour by hour, with the Three-Process Model of Alertness (Åkerstedt & Folkard, 1997):

$$A(t) = \underbrace{S_{\min} + (S_{\text{rested}} - S_{\min})\,e^{-0.035\,t}}_{\text{sleep pressure}} + \underbrace{2.5\cos\!\Big(\tfrac{2\pi}{24}(h-\varphi)\Big)}_{\text{24-hour rhythm}} - \underbrace{5.7\,e^{-1.5\,t}}_{\text{grogginess}}$$

Here $t$ is hours since you woke up, $h$ is the hour of the day, and $\varphi$ is the hour your rhythm peaks. Sleep pressure builds through the day, the 24-hour rhythm rises toward late afternoon, and grogginess fades in the first hour after waking. Your sharpest hours are the ones within 5% of the day's peak.

The Chrome extension finds when you sleep from the longest gap in your browsing each night. Your chronotype comes from the middle of your sleep on weekends, the way the Munich Chronotype Questionnaire measures it (Roenneberg et al., 2003): before 3:30am you're an early type, after 5am a late type. A late type's peak moves later in the day, and so does their hard work.

### How the plan follows the research

| Principle | What the research found | What the planner does |
|---|---|---|
| Synchrony effect | People think best at their own peak time of day (May, Hasher & Stoltzfus, 1993; Schmidt et al., 2007) | Deep work goes in your sharpest hours, light work in the rest |
| Spacing | Studying over several days sticks better than the same hours in one push (Cepeda et al., 2006) | Work over 90 minutes is split across the days before it's due |
| Interleaving | Mixing subjects and problem types improves learning (Rohrer & Taylor, 2007; Kornell & Bjork, 2008) | The next session is usually another course, and never three in a row on one task |
| Breaks | Attention wears down over long stretches, and short breaks restore it (Ariga & Lleras, 2011) | At least 10 minutes between sessions, and no stretch over 90 minutes without a 30-minute break |
| Limits of deep work | Even experts sustain about four hours of deliberate practice a day (Ericsson, Krampe & Tesch-Römer, 1993) | At most 4 hours of deep work a day |
| Planning fallacy | People underestimate how long their work will take (Buehler, Griffin & Ross, 1994) | A third of each day stays free |
| Attention restoration | Time in nature restores the attention that focused work drains (Kaplan, 1995; Berman, Jonides & Kaplan, 2008) | One walk a day to a real park nearby, before sunset |
| Naps | A 10-minute nap refreshes without grogginess (Brooks & Lack, 2006), and a late nap makes falling asleep harder (Borbély, 1982) | Naps are 10–20 minutes, and never within 7 hours of your usual bedtime |

### Measured, not just claimed

On a test student with a late body clock and two mock schools:

- Deep work averaged 97/100 alertness, against 82 for light work.
- Every long assignment was spread over two or more days.
- 24 of 27 back-to-back sessions switched courses (13 of 24 did before interleaving).
- No stretch of work ran over 90 minutes (8 of 13 did before pacing).

## Setup

<u>For Judging and demo:</u>

We already have an instance up and running if you want to test the program without setting up a local version yourself.

Go to https://dahacksproj.vercel.app/login

This project includes a dummy user authentication system so you can use your own calendars without conflicting with us or other testers. Enter an email (doesn't have to be a real one) and use the passphrase `aa124a3` (same for all accounts). Sample calendars and a sample class schedule are included below.



<u>To run the project yourself:</u>

You need [Bun](https://bun.sh), [Supabase CLI](https://supabase.com/docs/guides/local-development), a Docker runtime (OrbStack or Docker Desktop), and an Anthropic API key.

1. Install packages: `bun install`
2. Start local Supabase (ports API 54421, DB 54422, Studio 54423): `supabase start`. It applies `supabase/migrations/`.
3. Copy `.env.example` to `.env.development.local` and fill in the values. The URL, publishable key and secret key come from `supabase status`; the Anthropic key is yours, and the OpenRouter key (optional) makes Reschedule → Week take seconds.
4. Run the app: `bun run dev`, then open http://localhost:3000. Sign-in is an email and nothing more: any email gets its own planner. Fine for demos, not for real students.

After a schema change: `supabase db reset` (wipes local data), then `bun run db:types`.

## Chrome extension (optional)

The Chrome extension uses your browser history to calculate your sleep schedule and is what enables the site block feature. During a study session, a distracting site turns into your session's focus page, even with the app closed.

Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick the `extension/` folder. Reload the app. Options then shows the extension as connected and your body clock learned from your browser; turn on Lockdown in Options, under Focus.

## Sample calendar

Go to `Options > Canvas`, paste in a link and click "Add":

- https://dahacksproj.vercel.app/mock/state.ics (Mock State University)
- https://dahacksproj.vercel.app/mock/college.ics (Mock Community College)

For a class schedule, download https://dahacksproj.vercel.app/mock/schedule.png and upload it under `Options > Classes`.

## Usage

> The app will ask for your location as part of the park/trail feature. You can also type a place under `Options > Location`.

### <u>Options</u>

<b>Classes</b><br>
Upload a screenshot or PDF of your class schedule, and your study sessions stay clear of class


<b>Location</b><br>
Where your walks start from: use your location, or type a place


<b>Body clock</b><br>
Here you can view/adjust your body clock


<b>Preferences</b><br>
Adjust scheduling preferences


<b>Focus</b><br>
Adjust your pomodoro timer here. The `lockdown` toggle enables site blocking for distracting sites when the extension is installed


<b>Account</b><br>
The currently connected email

### <u>Reschedule</u>

Adjusts your schedule according to your prompt. Try "I'm sick today and can't work as much" or "I have a meeting from 5-6"

## References

- Åkerstedt, T., & Folkard, S. (1997). The three-process model of alertness and its extension to performance, sleep latency, and sleep length. *Chronobiology International, 14*(2), 115–123.
- Ariga, A., & Lleras, A. (2011). Brief and rare mental "breaks" keep you focused: Deactivation and reactivation of task goals preempt vigilance decrements. *Cognition, 118*(3), 439–443.
- Berman, M. G., Jonides, J., & Kaplan, S. (2008). The cognitive benefits of interacting with nature. *Psychological Science, 19*(12), 1207–1212.
- Borbély, A. A. (1982). A two process model of sleep regulation. *Human Neurobiology, 1*(3), 195–204.
- Brooks, A., & Lack, L. (2006). A brief afternoon nap following nocturnal sleep restriction: Which nap duration is most recuperative? *Sleep, 29*(6), 831–840.
- Buehler, R., Griffin, D., & Ross, M. (1994). Exploring the "planning fallacy": Why people underestimate their task completion times. *Journal of Personality and Social Psychology, 67*(3), 366–381.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354–380.
- Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. *Psychological Review, 100*(3), 363–406.
- Kaplan, S. (1995). The restorative benefits of nature: Toward an integrative framework. *Journal of Environmental Psychology, 15*(3), 169–182.
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science, 19*(6), 585–592.
- May, C. P., Hasher, L., & Stoltzfus, E. R. (1993). Optimal time of day and the magnitude of age differences in memory. *Psychological Science, 4*(5), 326–330.
- Roenneberg, T., Wirz-Justice, A., & Merrow, M. (2003). Life between clocks: Daily temporal patterns of human chronotypes. *Journal of Biological Rhythms, 18*(1), 80–90.
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science, 35*(6), 481–498.
- Schmidt, C., Collette, F., Cajochen, C., & Peigneux, P. (2007). A time to think: Circadian rhythms in human cognition. *Cognitive Neuropsychology, 24*(7), 755–789.
