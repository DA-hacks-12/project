import { Temporal } from "temporal-polyfill";

// Two made-up schools, written the way Canvas writes its calendar feed, with
// dates relative to today so the data never goes stale. For tests and demos:
// /mock/state.ics and /mock/college.ics.

interface Entry {
  uid: string;
  title: string;
  course: string;
  courseId: number;
  day: number; // days from today
  at?: string; // local "HH:MM"; all-day (due 11:59pm) when missing
  minutes?: number; // calendar events only
  text?: string;
}

export const SCHOOLS: Record<
  string,
  { host: string; name: string; entries: Entry[] }
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
        at: "10:00",
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
        day: -3,
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
        at: "13:00",
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
        at: "09:30",
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
    ],
  },
};

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
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:icalendar-ruby",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Mock Student Calendar (${icsText(name)})`,
  ];
  const now = Temporal.Now.zonedDateTimeISO(tz);
  for (const entry of entries) {
    const date = today.add({ days: entry.day });
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
