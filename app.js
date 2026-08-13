const app = document.querySelector("#app");
const topActions = document.querySelector("#top-actions");
const QUESTION_SECONDS = 120;
const QUESTION_EDIT_STORAGE_KEY = "epso-question-bank-edits-v1";
const HOME_TRAINER_ORDER = ["verbal", "numerical", "abstract", "eu"];

const TRAINERS = {
  eu: {
    id: "eu",
    eyebrow: "EU Knowledge",
    title: "Practice random MCQs across all four parts",
    description:
      "Choose between 1 and 20 questions. EU tests distribute them across the four parts, and your results and answer history are saved locally in this browser.",
    parts: [
      "I. EU General Knowledge",
      "II. Institutions, other bodies and agencies of the European Union",
      "III. Legislative procedures of the EU",
      "IV. Key policies of the EU",
    ],
    defaultQuestionCount: 20,
  },
  verbal: {
    id: "verbal",
    eyebrow: "Verbal Reasoning",
    title: "Practice verbal reasoning MCQs from the full test bank",
    description:
      "Choose between 1 and 20 verbal reasoning questions. Results, scores, and your correct/incorrect history are saved locally in this browser.",
    parts: ["Verbal Reasoning"],
    defaultQuestionCount: 10,
  },
  numerical: {
    id: "numerical",
    eyebrow: "Numerical Reasoning",
    title: "Practice numerical reasoning across 40 data sets",
    description:
      "Choose between 1 and 20 sets. Each selected set contributes its three questions in order. Results, scores, and your correct/incorrect history are saved locally in this browser.",
    parts: ["Numerical Reasoning"],
    defaultQuestionCount: 3,
  },
  abstract: {
    id: "abstract",
    eyebrow: "Abstract Reasoning",
    title: "Practice visual series and identify the missing figure",
    description:
      "Choose between 1 and 20 abstract reasoning questions. Each question has five possible figures, and the complete rule explanation is available after the test.",
    parts: ["Abstract Reasoning"],
    defaultQuestionCount: 10,
  },
};

let questionBanks = {};
let activeTest = null;
let timerInterval = null;

app.addEventListener("click", handleQuestionBankAction);
app.addEventListener("submit", handleQuestionBankSubmit);

init();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Offline mode could not be enabled.", error);
    });
  });
}

async function init() {
  try {
    questionBanks = loadQuestionBanks();
    renderHome();
  } catch (error) {
    app.innerHTML = `<section class="panel"><h2>Data loading failed</h2><p>${escapeHtml(
      String(error),
    )}</p></section>`;
  }
}

function loadQuestionBanks() {
  let banks;
  if (window.__QUESTION_BANKS__ && typeof window.__QUESTION_BANKS__ === "object") {
    banks = window.__QUESTION_BANKS__;
  } else if (Array.isArray(window.__QUESTION_BANK__)) {
    banks = { eu: window.__QUESTION_BANK__ };
  } else {
    throw new Error("Question bank not available. Make sure data/questions-data.js is present.");
  }

  applyStoredQuestionEdits(banks);
  return banks;
}

function renderHome() {
  stopTimer();
  document.body.classList.remove("exam-active");
  document.body.classList.add("home-active");
  topActions.innerHTML = "";
  activeTest = null;

  const trainerSections = HOME_TRAINER_ORDER.map((trainerId) => TRAINERS[trainerId])
    .filter((trainer) => Array.isArray(questionBanks[trainer.id]) && questionBanks[trainer.id].length)
    .map((trainer) => renderTrainerSection(trainer))
    .join("");

  app.innerHTML = `<section class="trainer-stack">${trainerSections}</section>`;

  HOME_TRAINER_ORDER.map((trainerId) => TRAINERS[trainerId]).forEach((trainer) => {
    if (!questionBanks[trainer.id]?.length) return;
    bindTrainerButtons(trainer.id);
  });
}

function renderTrainerSection(trainer) {
  const logs = getLogs(trainer.id);
  const questionBank = getQuestionBank(trainer.id);
  const countLabel = trainer.id === "numerical" ? "Number of sets:" : "Number of questions:";

  return `
    <section class="panel trainer-panel">
      <div class="trainer-heading">
        <div class="trainer-heading-copy">
          <p class="eyebrow">${escapeHtml(trainer.eyebrow)}</p>
          <h2 class="trainer-title">${escapeHtml(trainer.title)}</h2>
          <p class="lede trainer-lede">${escapeHtml(trainer.description)}</p>
        </div>
      </div>
      <div class="question-count-control">
        <label for="${trainer.id}-question-count">${countLabel}</label>
        <input
          type="number"
          id="${trainer.id}-question-count"
          min="1"
          max="20"
          step="1"
          value="${trainer.defaultQuestionCount}"
          inputmode="numeric"
        />
      </div>
      <div class="hero-actions trainer-actions">
        ${buttonMarkup("Create fully random test", `${trainer.id}-random`)}
        ${buttonMarkup("Create test with new questions", `${trainer.id}-new`, "secondary")}
        ${buttonMarkup("Correct answers", `${trainer.id}-correct`, "secondary")}
        ${buttonMarkup("Incorrect answers", `${trainer.id}-wrong`, "secondary")}
        ${buttonMarkup("Empty log", `${trainer.id}-clear`, "danger")}
      </div>
      <div class="results-grid">
        <button type="button" class="score-card score-card-link" id="${trainer.id}-question-bank">
          <span class="score-card-title">Question bank</span>
          <span class="score-card-value">${questionBank.length} extracted MCQs</span>
        </button>
        <article class="score-card"><h3>Correct log</h3><p>${logs.correct.length} entries</p></article>
        <article class="score-card"><h3>Incorrect log</h3><p>${logs.wrong.length} entries</p></article>
        <article class="score-card"><h3>Seen questions</h3><p>${logs.asked.length} unique prompts</p></article>
      </div>
    </section>
  `;
}

function bindTrainerButtons(trainerId) {
  const countInput = app.querySelector(`#${trainerId}-question-count`);
  countInput?.addEventListener("input", () => {
    const value = Number.parseInt(countInput.value, 10);
    if (!Number.isFinite(value)) return;
    if (value > 20) countInput.value = "20";
    if (value < 1) countInput.value = "1";
  });
  countInput?.addEventListener("change", () => {
    countInput.value = String(getRequestedQuestionCount(trainerId));
  });
  app.querySelector(`#${trainerId}-random`)?.addEventListener("click", () =>
    startTest(trainerId, "random", getRequestedQuestionCount(trainerId)),
  );
  app.querySelector(`#${trainerId}-new`)?.addEventListener("click", () =>
    startTest(trainerId, "new", getRequestedQuestionCount(trainerId)),
  );
  app.querySelector(`#${trainerId}-correct`)?.addEventListener("click", () => renderLog(trainerId, "correct"));
  app.querySelector(`#${trainerId}-wrong`)?.addEventListener("click", () => renderLog(trainerId, "wrong"));
  app.querySelector(`#${trainerId}-clear`)?.addEventListener("click", () => clearLogs(trainerId));
  app.querySelector(`#${trainerId}-question-bank`)?.addEventListener("click", () => renderQuestionBank(trainerId));
}

function getRequestedQuestionCount(trainerId) {
  const trainer = TRAINERS[trainerId];
  const input = app.querySelector(`#${trainerId}-question-count`);
  const requested = Number.parseInt(input?.value, 10);
  const fallback = trainer.defaultQuestionCount;
  return Math.min(20, Math.max(1, Number.isFinite(requested) ? requested : fallback));
}

function getQuestionBank(trainerId) {
  return Array.isArray(questionBanks[trainerId]) ? questionBanks[trainerId] : [];
}

function getStorageKeys(trainerId) {
  return {
    correct: `${trainerId}-mcq-correct-log`,
    wrong: `${trainerId}-mcq-wrong-log`,
    asked: `${trainerId}-mcq-asked-log`,
  };
}

function startTest(trainerId, mode, requestedCount = TRAINERS[trainerId].defaultQuestionCount) {
  document.body.classList.remove("home-active");
  const trainer = TRAINERS[trainerId];
  const questionBank = getQuestionBank(trainerId);
  const asked = new Set(getLogs(trainerId).asked);
  const requestedSize = Math.min(20, Math.max(1, Number.parseInt(requestedCount, 10) || trainer.defaultQuestionCount));
  const questions =
    trainerId === "numerical"
      ? selectNumericalSets(questionBank, asked, mode, requestedSize)
      : selectQuestionsByPart(questionBank, trainer.parts, asked, mode, requestedSize);

  activeTest = {
    trainerId,
    mode,
    questions,
    answers: {},
    currentIndex: 0,
    totalTimeSeconds: questions.length * QUESTION_SECONDS,
    timerEndsAt: Date.now() + questions.length * QUESTION_SECONDS * 1000,
    bookmarks: new Set(),
    highlights: {},
    highlighterEnabled: false,
    highlighterColor: "yellow",
    overlay: null,
    overviewFilter: "all",
    scratchpad: { mode: "type", note: "", drawing: null },
    calculator: createCalculatorState(),
  };

  document.body.classList.add("exam-active");
  renderTest();
  window.scrollTo(0, 0);
}

function selectQuestionsByPart(questionBank, parts, asked, mode, totalQuestions) {
  const questions = [];
  const baseCount = Math.floor(totalQuestions / parts.length);
  const extraParts = new Set(pickRandom(parts, totalQuestions % parts.length));

  for (const part of parts) {
    const partCount = baseCount + (extraParts.has(part) ? 1 : 0);
    if (!partCount) continue;
    const pool = questionBank.filter((question) => question.part === part);
    const freshPool = pool.filter((question) => !asked.has(question.id));
    const source = mode === "new" && freshPool.length >= partCount ? freshPool : pool;
    questions.push(...pickRandom(source, partCount));
  }

  return questions;
}

function selectNumericalSets(questionBank, asked, mode, requestedSetCount) {
  const questionsBySet = new Map();

  questionBank.forEach((question) => {
    const setNumber = Number(question.setNumber);
    if (!Number.isFinite(setNumber)) return;
    if (!questionsBySet.has(setNumber)) questionsBySet.set(setNumber, []);
    questionsBySet.get(setNumber).push(question);
  });

  const allSetNumbers = [...questionsBySet.keys()];
  const freshSetNumbers = allSetNumbers.filter((setNumber) =>
    questionsBySet.get(setNumber).every((question) => !asked.has(question.id)),
  );
  const setCount = Math.min(requestedSetCount, allSetNumbers.length);
  const source = mode === "new" && freshSetNumbers.length >= setCount ? freshSetNumbers : allSetNumbers;

  return pickRandom(source, setCount).flatMap((setNumber) =>
    questionsBySet
      .get(setNumber)
      .slice()
      .sort(
        (first, second) =>
          Number(first.setQuestionNumber ?? first.number) - Number(second.setQuestionNumber ?? second.number),
      ),
  );
}

function renderTest() {
  if (!activeTest) return;

  stopTimer();
  document.body.classList.add("exam-active");
  topActions.innerHTML = "";

  const question = activeTest.questions[activeTest.currentIndex];
  const index = activeTest.currentIndex;
  const isVerbal = activeTest.trainerId === "verbal";
  const isNumerical = activeTest.trainerId === "numerical";
  const isAbstract = activeTest.trainerId === "abstract";
  const isBookmarked = activeTest.bookmarks.has(index);
  const selectedAnswer = activeTest.answers[question.id] ?? null;
  const quizSetNumber = isNumerical ? getQuizSetNumber(index) : null;
  const setQuestionNumber = isNumerical
    ? Number(question.setQuestionNumber) || ((index % 3) + 1)
    : null;

  const readingBlock = isVerbal
    ? `<div class="reading-passage highlightable" data-highlight-key="passage">${highlightedContent(
        "passage",
        question.prompt,
      )}</div>
       <h1 class="exam-question-title">Which of the following statements is correct?</h1>`
    : isNumerical
      ? `<h1 class="exam-question-title">
          <span class="question-number-prefix">Q${setQuestionNumber}.</span>
          <span class="highlightable" data-highlight-key="prompt">${highlightedContent(
            "prompt",
            question.prompt,
          )}</span>
        </h1>`
      : isAbstract
        ? `<h1 class="exam-question-title abstract-question-title">${escapeHtml(question.prompt)}</h1>`
        : `<h1 class="exam-question-title highlightable" data-highlight-key="prompt">${highlightedContent(
            "prompt",
            question.prompt,
          )}</h1>`;
  const figureBlock = renderQuestionFigures(
    question,
    "exam",
    isNumerical ? `Set ${quizSetNumber}` : "",
  );
  const choicesBlock = `
    <fieldset class="exam-choices">
      <legend class="sr-only">Choose one answer</legend>
      ${Object.entries(question.options)
        .map(
          ([letter, text]) => `
            <label class="exam-choice ${isAbstract ? "abstract-choice" : ""} ${selectedAnswer === letter ? "is-selected" : ""}">
              <input type="radio" name="${escapeHtml(question.id)}" value="${letter}" ${selectedAnswer === letter ? "checked" : ""} />
              <span class="choice-radio" aria-hidden="true"></span>
              <strong>${letter}</strong>
              ${
                isAbstract
                  ? `<span class="choice-copy sr-only">${escapeHtml(text)}</span>`
                  : `<span class="choice-copy highlightable" data-highlight-key="option-${letter}">${highlightedContent(
                      `option-${letter}`,
                      text,
                    )}</span>`
              }
            </label>`,
        )
        .join("")}
    </fieldset>`;

  app.innerHTML = `
    <section class="exam-shell">
      <header class="exam-header">
        <button type="button" class="exam-brand" id="exam-home" aria-label="Return to home">
          <span class="exam-brand-mark">EU</span>
          <span class="exam-brand-copy">
            <strong>EPSO PRACTICE HUB</strong>
          </span>
        </button>

        <div class="question-timer" aria-live="polite">
          <span class="timer-label">Total remaining time</span>
          <strong id="question-timer">${formatTime(getRemainingTime())}</strong>
        </div>

        <nav class="exam-tools" aria-label="Test tools">
          <button type="button" class="tool-button" id="scratchpad-tool" aria-label="Open scratchpad">
            ${icon("note")}<span>Scratchpad</span>
          </button>
          <button type="button" class="tool-button ${activeTest.highlighterEnabled ? "is-active" : ""}" id="highlighter-tool" aria-pressed="${activeTest.highlighterEnabled}">
            ${icon("highlight")}<span>Highlight</span>
          </button>
          <button type="button" class="tool-button" id="calculator-tool" aria-label="Open calculator">
            ${icon("calculator")}<span>Calculator</span>
          </button>
        </nav>
      </header>

      ${activeTest.highlighterEnabled ? renderHighlighterPalette() : ""}

      <main class="exam-content">
        <div class="question-meta-line">
          <span>${escapeHtml(question.part)}</span>
          <span>${
            isNumerical
              ? `Set ${escapeHtml(question.setNumber)} · Q${setQuestionNumber}`
              : isAbstract
                ? `Question #${escapeHtml(question.number)}`
                : `${question.setNumber ? `Set ${escapeHtml(question.setNumber)} · ` : ""}Source question #${escapeHtml(question.number)}`
          }</span>
        </div>
        <article class="question-stage ${isAbstract ? "abstract-question-card" : ""}">
          ${isAbstract ? `${readingBlock}${figureBlock}${choicesBlock}` : `${figureBlock}${readingBlock}${choicesBlock}`}
        </article>

        <button type="button" class="bookmark-button ${isBookmarked ? "is-bookmarked" : ""}" id="bookmark-question" aria-label="${isBookmarked ? "Remove bookmark" : "Bookmark for later review"}" title="${isBookmarked ? "Remove bookmark" : "Bookmark for later review"}" aria-pressed="${isBookmarked}">
          ${icon("bookmark")}
        </button>
      </main>

      <footer class="exam-footer">
        <button type="button" class="round-nav" id="previous-question" ${index === 0 ? "disabled" : ""} aria-label="Previous question">${icon("arrow-left")}</button>
        <div class="progress-wrap">
          <div class="question-progress" id="question-progress" aria-label="Question navigation">
            ${activeTest.questions.map((item, itemIndex) => progressNode(item, itemIndex)).join("")}
          </div>
          <div class="progress-legend">
            <span><i class="legend-dot answered"></i>Answered</span>
            <span><i class="legend-dot bookmarked"></i>Bookmarked</span>
            <span><i class="legend-dot current"></i>Current</span>
          </div>
        </div>
        <button type="button" class="overview-button" id="overview-tool" aria-label="Open question overview">
          ${icon("overview")}<span>Overview</span><strong>(${activeTest.questions.length})</strong>
        </button>
        <button type="button" class="btn submit-exam" id="submit-test">Submit test</button>
        <button type="button" class="round-nav next" id="next-question" ${index === activeTest.questions.length - 1 ? "disabled" : ""} aria-label="Next question">${icon("arrow-right")}</button>
      </footer>
    </section>
    ${renderOverlay()}
  `;

  bindExamEvents();
  scrollCurrentProgressIntoView();
  startTimer();
}

function bindExamEvents() {
  app.querySelector("#exam-home")?.addEventListener("click", () => {
    if (window.confirm("Leave this test? Your answers from this unfinished test will not be logged.")) renderHome();
  });

  app.querySelectorAll(".exam-choice input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const question = activeTest.questions[activeTest.currentIndex];
      activeTest.answers[question.id] = event.target.value;
      app.querySelectorAll(".exam-choice").forEach((choice) => {
        choice.classList.toggle("is-selected", choice.querySelector("input")?.checked === true);
      });
      updateProgressStates();
    });
  });

  app.querySelector("#previous-question")?.addEventListener("click", () => navigateTo(activeTest.currentIndex - 1));
  app.querySelector("#next-question")?.addEventListener("click", () => navigateTo(activeTest.currentIndex + 1));
  app.querySelectorAll(".progress-node").forEach((node) => {
    node.addEventListener("click", () => navigateTo(Number(node.dataset.index)));
  });
  app.querySelector("#submit-test")?.addEventListener("click", () => submitTest(false));
  app.querySelector("#overview-tool")?.addEventListener("click", () => openOverlay("overview"));

  app.querySelector("#bookmark-question")?.addEventListener("click", () => {
    captureHighlights();
    const index = activeTest.currentIndex;
    if (activeTest.bookmarks.has(index)) activeTest.bookmarks.delete(index);
    else activeTest.bookmarks.add(index);
    renderTest();
  });

  app.querySelector("#scratchpad-tool")?.addEventListener("click", () => openOverlay("scratchpad"));
  app.querySelector("#calculator-tool")?.addEventListener("click", () => openOverlay("calculator"));
  app.querySelector("#highlighter-tool")?.addEventListener("click", () => {
    captureHighlights();
    activeTest.highlighterEnabled = !activeTest.highlighterEnabled;
    renderTest();
  });

  bindHighlighterEvents();
  bindOverlayEvents();
}

function progressNode(question, index) {
  const classes = ["progress-node"];
  if (index === activeTest.currentIndex) classes.push("is-current");
  if (activeTest.answers[question.id]) classes.push("is-answered");
  if (activeTest.bookmarks.has(index)) classes.push("is-bookmarked");

  return `
    <button type="button" class="${classes.join(" ")}" data-index="${index}" aria-label="Question ${index + 1}${activeTest.bookmarks.has(index) ? ", bookmarked" : ""}">
      <span>${index + 1}</span>
      ${activeTest.bookmarks.has(index) ? icon("bookmark-small") : ""}
    </button>
  `;
}

function updateProgressStates() {
  app.querySelectorAll(".progress-node").forEach((node) => {
    const index = Number(node.dataset.index);
    const question = activeTest.questions[index];
    node.classList.toggle("is-answered", Boolean(activeTest.answers[question.id]));
    node.classList.toggle("is-bookmarked", activeTest.bookmarks.has(index));
  });
}

function navigateTo(index) {
  if (!activeTest || index < 0 || index >= activeTest.questions.length || index === activeTest.currentIndex) return;
  captureHighlights();
  activeTest.currentIndex = index;
  activeTest.overlay = null;
  renderTest();
  window.scrollTo(0, 0);
}

function scrollCurrentProgressIntoView() {
  requestAnimationFrame(() => {
    const progress = app.querySelector(".question-progress");
    const current = app.querySelector(".progress-node.is-current");
    if (!progress || !current) return;
    progress.scrollTo({
      left: current.offsetLeft - progress.clientWidth / 2 + current.clientWidth / 2,
      behavior: "smooth",
    });
  });
}

function startTimer() {
  stopTimer();
  const updateTimer = () => {
    if (!activeTest) return;
    const remaining = getRemainingTime();
    const timer = app.querySelector("#question-timer");
    if (timer) timer.textContent = formatTime(remaining);

    if (remaining === 0) {
      stopTimer();
      submitTest(true);
    }
  };

  updateTimer();
  timerInterval = window.setInterval(updateTimer, 250);
}

function stopTimer() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function getRemainingTime() {
  if (!activeTest) return 0;
  return Math.max(0, Math.ceil((activeTest.timerEndsAt - Date.now()) / 1000));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function renderHighlighterPalette() {
  const colors = ["yellow", "blue", "pink", "green", "orange"];
  return `
    <div class="highlighter-palette" role="toolbar" aria-label="Highlighter colors">
      <strong>Highlighter on</strong>
      <span class="palette-hint">Select text to highlight</span>
      ${colors
        .map(
          (color) => `<button type="button" class="color-swatch ${color} ${activeTest.highlighterColor === color ? "is-active" : ""}" data-color="${color}" aria-label="Use ${color} highlighter"></button>`,
        )
        .join("")}
      <button type="button" class="clear-highlights" id="clear-highlights">Clear all</button>
    </div>
  `;
}

function bindHighlighterEvents() {
  if (!activeTest.highlighterEnabled) return;

  app.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      activeTest.highlighterColor = swatch.dataset.color;
      app.querySelectorAll(".color-swatch").forEach((item) => item.classList.toggle("is-active", item === swatch));
    });
  });

  app.querySelector("#clear-highlights")?.addEventListener("click", () => {
    activeTest.highlights = {};
    renderTest();
  });

  app.querySelectorAll(".highlightable").forEach((container) => {
    container.classList.add("highlighter-ready");
    container.addEventListener("mouseup", () => applyHighlight(container));
    container.addEventListener("touchend", () => window.setTimeout(() => applyHighlight(container), 0));
    if (container.classList.contains("choice-copy")) {
      container.closest(".exam-choice")?.addEventListener("click", (event) => {
        if (event.target.closest(".choice-copy")) event.preventDefault();
      });
    }
  });
}

function applyHighlight(container) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return;

  const mark = document.createElement("mark");
  mark.className = `text-highlight highlight-${activeTest.highlighterColor}`;
  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.append(fragment);
    range.insertNode(mark);
  }
  selection.removeAllRanges();
  captureHighlights();
}

function highlightedContent(key, fallback) {
  const question = activeTest.questions[activeTest.currentIndex];
  return activeTest.highlights[question.id]?.[key] ?? escapeHtml(fallback);
}

function captureHighlights() {
  if (!activeTest) return;
  const question = activeTest.questions[activeTest.currentIndex];
  const saved = activeTest.highlights[question.id] || {};
  app.querySelectorAll("[data-highlight-key]").forEach((element) => {
    saved[element.dataset.highlightKey] = element.innerHTML;
  });
  activeTest.highlights[question.id] = saved;
}

function openOverlay(name) {
  captureHighlights();
  activeTest.overlay = name;
  renderTest();
}

function renderOverlay() {
  if (activeTest.overlay === "overview") return renderOverview();
  if (activeTest.overlay === "scratchpad") return renderScratchpad();
  if (activeTest.overlay === "calculator") return renderCalculator();
  return "";
}

function renderOverview() {
  const trainer = TRAINERS[activeTest.trainerId];
  const filter = activeTest.overviewFilter;
  const bookmarkedCount = activeTest.bookmarks.size;
  const incompleteCount = activeTest.questions.filter((question) => !activeTest.answers[question.id]).length;
  const visibleIndices = activeTest.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question, index }) => {
      if (filter === "bookmarked") return activeTest.bookmarks.has(index);
      if (filter === "incomplete") return !activeTest.answers[question.id];
      return true;
    });

  const groups = trainer.parts
    .map((part) => ({
      part,
      questions: visibleIndices.filter((item) => item.question.part === part),
    }))
    .filter((group) => group.questions.length > 0);

  return `
    <div class="modal-backdrop overview-backdrop">
      <section class="overview-modal" role="dialog" aria-modal="true" aria-labelledby="overview-title">
        <header class="overview-header">
          <button type="button" class="overview-close" id="close-overlay" aria-label="Close question overview">${icon("close")}</button>
          <div>
            <h2 id="overview-title">Question overview</h2>
            <p>${escapeHtml(trainer.eyebrow)} · ${activeTest.questions.length} questions</p>
          </div>
        </header>

        <nav class="overview-tabs" role="tablist" aria-label="Overview filters">
          ${overviewTab("all", `All Questions (${activeTest.questions.length})`, filter)}
          ${overviewTab("bookmarked", `Bookmarked (${bookmarkedCount})`, filter)}
          ${overviewTab("incomplete", `Incomplete (${incompleteCount})`, filter)}
        </nav>

        <div class="overview-body">
          ${
            groups.length
              ? groups
                  .map(
                    (group) => `
                      <section class="overview-group">
                        <h3>${escapeHtml(group.part)}</h3>
                        <div class="overview-question-grid">
                          ${group.questions.map(({ question, index }) => overviewQuestion(question, index)).join("")}
                        </div>
                      </section>
                    `,
                  )
                  .join("")
              : `<div class="overview-empty">
                  <strong>${filter === "bookmarked" ? "No bookmarked questions" : "No incomplete questions"}</strong>
                  <p>${filter === "bookmarked" ? "Use the bookmark icon on a question to add it here." : "Every question has an answer."}</p>
                </div>`
          }
        </div>

        <footer class="overview-legend">
          <span><i class="overview-key empty"></i>Unanswered</span>
          <span><i class="overview-key filled"></i>Answered</span>
          <span><i class="overview-key arrow"></i>Current question</span>
        </footer>
      </section>
    </div>
  `;
}

function overviewTab(value, label, currentFilter) {
  const selected = value === currentFilter;
  return `<button type="button" class="overview-tab ${selected ? "is-active" : ""}" data-overview-filter="${value}" role="tab" aria-selected="${selected}">${label}</button>`;
}

function overviewQuestion(question, index) {
  const answered = Boolean(activeTest.answers[question.id]);
  const current = index === activeTest.currentIndex;
  const bookmarked = activeTest.bookmarks.has(index);
  const classes = ["overview-question"];
  if (answered) classes.push("is-answered");
  if (current) classes.push("is-current");
  if (bookmarked) classes.push("is-bookmarked");

  return `
    <button type="button" class="${classes.join(" ")}" data-overview-index="${index}" aria-label="Go to question ${index + 1}${answered ? ", answered" : ", unanswered"}${bookmarked ? ", bookmarked" : ""}${current ? ", current question" : ""}">
      <span class="overview-question-circle">${index + 1}</span>
      ${bookmarked ? icon("bookmark-small") : ""}
      ${current ? `<span class="overview-current-arrow" aria-hidden="true"></span>` : ""}
    </button>
  `;
}

function renderScratchpad() {
  const pad = activeTest.scratchpad;
  return `
    <div class="modal-backdrop" data-close-modal="true">
      <section class="floating-tool scratchpad-modal" role="dialog" aria-modal="true" aria-labelledby="scratchpad-title">
        <header class="floating-header">
          <span>${icon("note")}</span>
          <h2 id="scratchpad-title">Scratchpad</h2>
          <button type="button" class="close-tool" id="close-overlay" aria-label="Close scratchpad">${icon("close")}</button>
        </header>
        <div class="scratch-tabs" role="tablist">
          <button type="button" class="${pad.mode === "type" ? "is-active" : ""}" data-scratch-mode="type">Type notes</button>
          <button type="button" class="${pad.mode === "draw" ? "is-active" : ""}" data-scratch-mode="draw">Sketch</button>
        </div>
        ${
          pad.mode === "type"
            ? `<textarea id="scratch-note" class="scratch-note" aria-label="Scratchpad notes" placeholder="Type your notes here...">${escapeHtml(pad.note)}</textarea>`
            : `<div class="drawing-wrap"><canvas id="scratch-canvas" aria-label="Scratchpad drawing canvas"></canvas><button type="button" class="canvas-clear" id="clear-drawing">Clear sketch</button></div>`
        }
      </section>
    </div>
  `;
}

function renderCalculator() {
  const buttons = [
    ["AC", "clear", "utility"], ["+/−", "sign", "utility"], ["%", "percent", "utility"], ["÷", "divide", "operator"],
    ["7", "7", "number"], ["8", "8", "number"], ["9", "9", "number"], ["×", "multiply", "operator"],
    ["4", "4", "number"], ["5", "5", "number"], ["6", "6", "number"], ["−", "subtract", "operator"],
    ["1", "1", "number"], ["2", "2", "number"], ["3", "3", "number"], ["+", "add", "operator"],
    ["0", "0", "number wide"], [".", "decimal", "number"], ["=", "equals", "operator equals"],
  ];
  return `
    <div class="modal-backdrop" data-close-modal="true">
      <section class="floating-tool calculator-modal" role="dialog" aria-modal="true" aria-labelledby="calculator-title">
        <header class="floating-header">
          <span>${icon("calculator")}</span>
          <h2 id="calculator-title">Calculator</h2>
          <button type="button" class="close-tool" id="close-overlay" aria-label="Close calculator">${icon("close")}</button>
        </header>
        <div class="calculator-display" id="calculator-display">${escapeHtml(activeTest.calculator.display)}</div>
        <div class="calculator-grid">
          ${buttons
            .map(([label, action, className]) => `<button type="button" class="calc-key ${className}" data-calc-action="${action}">${label}</button>`)
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function bindOverlayEvents() {
  const backdrop = app.querySelector(".modal-backdrop");
  if (!backdrop) return;

  app.querySelector("#close-overlay")?.addEventListener("click", closeOverlay);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeOverlay();
  });

  if (activeTest.overlay === "scratchpad") bindScratchpadEvents();
  if (activeTest.overlay === "calculator") bindCalculatorEvents();
  if (activeTest.overlay === "overview") bindOverviewEvents();
}

function bindOverviewEvents() {
  app.querySelectorAll("[data-overview-filter]").forEach((tab) => {
    tab.addEventListener("click", () => {
      captureHighlights();
      activeTest.overviewFilter = tab.dataset.overviewFilter;
      renderTest();
    });
  });

  app.querySelectorAll("[data-overview-index]").forEach((button) => {
    button.addEventListener("click", () => goToQuestionFromOverview(Number(button.dataset.overviewIndex)));
  });
}

function goToQuestionFromOverview(index) {
  if (!activeTest || index < 0 || index >= activeTest.questions.length) return;
  captureHighlights();
  activeTest.currentIndex = index;
  activeTest.overlay = null;
  renderTest();
  window.scrollTo(0, 0);
}

function closeOverlay() {
  saveScratchpadState();
  activeTest.overlay = null;
  renderTest();
}

function bindScratchpadEvents() {
  app.querySelector("#scratch-note")?.addEventListener("input", (event) => {
    activeTest.scratchpad.note = event.target.value;
  });

  app.querySelectorAll("[data-scratch-mode]").forEach((tab) => {
    tab.addEventListener("click", () => {
      saveScratchpadState();
      activeTest.scratchpad.mode = tab.dataset.scratchMode;
      renderTest();
    });
  });

  const canvas = app.querySelector("#scratch-canvas");
  if (canvas) initializeDrawingCanvas(canvas);
  app.querySelector("#clear-drawing")?.addEventListener("click", () => {
    activeTest.scratchpad.drawing = null;
    initializeDrawingCanvas(app.querySelector("#scratch-canvas"), true);
  });
}

function initializeDrawingCanvas(canvas, forceClear = false) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.4;
  context.strokeStyle = "#20334d";

  if (!forceClear && activeTest.scratchpad.drawing) {
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = activeTest.scratchpad.drawing;
  }

  if (canvas.dataset.drawingBound === "true") return;
  canvas.dataset.drawingBound = "true";

  let drawing = false;
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const start = point(event);
    context.beginPath();
    context.moveTo(start.x, start.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  });
  const finish = () => {
    if (!drawing) return;
    drawing = false;
    activeTest.scratchpad.drawing = canvas.toDataURL("image/png");
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

function saveScratchpadState() {
  if (!activeTest || activeTest.overlay !== "scratchpad") return;
  const note = app.querySelector("#scratch-note");
  if (note) activeTest.scratchpad.note = note.value;
  const canvas = app.querySelector("#scratch-canvas");
  if (canvas) activeTest.scratchpad.drawing = canvas.toDataURL("image/png");
}

function createCalculatorState() {
  return { display: "0", storedValue: null, operator: null, waitingForOperand: false };
}

function bindCalculatorEvents() {
  app.querySelectorAll("[data-calc-action]").forEach((key) => {
    key.addEventListener("click", () => {
      handleCalculatorAction(key.dataset.calcAction);
      const display = app.querySelector("#calculator-display");
      if (display) display.textContent = activeTest.calculator.display;
    });
  });
}

function handleCalculatorAction(action) {
  const calculator = activeTest.calculator;
  if (/^\d$/.test(action)) {
    calculator.display = calculator.waitingForOperand || calculator.display === "0" ? action : `${calculator.display}${action}`;
    calculator.waitingForOperand = false;
    return;
  }
  if (action === "decimal") {
    if (calculator.waitingForOperand) {
      calculator.display = "0.";
      calculator.waitingForOperand = false;
    } else if (!calculator.display.includes(".")) calculator.display += ".";
    return;
  }
  if (action === "clear") {
    activeTest.calculator = createCalculatorState();
    return;
  }
  if (action === "sign") {
    calculator.display = String(Number(calculator.display) * -1);
    return;
  }
  if (action === "percent") {
    calculator.display = formatCalculation(Number(calculator.display) / 100);
    return;
  }
  if (action === "equals") {
    if (calculator.operator && calculator.storedValue !== null) {
      calculator.display = formatCalculation(calculate(calculator.storedValue, Number(calculator.display), calculator.operator));
      calculator.storedValue = null;
      calculator.operator = null;
      calculator.waitingForOperand = true;
    }
    return;
  }

  const operationMap = { add: "+", subtract: "-", multiply: "*", divide: "/" };
  const nextOperator = operationMap[action];
  if (!nextOperator) return;
  const currentValue = Number(calculator.display);
  if (calculator.operator && !calculator.waitingForOperand && calculator.storedValue !== null) {
    calculator.storedValue = calculate(calculator.storedValue, currentValue, calculator.operator);
    calculator.display = formatCalculation(calculator.storedValue);
  } else calculator.storedValue = currentValue;
  calculator.operator = nextOperator;
  calculator.waitingForOperand = true;
}

function calculate(first, second, operator) {
  if (operator === "+") return first + second;
  if (operator === "-") return first - second;
  if (operator === "*") return first * second;
  if (operator === "/") return second === 0 ? NaN : first / second;
  return second;
}

function formatCalculation(value) {
  if (!Number.isFinite(value)) return "Error";
  return String(Number(value.toPrecision(12)));
}

function submitTest(force = false) {
  if (!activeTest) return;
  const unanswered = activeTest.questions.filter((question) => !activeTest.answers[question.id]).length;
  if (!force && unanswered > 0 && !window.confirm(`Submit with ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}?`)) return;

  stopTimer();
  captureHighlights();
  const trainerId = activeTest.trainerId;
  const logs = getLogs(trainerId);
  const results = activeTest.questions.map((question) => {
    const selected = activeTest.answers[question.id] ?? null;
    const correct = selected === question.answer;
    return { question, selected, correct };
  });

  results.forEach(({ question, selected, correct }) => {
    pushUnique(logs.asked, question.id);
    const payload = {
      id: question.id,
      part: question.part,
      number: question.number,
      prompt: question.prompt,
      options: question.options,
      selected,
      answer: question.answer,
      rationale: question.rationale,
      reasoning: question.reasoning,
      calculation: question.calculation,
      shortcuts: question.shortcuts,
      rules: question.rules,
      figures: question.figures,
      setNumber: question.setNumber,
      timestamp: new Date().toISOString(),
    };
    if (correct) logs.correct.push(payload);
    else logs.wrong.push(payload);
  });

  saveLogs(trainerId, logs);
  renderResults(trainerId, results);
}

function renderResults(trainerId, results) {
  stopTimer();
  document.body.classList.remove("exam-active");
  const trainer = TRAINERS[trainerId];
  const totalCorrect = results.filter((item) => item.correct).length;
  const nextTestSize =
    trainerId === "numerical"
      ? new Set(results.map((item) => item.question.setNumber)).size
      : results.length;
  const partScores = trainer.parts.map((part) => {
    const partResults = results.filter((item) => item.question.part === part);
    const score = partResults.filter((item) => item.correct).length;
    return { part, score, total: partResults.length };
  });

  const breakdown = results
    .map(({ question, selected, correct }) => `
      <article class="log-entry">
        <h3>#${question.number} · ${escapeHtml(question.part)}</h3>
        ${renderQuestionFigures(question, "review")}
        <p><strong>Question:</strong> ${escapeHtml(question.prompt)}</p>
        <p><strong>Your answer:</strong> ${escapeHtml(formatAnswerDisplay(question.options, selected))}</p>
        <p><strong>Correct answer:</strong> ${escapeHtml(formatAnswerDisplay(question.options, question.answer))}</p>
        ${renderExplanation(question, correct ? "" : "wrong")}
      </article>`)
    .join("");

  topActions.innerHTML = "";
  topActions.append(button("Back to home", renderHome, "secondary"));
  app.innerHTML = `
    <section class="panel results-page">
      <p class="eyebrow">${escapeHtml(trainer.eyebrow)}</p>
      <h2>Test complete</h2>
      <p>Total score: <strong>${totalCorrect}/${results.length}</strong></p>
      <div class="results-grid">
        ${partScores.map((item) => `<article class="score-card"><h3>${escapeHtml(item.part)}</h3><p>${item.score}/${item.total}</p></article>`).join("")}
      </div>
      <div class="result-actions">
        ${buttonMarkup("Create fully random test", "new-random")}
        ${buttonMarkup("Create test with new questions", "new-unseen")}
        ${buttonMarkup("Correct answers", "view-correct", "secondary")}
        ${buttonMarkup("Incorrect answers", "view-wrong", "secondary")}
        ${buttonMarkup("Empty log", "clear-log", "danger")}
      </div>
    </section>
    <section class="panel answer-review"><h2>Answer review</h2><div class="log-list">${breakdown}</div></section>
  `;

  app.querySelector("#new-random")?.addEventListener("click", () => startTest(trainerId, "random", nextTestSize));
  app.querySelector("#new-unseen")?.addEventListener("click", () => startTest(trainerId, "new", nextTestSize));
  app.querySelector("#view-correct")?.addEventListener("click", () => renderLog(trainerId, "correct"));
  app.querySelector("#view-wrong")?.addEventListener("click", () => renderLog(trainerId, "wrong"));
  app.querySelector("#clear-log")?.addEventListener("click", () => clearLogs(trainerId));
}

function renderLog(trainerId, kind) {
  stopTimer();
  document.body.classList.remove("exam-active");
  const trainer = TRAINERS[trainerId];
  const entries = getLogs(trainerId)[kind];
  topActions.innerHTML = "";
  topActions.append(button("Back to home", renderHome, "secondary"));

  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${escapeHtml(trainer.eyebrow)}</p>
      <h2>${kind === "correct" ? "Correctly answered questions" : "Incorrectly answered questions"}</h2>
      ${entries.length ? `<div class="log-list">${entries.slice().reverse().map((entry) => `
        <article class="log-entry">
          <h3>#${entry.number} · ${escapeHtml(entry.part)}</h3>
          ${renderQuestionFigures(entry, "review")}
          <p>${escapeHtml(entry.prompt)}</p>
          <p><strong>Your answer:</strong> ${escapeHtml(formatAnswerDisplay(entry.options, entry.selected))}</p>
          <p><strong>Correct answer:</strong> ${escapeHtml(formatAnswerDisplay(entry.options, entry.answer))}</p>
          ${renderExplanation(entry)}
        </article>`).join("")}</div>` : `<p class="empty-state">No entries yet.</p>`}
    </section>`;
}

function renderQuestionBank(trainerId) {
  stopTimer();
  document.body.classList.remove("exam-active");
  document.body.classList.add("home-active");
  const trainer = TRAINERS[trainerId];
  const questionBank = getQuestionBank(trainerId);
  const groups = trainer.parts
    .map((part, index) => ({
      part,
      id: `question-bank-part-${index + 1}`,
      questions: questionBank.filter((question) => question.part === part),
    }))
    .filter((group) => group.questions.length);

  topActions.innerHTML = "";
  topActions.append(button("Back to home", renderHome, "secondary"));
  app.innerHTML = `
    <section class="panel question-bank-page">
      <div class="question-bank-heading">
        <div>
          <p class="eyebrow">${escapeHtml(trainer.eyebrow)}</p>
          <h2>All extracted MCQs</h2>
          <p>Browse all extracted questions by theme, review each correct answer and rationale, or edit individual questions. Saved edits are used in future tests.</p>
        </div>
        <strong>${questionBank.length} questions</strong>
      </div>
      <nav class="question-bank-nav" aria-label="Question bank themes">
        ${groups.map((group) => `<a href="#${group.id}">${escapeHtml(group.part)} <span>${group.questions.length}</span></a>`).join("")}
      </nav>
    </section>
    <div class="question-bank-groups">
      ${groups
        .map(
          (group) => `
            <section class="panel question-bank-group" id="${group.id}">
              <div class="question-bank-group-heading">
                <h2>${escapeHtml(group.part)}</h2>
                <span>${group.questions.length} questions</span>
              </div>
              <div class="question-bank-list">
                ${group.questions.map((question) => renderQuestionBankEntry(question, trainerId)).join("")}
              </div>
            </section>`,
        )
        .join("")}
    </div>`;
  window.scrollTo(0, 0);
}

function renderQuestionBankEntry(question, trainerId) {
  const optionLetters = Object.keys(question.options || {}).sort();
  const isAbstract = trainerId === "abstract";
  return `
    <article class="question-bank-entry" data-trainer-id="${escapeHtml(trainerId)}" data-question-id="${escapeHtml(question.id)}">
      <div class="question-bank-entry-header">
        <p class="question-bank-number">${question.setNumber ? `Set ${escapeHtml(question.setNumber)} · ` : ""}Question #${escapeHtml(question.number)}</p>
        <button type="button" class="question-bank-edit-link" data-question-bank-action="edit" aria-label="Edit question ${escapeHtml(question.number)}">Edit</button>
      </div>
      ${renderQuestionFigures(question, "bank")}
      <h3 class="${isAbstract ? "sr-only" : ""}">${escapeHtml(question.prompt)}</h3>
      ${
        isAbstract
          ? ""
          : `<ol class="question-bank-options">
              ${optionLetters
                .map(
                  (letter) => `
                    <li>
                      <strong>${letter}.</strong>
                      <span>${escapeHtml(question.options[letter])}</span>
                    </li>`,
                )
                .join("")}
            </ol>`
      }
      <details class="question-bank-answer">
        <summary>Show correct answer and rationale</summary>
        <p><strong>Correct answer:</strong> ${escapeHtml(formatAnswerDisplay(question.options, question.answer))}</p>
        ${renderExplanation(question)}
      </details>
    </article>`;
}

function renderQuestionBankEditor(question, trainerId) {
  const optionLetters = Object.keys(question.options || {}).sort();
  const hasStructuredExplanation = ["reasoning", "calculation", "shortcuts"].some((field) =>
    Object.hasOwn(question, field),
  );
  const hasRules = Array.isArray(question.rules) && question.rules.length;
  return `
    <article class="question-bank-entry is-editing" data-trainer-id="${escapeHtml(trainerId)}" data-question-id="${escapeHtml(question.id)}">
      <div class="question-bank-entry-header">
        <p class="question-bank-number">${question.setNumber ? `Set ${escapeHtml(question.setNumber)} · ` : ""}Question #${escapeHtml(question.number)}</p>
        <span class="question-bank-editing-label">Editing</span>
      </div>
      ${renderQuestionFigures(question, "bank")}
      <form class="question-bank-edit-form">
        <label class="question-bank-field">
          <span>Question</span>
          <textarea name="prompt" rows="3" required>${escapeHtml(question.prompt)}</textarea>
        </label>
        <fieldset class="question-bank-option-fields">
          <legend>Answer options</legend>
          ${optionLetters
            .map(
              (letter) => `
                <label class="question-bank-option-field">
                  <strong>${escapeHtml(letter)}.</strong>
                  <textarea name="option-${escapeHtml(letter)}" rows="2" required>${escapeHtml(question.options[letter])}</textarea>
                </label>`,
            )
            .join("")}
        </fieldset>
        <label class="question-bank-field question-bank-answer-field">
          <span>Correct answer</span>
          <select name="answer" required>
            ${optionLetters
              .map(
                (letter) =>
                  `<option value="${escapeHtml(letter)}"${question.answer === letter ? " selected" : ""}>${escapeHtml(letter)}. ${escapeHtml(question.options[letter])}</option>`,
              )
              .join("")}
          </select>
        </label>
        ${
          hasRules
            ? `
              <label class="question-bank-field">
                <span>Rules</span>
                <textarea name="rationale" rows="10">${escapeHtml(question.rationale || "")}</textarea>
              </label>`
            : hasStructuredExplanation
            ? `
              <label class="question-bank-field">
                <span>Reasoning</span>
                <textarea name="reasoning" rows="5">${escapeHtml(question.reasoning || "")}</textarea>
              </label>
              <label class="question-bank-field">
                <span>Calculation</span>
                <textarea name="calculation" rows="6">${escapeHtml(question.calculation || "")}</textarea>
              </label>
              <label class="question-bank-field">
                <span>Potential Shortcuts / Pitfalls</span>
                <textarea name="shortcuts" rows="5">${escapeHtml(question.shortcuts || "")}</textarea>
              </label>`
            : `
              <label class="question-bank-field">
                <span>Rationale</span>
                <textarea name="rationale" rows="7">${escapeHtml(question.rationale || "")}</textarea>
              </label>`
        }
        <div class="question-bank-edit-actions">
          <button type="submit" class="btn">Save changes</button>
          <button type="button" class="btn secondary" data-question-bank-action="cancel">Cancel</button>
        </div>
      </form>
    </article>`;
}

function handleQuestionBankAction(event) {
  const actionButton = event.target.closest("[data-question-bank-action]");
  if (!actionButton) return;
  const entry = actionButton.closest(".question-bank-entry");
  if (!entry) return;
  const trainerId = entry.dataset.trainerId;
  const question = findQuestion(trainerId, entry.dataset.questionId);
  if (!question) return;

  if (actionButton.dataset.questionBankAction === "edit") {
    entry.outerHTML = renderQuestionBankEditor(question, trainerId);
  } else if (actionButton.dataset.questionBankAction === "cancel") {
    entry.outerHTML = renderQuestionBankEntry(question, trainerId);
  }
}

function handleQuestionBankSubmit(event) {
  const form = event.target.closest(".question-bank-edit-form");
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;

  const entry = form.closest(".question-bank-entry");
  const trainerId = entry?.dataset.trainerId;
  const question = findQuestion(trainerId, entry?.dataset.questionId);
  if (!entry || !question) return;

  const optionLetters = Object.keys(question.options || {}).sort();
  const options = Object.fromEntries(
    optionLetters.map((letter) => [letter, form.elements.namedItem(`option-${letter}`).value.trim()]),
  );
  const edits = {
    prompt: form.elements.namedItem("prompt").value.trim(),
    options,
    answer: form.elements.namedItem("answer").value,
  };
  const reasoningField = form.elements.namedItem("reasoning");
  if (reasoningField) {
    edits.reasoning = reasoningField.value.trim();
    edits.calculation = form.elements.namedItem("calculation").value.trim();
    edits.shortcuts = form.elements.namedItem("shortcuts").value.trim();
    edits.rationale = composeStructuredRationale(edits);
  } else {
    edits.rationale = form.elements.namedItem("rationale").value.trim();
    if (Array.isArray(question.rules)) edits.rules = parseRuleRationale(edits.rationale);
  }

  Object.assign(question, edits);
  storeQuestionEdit(trainerId, question.id, edits);
  entry.outerHTML = renderQuestionBankEntry(question, trainerId);
}

function findQuestion(trainerId, questionId) {
  return getQuestionBank(trainerId).find((question) => String(question.id) === String(questionId));
}

function composeStructuredRationale(question) {
  return [
    ["Reasoning", question.reasoning],
    ["Calculation", question.calculation],
    ["Potential Shortcuts / Pitfalls", question.shortcuts],
  ]
    .filter(([, value]) => value)
    .map(([heading, value]) => `${heading}\n${value}`)
    .join("\n\n");
}

function parseRuleRationale(value) {
  const matches = [...value.matchAll(/(?:^|\n)Rule\s+(\d+):\s*([\s\S]*?)(?=\nRule\s+\d+:|$)/g)];
  return matches.map((match) => ({
    label: `Rule ${Number(match[1])}`,
    text: match[2].replaceAll("\n", " ").replace(/\s+/g, " ").trim(),
  }));
}

function applyStoredQuestionEdits(banks) {
  const edits = getStoredQuestionEdits();
  Object.entries(edits).forEach(([trainerId, trainerEdits]) => {
    if (!Array.isArray(banks[trainerId]) || !trainerEdits || typeof trainerEdits !== "object") return;
    banks[trainerId].forEach((question) => {
      const questionEdit = trainerEdits[question.id];
      if (questionEdit && typeof questionEdit === "object") Object.assign(question, questionEdit);
    });
  });
}

function getStoredQuestionEdits() {
  try {
    const edits = JSON.parse(localStorage.getItem(QUESTION_EDIT_STORAGE_KEY) || "{}");
    return edits && typeof edits === "object" && !Array.isArray(edits) ? edits : {};
  } catch {
    return {};
  }
}

function storeQuestionEdit(trainerId, questionId, edits) {
  const storedEdits = getStoredQuestionEdits();
  storedEdits[trainerId] = storedEdits[trainerId] || {};
  storedEdits[trainerId][questionId] = edits;
  localStorage.setItem(QUESTION_EDIT_STORAGE_KEY, JSON.stringify(storedEdits));
}

function clearLogs(trainerId) {
  const keys = getStorageKeys(trainerId);
  localStorage.removeItem(keys.correct);
  localStorage.removeItem(keys.wrong);
  localStorage.removeItem(keys.asked);
  renderHome();
}

function getLogs(trainerId) {
  const keys = getStorageKeys(trainerId);
  return {
    correct: parseStored(keys.correct),
    wrong: parseStored(keys.wrong),
    asked: parseStored(keys.asked),
  };
}

function saveLogs(trainerId, logs) {
  const keys = getStorageKeys(trainerId);
  localStorage.setItem(keys.correct, JSON.stringify(logs.correct));
  localStorage.setItem(keys.wrong, JSON.stringify(logs.wrong));
  localStorage.setItem(keys.asked, JSON.stringify(logs.asked));
}

function parseStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function pickRandom(items, count) {
  const pool = [...items];
  const picked = [];
  while (pool.length && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function pushUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function formatAnswerDisplay(options, letter) {
  if (!letter) return "No answer";
  const text = options?.[letter];
  if (text === `Figure ${letter}`) return letter;
  return text ? `${letter}. ${text}` : letter;
}

function formatMultilineText(value) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function getQuizSetNumber(currentIndex) {
  const sourceSets = activeTest.questions
    .slice(0, currentIndex + 1)
    .map((question) => question.setNumber)
    .filter((setNumber) => setNumber !== undefined && setNumber !== null);
  return new Set(sourceSets).size;
}

function renderQuestionFigures(question, variant = "", quizSetLabel = "") {
  if (!Array.isArray(question.figures) || !question.figures.length) return "";
  const setLabel = question.setNumber ? `Set ${question.setNumber}` : `Question ${question.number}`;
  const isAbstract = question.part === "Abstract Reasoning";
  const caption = isAbstract ? "" : quizSetLabel || `${setLabel} source data`;
  const figureLabel = quizSetLabel || setLabel;
  return `
    <figure class="question-figures ${variant ? `question-figures-${variant}` : ""}">
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
      <div class="question-figure-grid">
        ${question.figures
          .map(
            (source, index) =>
              `<img src="${escapeHtml(source)}" alt="${escapeHtml(figureLabel)} source figure ${index + 1}" loading="${variant === "exam" ? "eager" : "lazy"}" />`,
          )
          .join("")}
      </div>
    </figure>`;
}

function renderExplanation(question, variant = "") {
  if (Array.isArray(question.rules) && question.rules.length) {
    return `
      <div class="rationale abstract-rules ${variant}">
        ${question.rules
          .map(
            (rule) =>
              `<p><strong>${escapeHtml(rule.label)}:</strong> <span>${escapeHtml(rule.text)}</span></p>`,
          )
          .join("")}
      </div>`;
  }
  const structured = question.reasoning || question.calculation || question.shortcuts;
  if (!structured) {
    return `<div class="rationale ${variant}">${formatMultilineText(question.rationale || "No rationale extracted yet.")}</div>`;
  }
  const sections = [
    ["Reasoning", question.reasoning],
    ["Calculation", question.calculation],
    ["Potential Shortcuts / Pitfalls", question.shortcuts],
  ].filter(([, value]) => value);
  return `
    <div class="rationale explanation-sections ${variant}">
      ${sections
        .map(
          ([heading, value]) =>
            `<section><h4>${escapeHtml(heading)}</h4><p>${formatMultilineText(value)}</p></section>`,
        )
        .join("")}
    </div>`;
}

function button(label, onClick, variant = "") {
  const element = document.createElement("button");
  element.className = `btn ${variant}`.trim();
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function buttonMarkup(label, id, variant = "") {
  return `<button type="button" class="btn ${variant}" id="${id}">${label}</button>`;
}

function icon(name) {
  const icons = {
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>',
    highlight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 16 8-11 4 3-8 11H7v-3ZM5 21h14"/></svg>',
    calculator: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6h8v4H8zM8 14h1M12 14h1M16 14h1M8 18h1M12 18h1M16 18h1"/></svg>',
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-3-5 3V3Z"/></svg>',
    "bookmark-small": '<svg class="bookmark-small" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-3-5 3V3Z"/></svg>',
    "arrow-left": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7M8 12h11"/></svg>',
    "arrow-right": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7M5 12h11"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  };
  return icons[name] || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
