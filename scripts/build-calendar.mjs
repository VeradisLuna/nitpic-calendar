import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ical from "ical-generator";
import { DateTime } from "luxon";

const source = "calendar.txt";
const zone = "Europe/London";
const events = parseEvents(readFileSync(source, "utf8"));

const calendar = ical({
  name: "NITPIC community calendar",
  prodId: {
    company: "NITPIC",
    product: "Community calendar",
    language: "EN"
  }
});

// Keep timestamps stable between builds when calendar.txt is unchanged.
const modified = new Date(
  execFileSync(
    "git",
    ["log", "-1", "--format=%cI", "--", source],
    { encoding: "utf8" }
  ).trim()
);

if (Number.isNaN(modified.getTime())) {
  throw new Error("Could not determine calendar.txt's Git timestamp.");
}

const seenIds = new Set();

for (const event of events) {
  if (!event.id || !/^[a-zA-Z0-9._-]+$/.test(event.id)) {
    throw new Error(
      `Event on line ${event.line} needs a simple, permanent id.`
    );
  }

  if (seenIds.has(event.id)) {
    throw new Error(`Duplicate event id: ${event.id}`);
  }

  seenIds.add(event.id);

  const parts = event.details.flatMap(value => value.split("|"));
  const [title, ...description] = parts;

  if (!title?.trim()) {
    throw new Error(`${event.id}: missing info/title.`);
  }

  const dateParts = event.date.split(/\s*-\s*/);

  if (dateParts.length > 2) {
    throw new Error(`${event.id}: invalid date range.`);
  }

  const startDate = parseDate(dateParts[0]);
  const endDate = parseDate(dateParts[1] || dateParts[0]);

  if (endDate < startDate) {
    throw new Error(`${event.id}: end date precedes start date.`);
  }

if (event.audience) {
  if (description.length) description.push("");
  description.push(`Audience: ${event.audience}`);
}

  const options = {
    id: `${event.id}@calendar.nitpic.org`,
    summary: title,
    description: description.join("\n"),
    stamp: modified,
    lastModified: modified
  };

  if (event.start) {
    const start = atTime(startDate, event.start);
    options.start = start.toUTC().toJSDate();

    if (event.end) {
      const end = atTime(endDate, event.end);

      if (end <= start) {
        throw new Error(
          `${event.id}: end must be after start. ` +
          "For overnight events, use an explicit date range."
        );
      }

      options.end = end.toUTC().toJSDate();
    } else {
      options.description +=
        "\n\nFinish time not specified; check with the organiser.";
    }
  } else {
    if (event.end) {
      throw new Error(`${event.id}: end time supplied without start.`);
    }

    options.allDay = true;
    options.start = startDate.toJSDate();

    // All-day end dates are exclusive.
    options.end = endDate.plus({ days: 1 }).toJSDate();
  }

  if (event.link) {
    const url = new URL(event.link);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${event.id}: link must use HTTP or HTTPS.`);
    }

    options.url = url.href;
  }

  calendar.createEvent(options);
}

writeFileSync("calendar.ics", calendar.toString(), "utf8");
console.log(`Generated calendar.ics with ${events.length} events.`);

function parseEvents(text) {
  const result = [];
  let current = null;

  const fields = new Set([
    "id", "group", "audience", "start", "end", "link", "linktext"
  ]);

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const [, instruction, value] = line.match(/^(\S+)\s*(.*)$/);

    if (instruction === "ddate" || instruction === "dddate") {
      current = {
        line: index + 1,
        date: value,
        details: []
      };

      result.push(current);
      continue;
    }

    if (!current) {
      throw new Error(`Line ${index + 1}: field before first date.`);
    }

    if (instruction === "info") {
      current.details.push(value);
    } else if (fields.has(instruction)) {
      current[instruction] = value;
    } else if (instruction !== "flagline") {
      throw new Error(
        `Line ${index + 1}: unknown instruction "${instruction}".`
      );
    }
  }

  return result;
}

function parseDate(value) {
  const match = value.trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }

  const date = DateTime.fromObject({
    year: Number(match[3]),
    month: Number(match[2]),
    day: Number(match[1])
  }, { zone: "UTC" });

  if (!date.isValid) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function atTime(date, value) {
  const match = value.trim().match(
    /^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/i
  );

  if (!match) {
    throw new Error(`Invalid time: ${value}`);
  }

  const hour12 = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (hour12 < 1 || hour12 > 12 || minute > 59) {
    throw new Error(`Invalid time: ${value}`);
  }

  const hour = hour12 % 12 +
    (match[3].toLowerCase() === "pm" ? 12 : 0);

  const result = DateTime.fromObject({
    year: date.year,
    month: date.month,
    day: date.day,
    hour,
    minute
  }, { zone });

  if (
    !result.isValid ||
    result.hour !== hour ||
    result.minute !== minute ||
    result.getPossibleOffsets().length > 1
  ) {
    throw new Error(
      `Invalid or ambiguous UK local time: ${date.toISODate()} ${value}`
    );
  }

  return result;
}