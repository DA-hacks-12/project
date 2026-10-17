import { Temporal } from "temporal-polyfill";

// Two made-up schools, written the way Canvas writes its calendar feed, with
// dates relative to today so the data never goes stale. For tests and demos:
// /mock/state.ics and /mock/college.ics. Everything upcoming falls in this
// calendar week and the next (through Saturday of next week), the span a plan
// covers: the entries are written over two weeks from a Sunday; today's stay
// today, and the rest are spread evenly, in order, over tomorrow through next
// Saturday, so no day is crowded whatever day it is. What was due earlier
// this week is in the feed too, as in Canvas. These schools are demo data, so
// their import brings this week so far in as done (`isMockSchool`).

interface Entry {
  uid: string;
  title: string;
  course: string;
  courseId: number;
  day: number; // days from today, written over two weeks (0 to 13); sets the order
  at?: string; // local "HH:MM"; all-day (due 11:59pm) when missing
  minutes?: number; // calendar events only
  text?: string;
}

/** Due earlier this week: in the feed once it's past. */
export interface Earlier extends Omit<Entry, "day" | "minutes"> {
  weekday: number; // 0 Sunday … 5 Friday
}

export const SCHOOLS: Record<
  string,
  { host: string; name: string; entries: Entry[]; earlier: Earlier[] }
> = {
  state: {
    host: "mockstate.instructure.com",
    name: "Mock State University",
    entries: [
      {
        uid: "event-assignment-101",
        title: "Problem Set 4: Kinematics",
        course: "PHYS 2A",
        courseId: 5101,
        day: 1,
        text: "Solve problems 1-8 from Chapter 3. Show all of your work, including units.\n\nUpload one PDF to Canvas. Late work loses 10% per day.",
      },
      {
        uid: "event-assignment-102",
        title: "Essay 2: Argument Analysis",
        course: "ENGL 1A",
        courseId: 5102,
        day: 4,
        text: "Write a 1,200-1,500 word essay analyzing the argument in one of the assigned readings.\n\nRequirements:\n* MLA format, 12pt font, double spaced\n* At least three scholarly sources\n* A clear thesis in the first paragraph\n\nSubmit as a .docx or PDF. This assignment is worth 15% of your grade.",
      },
      {
        uid: "event-assignment-103",
        title: "Reading Quiz 5",
        course: "PSYC 1",
        courseId: 5103,
        day: 2,
        at: "20:00",
        text: "10 multiple-choice questions on Chapter 6 (Memory). 20 minutes, one attempt. Open once you start.",
      },
      {
        uid: "event-assignment-104",
        title: "Lab Report 3: Projectile Motion",
        course: "PHYS 2A",
        courseId: 5101,
        day: 6,
        text: "Write up the projectile motion lab. Include: purpose, procedure, data table, two graphs, error analysis, and conclusion. 4-6 pages. Submit to Turnitin through Canvas.",
      },
      {
        uid: "event-sub-assignment-201",
        title: "Discussion 6: Reply to Topic",
        course: "PSYC 1",
        courseId: 5103,
        day: 0,
        text: "Post a 200-word response: describe a time your memory failed you and explain it with one concept from Chapter 6.",
      },
      {
        uid: "event-sub-assignment-202",
        title: "Discussion 6: Required Replies (2)",
        course: "PSYC 1",
        courseId: 5103,
        day: 2,
        text: "Reply to two classmates, at least 50 words each.",
      },
      {
        uid: "event-assignment-override-301",
        title: "Midterm Study Guide (Extension)",
        course: "ENGL 1A",
        courseId: 5102,
        day: 3,
      },
      {
        uid: "event-assignment-105",
        title: "Week 8 Check-In",
        course: "PHYS 2A",
        courseId: 5101,
        day: 5,
      },
      {
        uid: "event-assignment-106",
        title: "Problem Set 3",
        course: "PHYS 2A",
        courseId: 5101,
        day: -8, // always before this week
        text: "Already past: never imported.",
      },
      {
        uid: "event-calendar-event-900",
        title: "Office Hours",
        course: "PHYS 2A",
        courseId: 5101,
        day: 1,
        at: "15:00",
        minutes: 60,
      },
      {
        uid: "event-assignment-120",
        title: "Pre-lab Quiz: Enzymes",
        course: "BIOL 11",
        courseId: 5104,
        day: 0,
        at: "21:00",
        text: "Five questions on the enzyme lab procedure. Take it before lab; 10 minutes, two attempts.",
      },
      {
        uid: "event-assignment-121",
        title: "WebAssign 4.3: Related Rates",
        course: "MATH 1A",
        courseId: 5105,
        day: 0,
        text: "20 problems on related rates. Show setup for problems 5, 9 and 14 on paper and upload a photo.",
      },
      {
        uid: "event-assignment-122",
        title: "Read Chapter 9: Cellular Respiration",
        course: "BIOL 11",
        courseId: 5104,
        day: 1,
        text: "Read pages 212-238 and take notes on glycolysis, the Krebs cycle and the electron transport chain. Bring notes to lecture.",
      },
      {
        uid: "event-assignment-123",
        title: "Group Project Proposal",
        course: "BIOL 11",
        courseId: 5104,
        day: 5,
        text: "One page: your research question, methods, and a role for each member. One submission per group.",
      },
      {
        uid: "event-assignment-124",
        title: "Quiz 3: Derivatives",
        course: "MATH 1A",
        courseId: 5105,
        day: 6,
        at: "22:00",
        text: "In-class quiz on Sections 3.1-3.6. No calculators.",
      },
      {
        uid: "event-assignment-125",
        title: "Lab Report 5: Enzyme Activity",
        course: "BIOL 11",
        courseId: 5104,
        day: 9,
        text: "Full lab report on catalase activity at four temperatures.\n\nInclude:\n* Introduction with a hypothesis\n* Methods\n* Results with one graph and one table\n* Discussion of sources of error\n\n5-7 pages, APA citations, submit as PDF.",
      },
      {
        uid: "event-assignment-107",
        title: "Midterm Exam",
        course: "PSYC 1",
        courseId: 5103,
        day: 8,
        at: "18:00",
        text: "In-person midterm covering Chapters 1-7. Bring a #2 pencil and your student ID.",
      },
      {
        uid: "event-assignment-130",
        title: "Problem Set 5: Forces",
        course: "PHYS 2A",
        courseId: 5101,
        day: 10,
        text: "Problems 1-10 from Chapter 4 (Newton's laws). Draw a free-body diagram for every problem.\n\nUpload one PDF to Canvas.",
      },
      {
        uid: "event-sub-assignment-203",
        title: "Discussion 7: Reply to Topic",
        course: "PSYC 1",
        courseId: 5103,
        day: 11,
        text: "Post a 200-word response: which learning principle from Chapter 7 explains a habit you have? Then reply to two classmates.",
      },
      {
        uid: "event-assignment-133",
        title: "Reading Quiz 6",
        course: "PSYC 1",
        courseId: 5103,
        day: 11,
        at: "20:00",
        text: "10 multiple-choice questions on Chapter 7 (Learning). 20 minutes, one attempt.",
      },
      {
        uid: "event-assignment-131",
        title: "WebAssign 5.1: Antiderivatives",
        course: "MATH 1A",
        courseId: 5105,
        day: 12,
        text: "18 problems in WebAssign on antiderivatives and initial value problems. Five tries per problem.",
      },
      {
        uid: "event-assignment-134",
        title: "Read Chapter 10: Photosynthesis",
        course: "BIOL 11",
        courseId: 5104,
        day: 12,
        text: "Read Chapter 10 and answer the 6 guided-reading questions at the end. Submit as a PDF.",
      },
      {
        uid: "event-assignment-132",
        title: "Essay 2: Final Draft",
        course: "ENGL 1A",
        courseId: 5102,
        day: 13,
        text: "Revise your argument analysis using the peer review comments. 1,200-1,500 words, MLA format, with a works cited page. Submit through Turnitin.",
      },
    ],
    earlier: [
      {
        uid: "event-assignment-90",
        title: "Discussion 5: Reply to Topic",
        course: "PSYC 1",
        courseId: 5103,
        weekday: 0,
        text: "Post a 200-word response on one sleep study from Chapter 5.",
      },
      {
        uid: "event-assignment-91",
        title: "WebAssign 4.2: Implicit Differentiation",
        course: "MATH 1A",
        courseId: 5105,
        weekday: 1,
        text: "16 problems on implicit differentiation. Five tries per problem.",
      },
      {
        uid: "event-assignment-92",
        title: "Reading Quiz 4",
        course: "PSYC 1",
        courseId: 5103,
        weekday: 1,
        at: "20:00",
        text: "10 multiple-choice questions on Chapter 5 (Consciousness). 20 minutes, one attempt.",
      },
      {
        uid: "event-assignment-93",
        title: "Lab Report 2: Free Fall",
        course: "PHYS 2A",
        courseId: 5101,
        weekday: 2,
        text: "Write up the free-fall lab: data table, one graph, error analysis and conclusion. 3-5 pages.",
      },
      {
        uid: "event-assignment-94",
        title: "Read Chapter 8: Energy and Enzymes",
        course: "BIOL 11",
        courseId: 5104,
        weekday: 2,
        text: "Read pages 180-204 and take notes.",
      },
      {
        uid: "event-assignment-95",
        title: "Essay 2: Thesis and Outline",
        course: "ENGL 1A",
        courseId: 5102,
        weekday: 3,
        text: "Submit a thesis statement and a one-page outline for Essay 2.",
      },
      {
        uid: "event-sub-assignment-96",
        title: "Discussion 5: Required Replies (2)",
        course: "PSYC 1",
        courseId: 5103,
        weekday: 3,
        text: "Reply to two classmates, at least 50 words each.",
      },
      {
        uid: "event-assignment-97",
        title: "WebAssign 4.1: The Chain Rule",
        course: "MATH 1A",
        courseId: 5105,
        weekday: 4,
        text: "14 problems on the chain rule.",
      },
      {
        uid: "event-assignment-98",
        title: "Pre-lab Quiz: Respiration",
        course: "BIOL 11",
        courseId: 5104,
        weekday: 4,
        at: "21:00",
        text: "Five questions on the respiration lab. 10 minutes.",
      },
      {
        uid: "event-assignment-99",
        title: "Week 7 Check-In",
        course: "PHYS 2A",
        courseId: 5101,
        weekday: 5,
      },
      {
        uid: "event-assignment-100",
        title: "Annotated Sources",
        course: "ENGL 1A",
        courseId: 5102,
        weekday: 5,
        text: "Find three scholarly sources for Essay 2 and write a short annotation for each.",
      },
    ],
  },
  college: {
    host: "canvas.mockcollege.edu",
    name: "Mock Community College",
    entries: [
      {
        // Same id as a Mock State assignment: ids are only unique within one school.
        uid: "event-assignment-101",
        title: "Spanish Homework 7",
        course: "SPAN 2",
        courseId: 77,
        day: 1,
        text: "Complete the workbook pages 84-86 (preterite vs. imperfect). Photograph and upload.",
      },
      {
        uid: "event-assignment-102",
        title: "Vocab Quiz 4",
        course: "SPAN 2",
        courseId: 77,
        day: 3,
        at: "19:30",
        text: "25 vocabulary words from Unidad 4. 15 minutes.",
      },
      {
        uid: "event-assignment-110",
        title: "Portfolio Draft",
        course: "ART 10",
        courseId: 78,
        day: 7,
        text: "Bring 6 finished pieces and an artist statement (300 words) for critique. Upload photos of each piece.",
      },
      {
        uid: "event-assignment-111",
        title: "Sketchbook Week 9",
        course: "ART 10",
        courseId: 78,
        day: 2,
        text: "Ten gesture drawings from life, 2 minutes each.",
      },
      {
        uid: "event-assignment-112",
        title: "Spanish Homework 8",
        course: "SPAN 2",
        courseId: 77,
        day: 10,
        text: "Workbook pages 61-64: the preterite and the imperfect.",
      },
      {
        uid: "event-assignment-113",
        title: "Sketchbook Week 10",
        course: "ART 10",
        courseId: 78,
        day: 12,
        text: "Five gesture drawings and one 30-minute study of a hand.",
      },
    ],
    earlier: [
      {
        uid: "event-assignment-104",
        title: "Spanish Homework 6",
        course: "SPAN 2",
        courseId: 77,
        weekday: 1,
        text: "Workbook pages 78-80 (the preterite). Photograph and upload.",
      },
      {
        uid: "event-assignment-105",
        title: "Sketchbook Week 8",
        course: "ART 10",
        courseId: 78,
        weekday: 3,
        text: "Ten gesture drawings from life, 2 minutes each.",
      },
      {
        uid: "event-assignment-106",
        title: "Vocab Quiz 3",
        course: "SPAN 2",
        courseId: 77,
        weekday: 4,
        at: "19:30",
        text: "25 vocabulary words from Unidad 3. 15 minutes.",
      },
    ],
  },
};

/** The mock schools are demo data: their import brings this week so far in, done. */
export function isMockSchool(host: string): boolean {
  return Object.values(SCHOOLS).some((school) => school.host === host);
}

/** What was due earlier this week, before today (none on a Sunday). */
export function earlierThisWeek(
  school: keyof typeof SCHOOLS,
  today: Temporal.PlainDate,
): Earlier[] {
  return SCHOOLS[school].earlier.filter((e) => e.weekday < today.dayOfWeek % 7);
}

const stamp = (at: Temporal.ZonedDateTime) =>
  `${at.toInstant().toString().replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15)}Z`;

const icsText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/** RFC 5545 folds lines at 75 octets, as Canvas does. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

export function mockFeed(
  school: keyof typeof SCHOOLS,
  today: Temporal.PlainDate,
  tz: string,
): string {
  const { host, name, entries } = SCHOOLS[school];
  // Earlier this week first, as days before today, then what's ahead.
  const past: Entry[] = earlierThisWeek(school, today).map(
    ({ weekday, ...entry }) => ({
      ...entry,
      day: weekday - (today.dayOfWeek % 7),
    }),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:icalendar-ruby",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Mock Student Calendar (${icsText(name)})`,
  ];
  const now = Temporal.Now.zonedDateTimeISO(tz);
  const left = 14 - (today.dayOfWeek % 7); // today through next Saturday
  const later = entries
    .filter((e) => e.day > 0)
    .sort((a, b) => a.day - b.day)
    .map((e) => e.uid);
  for (const entry of [...past, ...entries]) {
    const day =
      entry.day <= 0
        ? entry.day
        : 1 +
          Math.floor((later.indexOf(entry.uid) * (left - 1)) / later.length);
    const date = today.add({ days: day });
    const kind = entry.uid.startsWith("event-calendar-event")
      ? "calendar_event"
      : "assignment";
    const id = entry.uid.split("-").pop();
    lines.push("BEGIN:VEVENT", `DTSTAMP:${stamp(now)}`, `UID:${entry.uid}`);
    if (entry.at) {
      const start = date.toZonedDateTime({
        timeZone: tz,
        plainTime: Temporal.PlainTime.from(entry.at),
      });
      lines.push(
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(start.add({ minutes: entry.minutes ?? 0 }))}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE;VALUE=DATE:${date.toString().replace(/-/g, "")}`,
      );
    }
    lines.push("CLASS:PUBLIC");
    if (entry.text) lines.push(`DESCRIPTION:${icsText(entry.text)}`);
    lines.push(
      "SEQUENCE:0",
      `SUMMARY:${icsText(entry.title)} [${icsText(entry.course)}]`,
      `URL;VALUE=URI:https://${host}/calendar?include_contexts=course_${entry.courseId}&month=${String(date.month).padStart(2, "0")}&year=${date.year}#${kind}_${id}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
