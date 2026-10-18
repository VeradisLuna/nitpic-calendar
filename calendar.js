const calendar = document.querySelector("#calendar");
const hidePastEvents = true;

const flagImages = {
  trans: "./images/flags/transgender.png",
  intersex: "./images/flags/intersex.png",
  nonbinary: "./images/flags/nonbinary.png",
  pride: "./images/flags/intersexprogresspride.png"
};

const flagSymbols = {
  plus: "+",
  infinity: "∞"
};

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

  const textFields = new Set([
    "audience",
    "start",
    "end",
    "link",
    "linktext"
  ]);

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();

    // Allow blank lines and full-line comments.
    if (!line || line.startsWith("#")) continue;

    const [, instruction, value] = line.match(/^(\S+)\s*(.*)$/);
    const lineNumber = index + 1;

    if (instruction === "ddate" || instruction === "dddate") {
      currentEvent = null;

      const parts = value.split(/\s*-\s*/);
      const start = parseDate(parts[0]);
      const end = parts.length === 1 ? start : parseDate(parts[1]);

      if (parts.length > 2 || !start || !end || end < start) {
        console.warn(`Invalid date on line ${lineNumber}: ${value}`);
        continue;
      }

      currentEvent = {
        start,
        end,
        details: [],
        audience: "",
        flags: [],
        startTime: "",
        endTime: "",
        link: "",
        linktext: ""
      };

      events.push(currentEvent);
      continue;
    }

    if (!currentEvent) {
      console.warn(`Field without a valid date on line ${lineNumber}`);
      continue;
    }

    if (instruction === "info") {
      currentEvent.details.push(value);
    } else if (instruction === "flagline") {
      currentEvent.flags = value ? value.split(/\s+/) : [];
    } else if (textFields.has(instruction)) {
      // Keep date objects separate from display-only time strings.
      const property = {
        start: "startTime",
        end: "endTime"
      }[instruction] || instruction;

      currentEvent[property] = value;
    } else {
      console.warn(
        `Unknown instruction on line ${lineNumber}: ${instruction}`
      );
    }
  }

  return events.sort((a, b) =>
    a.start - b.start || a.end - b.end
  );
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

    eventList.append(renderEvent(event));
  }

  if (!visibleEvents.length) {
    fragment.append(
      element("p", "calendar-empty", "No events to show.")
    );
  }

  container.replaceChildren(fragment);
}

function renderEvent(event) {
  const item = element("li", "calendar-event");

    const [title, ...description] = event.details
    .flatMap(detail => detail.split("|"));

    item.append(
    element("h5", "calendar-event-title", title)
    );

    if (description.length) {
    item.append(
        element(
        "p",
        "calendar-event-description",
        description.join("\n")
        )
    );
    }

  const time = event.startTime && event.endTime
    ? `${event.startTime}–${event.endTime}`
    : event.startTime
      ? `From ${event.startTime}`
      : event.endTime
        ? `Until ${event.endTime}`
        : "";

  if (time) {
    item.append(element("p", "calendar-event-time", time));
  }

  const footer = element("div", "calendar-event-footer");

  if (event.audience) {
    footer.append(renderAudience(event));
  }

  if (event.link) {
    const url = getEventUrl(event.link);

    if (url) {
      const paragraph = element("p", "calendar-event-link");
      const anchor = element(
        "a",
        "",
        event.linktext || "Event details"
      );

      anchor.href = url.href;
      paragraph.append(anchor);
      footer.append(paragraph);
    } else {
      console.warn(`Invalid event link: ${event.link}`);
    }
  }

  if (footer.childElementCount) {
    item.append(footer);
  }

  return item;
}

function renderAudience(event) {
  const line = element("p", "calendar-audience");

  const icons = element("span", "calendar-flags");
  icons.setAttribute("aria-hidden", "true");

  for (const name of event.flags) {
    if (Object.hasOwn(flagImages, name)) {
      const image = element("img", "calendar-flag");
      image.src = flagImages[name];
      image.alt = "";
      icons.append(image);
    } else if (Object.hasOwn(flagSymbols, name)) {
      icons.append(
        element("span", "calendar-flag-symbol", flagSymbols[name])
      );
    } else {
      console.warn(`Unknown flagline icon: ${name}`);
    }
  }

    if (icons.childElementCount) {
    line.append(icons);
    }

    line.append(
    element(
        "span",
        "calendar-audience-label",
        `(${event.audience})`
    )
    );

    return line;
}

function getEventUrl(value) {
  try {
    const url = new URL(value, document.baseURI);

    return ["http:", "https:"].includes(url.protocol)
      ? url
      : null;
  } catch {
    return null;
  }
}