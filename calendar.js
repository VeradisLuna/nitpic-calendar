const calendar = document.querySelector("#calendar");
const hidePastEvents = false;

loadCalendar();

async function loadCalendar() {
  calendar.textContent = "Loading events…";

  try {
    const response = await fetch("./calendar.txt");

    if (!response.ok) {
      throw new Error(`Calendar request failed: ${response.status}`);
    }

    const events = parseCalendar(await response.text());
    renderCalendar(calendar, events, { hidePastEvents });
  } catch (error) {
    console.error(error);
    calendar.textContent = "Sorry, the calendar couldn't be loaded.";
  }
}

function parseCalendar(text) {
  const events = [];
  let currentEvent = null;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const [, instruction, value] = line.match(/^(\S+)\s*(.*)$/);

    switch (instruction) {
      case "ddate":
        {
        // Reset first, so an invalid date cannot attach its info
        // to the previous event
        currentEvent = null;

        const parts = value.split(/\s*-\s*/);
        const start = parseDate(parts[0]);
        const end = parts.length === 1 ? start : parseDate(parts[1]);

        if (
          parts.length > 2 ||
          !start ||
          !end ||
          end < start
        ) {
          console.warn(`Invalid date on line ${index + 1}: ${value}`);
          break;
        }

        currentEvent = { start, end, details: [] };
        events.push(currentEvent);
        break;
      }

      case "info":
        if (currentEvent) {
          currentEvent.details.push(value);
        } else {
          console.warn(`Info without a valid date on line ${index + 1}`);
        }
        break;

      default:
        console.warn(`Unknown instruction on line ${index + 1}: ${instruction}`);
    }
  }

  return events.sort((a, b) => a.start - b.start || a.end - b.end);
}

function parseDate(value = "") {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match.map(Number);

  // Treat these as calendar dates, not local times.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  // Reject impossible dates rather than allowing rollover.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDate(date, options) {
  return date.toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC"
  });
}

function formatRange(start, end) {
  const options = {
    weekday: "short",
    day: "numeric",
    month: "short"
  };

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    options.year = "numeric";
  }

  const first = formatDate(start, options);

  return start.getTime() === end.getTime()
    ? first
    : `${first} – ${formatDate(end, options)}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;

  if (text !== undefined) node.textContent = text;

  return node;
}

function renderCalendar(container, events, { hidePastEvents = false } = {}) {
  const now = new Date();
  const today = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const visibleEvents = events.filter(event =>
    event.details.length &&
    (!hidePastEvents || event.end.getTime() >= today)
  );

  const fragment = document.createDocumentFragment();

  let currentYear;
  let currentMonth;
  let currentDate;
  let monthsContainer;
  let monthSection;
  let eventList;

  for (const event of visibleEvents) {
    const year = event.start.getUTCFullYear();
    const month = event.start.getUTCMonth();
    const dateKey = `${event.start.getTime()}/${event.end.getTime()}`;

    if (year !== currentYear) {
      const yearSection = element("section", "calendar-year");
      monthsContainer = element("div", "calendar-months");

      yearSection.append(
        element("h2", "calendar-year-title", String(year)),
        monthsContainer
      );

      fragment.append(yearSection);
      currentYear = year;
      currentMonth = undefined;
    }

    if (month !== currentMonth) {
      monthSection = element("section", "calendar-month");

      monthSection.append(
        element(
          "h3",
          "calendar-month-title",
          formatDate(event.start, { month: "long" })
        )
      );

      monthsContainer.append(monthSection);
      currentMonth = month;
      currentDate = undefined;
    }

    if (dateKey !== currentDate) {
      const dateSection = element("section", "calendar-date");
      eventList = element("ul", "calendar-events");

      dateSection.append(
        element(
          "h4",
          "calendar-date-title",
          formatRange(event.start, event.end)
        ),
        eventList
      );

      monthSection.append(dateSection);
      currentDate = dateKey;
    }

    for (const detail of event.details) {
      eventList.append(
        element("li", "calendar-event", detail.replace(/\|/g, "\n"))
      );
    }
  }

  if (!visibleEvents.length) {
    fragment.append(
      element("p", "calendar-empty", "No events to show.")
    );
  }

  container.replaceChildren(fragment);
}