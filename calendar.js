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

const eventGroups = {
  nitpic: "NITPIC",
  misfits: "Misfits",
  tac: "Trans Aid Cymru",
  loneworlds: "Lone Worlds",
  garddio: "Garddio",
  other: "Other"
};

const filterStorageKey = "nitpic-calendar-filters-v1";

const filterToggle = document.querySelector("#filter-toggle");
const filterPanel = document.querySelector("#filter-panel");
const filterOptions = document.querySelector("#filter-options");
const filterRemember = document.querySelector("#filter-remember");
// const filterReset = document.querySelector("#filter-reset");
const filterSummary = document.querySelector("#filter-summary");
const filterStorageMessage = document.querySelector(
  "#filter-storage-message"
);

const hiddenGroups = new Set();
let allEvents = null;

initialiseFilters();
loadCalendar();

async function loadCalendar() {
  calendar.textContent = "Loading events…";

  try {
    const response = await fetch("./calendar.txt");

    if (!response.ok) {
      throw new Error(`Calendar request failed: ${response.status}`);
    }

    allEvents = parseCalendar(await response.text());
    renderFilteredCalendar();
  } catch (error) {
    console.error(error);
    calendar.textContent = "Sorry, the calendar couldn't be loaded.";
  }
}

function initialiseFilters() {
  restoreFilterPreferences();

  for (const [key, name] of Object.entries(eventGroups)) {
    const label = element("label", "calendar-filter-option");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = !hiddenGroups.has(key);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        hiddenGroups.delete(key);
      } else {
        hiddenGroups.add(key);
      }

      updateFilterSummary();
      saveFilterPreferences();
      renderFilteredCalendar();
    });

    label.append(
      checkbox,
      element("span", "", name)
    );

    filterOptions.append(label);
  }

  filterToggle.addEventListener("click", () => {
    const expanded = filterToggle.getAttribute("aria-expanded") === "true";

    filterToggle.setAttribute("aria-expanded", String(!expanded));
    filterPanel.hidden = expanded;
    filterToggle.textContent = expanded
      ? "Filters (+)"
      : "Filters (-)";
  });

  filterRemember.addEventListener("change", () => {
    saveFilterPreferences();
  });

  // filterReset.addEventListener("click", () => {
  //   hiddenGroups.clear();

  //   for (const checkbox of filterOptions.querySelectorAll("input")) {
  //     checkbox.checked = true;
  //   }

  //   updateFilterSummary();
  //   saveFilterPreferences();
  //   renderFilteredCalendar();
  // });

  updateFilterSummary();
}

function restoreFilterPreferences() {
  try {
    const raw = localStorage.getItem(filterStorageKey);
    if (!raw) return;

    const saved = JSON.parse(raw);

    if (
      saved?.version !== 1 ||
      !Array.isArray(saved.hiddenGroups) ||
      !saved.hiddenGroups.every(key => typeof key === "string")
    ) {
      return;
    }

    for (const key of saved.hiddenGroups) {
      if (Object.hasOwn(eventGroups, key)) {
        hiddenGroups.add(key);
      }
    }

    filterRemember.checked = true;
  } catch (error) {
    console.warn("Could not restore calendar preferences:", error);

    filterStorageMessage.textContent =
      "Saved preferences couldn't be loaded. You can still use the filters.";
  }
}

function saveFilterPreferences() {
  try {
    if (filterRemember.checked) {
      localStorage.setItem(
        filterStorageKey,
        JSON.stringify({
          version: 1,
          hiddenGroups: [...hiddenGroups]
        })
      );
    } else {
      localStorage.removeItem(filterStorageKey);
    }

    filterStorageMessage.textContent = "";
  } catch (error) {
    console.warn("Could not save calendar preferences:", error);

    filterStorageMessage.textContent =
      "Your choices work for this visit, but this browser couldn't update saved preferences.";
  }
}

function updateFilterSummary() {
  const total = Object.keys(eventGroups).length;
  const selected = total - hiddenGroups.size;

  filterSummary.textContent = hiddenGroups.size
    ? `${selected} of ${total} groups selected`
    : "";
}

function getEventGroup(event) {
  const key = (event.group || "").trim().toLowerCase();

  return Object.hasOwn(eventGroups, key) ? key : "other";
}

function renderFilteredCalendar() {
  if (allEvents === null) return;

  const filteredEvents = allEvents.filter(event =>
    !hiddenGroups.has(getEventGroup(event))
  );

  renderCalendar(calendar, filteredEvents, { hidePastEvents });

  const emptyMessage = calendar.querySelector(".calendar-empty");

  if (emptyMessage && hiddenGroups.size) {
    emptyMessage.textContent = "No events match your filters.";

    const paragraph = element("p", "calendar-empty-reset");
    // const button = element(
    //   "button",
    //   "calendar-text-button",
    //   "Show all groups"
    // );

    // button.type = "button";
    // button.addEventListener("click", () => filterReset.click());

    paragraph.append(button);
    calendar.append(paragraph);
  }
}

function parseCalendar(text) {
  const events = [];
  let currentEvent = null;

  const textFields = new Set([
    "id",
    "group",
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
        group: "other",
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