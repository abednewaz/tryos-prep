/* TRYOS Prep — Full Length Test (80Q / 100 min). Progress is in-memory only; exit/refresh loses attempt. Completed scores are saved. */
(function () {
  const EXAM_MS = 100 * 60 * 1000;
  const OPTS = ["A", "B", "C", "D", "E"];
  const IQ_PTS = 5.625;
  const MATH_PTS = 6.875;
  const WRONG_PEN = 0.25;
  const MAX_SCORE = 500;

  let BANK = null;
  /** @type {{results: Object<string, object>}} */
  let STATE = { results: {} };
  /** Active attempt lives only in memory — not written to localStorage */
  let ACTIVE = null;
  let tickId = null;

  function t() {
    try { return (window.tx && window.tx()) || {}; } catch (e) { return {}; }
  }
  function e(s) {
    try { return window.esc ? window.esc(String(s ?? "")) : String(s ?? ""); } catch (err) { return String(s ?? ""); }
  }
  function go(name, p) {
    if (window.go) window.go(name, p || {});
  }
  function route() {
    return window.route || { name: "home" };
  }

  async function load() {
    try {
      const r = await fetch("/full/bank.json", { cache: "no-store" });
      if (r.ok) BANK = await r.json();
    } catch (err) {}
    try {
      const raw = JSON.parse(localStorage.getItem("tryos-full-v2") || "null");
      if (raw && raw.results && typeof raw.results === "object") STATE.results = raw.results;
    } catch (err) {}
    ACTIVE = null;
  }

  function saveResults() {
    try { localStorage.setItem("tryos-full-v2", JSON.stringify({ results: STATE.results })); } catch (err) {}
  }

  function mockData(n) {
    if (!BANK || !BANK.mocks) return null;
    return BANK.mocks.find(function (m) { return m.n === +n; }) || null;
  }

  function lastResult(n) {
    return STATE.results[String(n)] || null;
  }

  function remainingMs() {
    if (!ACTIVE || !ACTIVE.endsAt) return EXAM_MS;
    return Math.max(0, ACTIVE.endsAt - Date.now());
  }

  function fmt(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = null; }
  }

  function startTick() {
    stopTick();
    tickId = setInterval(function () {
      if (!ACTIVE || ACTIVE.completed) { stopTick(); return; }
      const left = remainingMs();
      const el = document.getElementById("flTimer");
      if (el) {
        el.textContent = fmt(left);
        el.classList.toggle("warn", left <= 5 * 60 * 1000);
        el.classList.toggle("danger", left <= 60 * 1000);
      }
      if (left <= 0) {
        stopTick();
        submit(ACTIVE.n, true);
      }
    }, 250);
  }

  function pointsFor(q) {
    return q.section === "math" ? MATH_PTS : IQ_PTS;
  }

  function computeScore(d, picks, startedAt, submittedAt) {
    const out = {
      totalMax: MAX_SCORE,
      score: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      mathC: 0, mathW: 0, mathU: 0,
      iqC: 0, iqW: 0, iqU: 0,
      penalty: 0,
      usedMs: 0,
      pct: 0
    };
    if (!d) return out;
    d.questions.forEach(function (q) {
      const p = picks[q.id];
      const isMath = q.section === "math";
      if (!p) {
        out.unanswered++;
        if (isMath) out.mathU++; else out.iqU++;
        return;
      }
      if (p === q.answer) {
        out.correct++;
        out.score += pointsFor(q);
        if (isMath) out.mathC++; else out.iqC++;
      } else {
        out.wrong++;
        out.penalty += WRONG_PEN;
        out.score -= WRONG_PEN;
        if (isMath) out.mathW++; else out.iqW++;
      }
    });
    // round to 3 decimals to avoid float noise
    out.score = Math.round(out.score * 1000) / 1000;
    out.penalty = Math.round(out.penalty * 1000) / 1000;
    if (startedAt && submittedAt) out.usedMs = Math.max(0, submittedAt - startedAt);
    out.pct = Math.round((Math.max(0, out.score) / MAX_SCORE) * 1000) / 10;
    return out;
  }

  function statusLabel(n) {
    const tr = t();
    const res = lastResult(n);
    if (res) return (tr.flCompleted || "Completed") + " · " + (tr.score || "Score") + " " + res.score + "/" + MAX_SCORE;
    return tr.flNotStarted || "Not started";
  }

  function homeView() {
    const tr = t();
    if (!BANK) {
      return '<div class="narrow"><button class="back" type="button" data-go="home">← ' + e(tr.back || "Back") + '</button><p class="eyebrow" style="margin-top:24px">' + e(tr.full || "Full Length") + '</p><h1 class="page">' + e(tr.fullTitle || "Full Length Test") + '</h1><p class="muted">' + e(tr.notReady || "Loading…") + "</p></div>";
    }
    const cards = (BANK.mocks || []).map(function (m) {
      const res = lastResult(m.n);
      const scoreLine = res
        ? '<p class="fl-last-score">' + e(tr.lastScore || "Last score") + ": <b>" + e(res.score) + " / " + MAX_SCORE + "</b> · " + e(res.correct) + " " + e(tr.correct || "correct") + " · " + e(res.wrong) + " " + e(tr.wrong || "wrong") + " · " + e(res.unanswered) + " " + e(tr.unanswered || "unanswered") + "</p>"
        : '<p class="note" style="margin-top:6px">' + e(tr.flNotStarted || "Not started") + "</p>";
      const action = res
        ? 'data-flopenresult="' + m.n + '"'
        : 'data-flrules="' + m.n + '"';
      const label = res ? (tr.viewResult || "View result") : (tr.startExam || "Start exam");
      const retake = res
        ? '<button class="btn ghost" type="button" data-flrules="' + m.n + '" style="margin-top:8px">' + e(tr.retake || "Retake") + "</button>"
        : "";
      return '<article class="rcard" style="margin-top:14px"><div class="review-head" style="align-items:flex-start"><div><p class="eyebrow">' + e(tr.full || "Full Length") + '</p><h2 style="font-size:22px;margin:4px 0 0;font-family:var(--display);font-weight:500">' + e(m.title) + '</h2><p class="muted" style="margin-top:8px">80 ' + e(tr.questions || "questions") + " · 40 IQ · 40 Math · 100 " + e(tr.minutes || "min") + ' · ' + MAX_SCORE + " " + e(tr.marks || "marks") + "</p>" + scoreLine + '</div><div style="display:flex;flex-direction:column;align-items:stretch;gap:0"><button class="btn" type="button" ' + action + ">" + e(label) + "</button>" + retake + "</div></div></article>";
    }).join("");
    return '<div class="narrow"><button class="back" type="button" data-go="home">← ' + e(tr.back || "Back") + '</button><p class="eyebrow" style="margin-top:24px">' + e(tr.full || "Full Length") + '</p><h1 class="page">' + e(tr.fullTitle || "Full Length Test") + '</h1><p class="muted" style="margin-top:10px">' + e(tr.fullIntro || "Three complete timed mocks. 40 IQ then 40 Math. 100 minutes. Total 500 marks.") + "</p>" + cards + "</div>";
  }

  function rulesView(n) {
    const tr = t();
    const m = mockData(n);
    if (!m) return homeView();
    return '<div class="narrow"><button class="back" type="button" data-go="fullHome">← ' + e(tr.back || "Back") + '</button><p class="eyebrow" style="margin-top:24px">' + e(tr.full || "Full Length") + '</p><h1 class="page">' + e(m.title) + '</h1>' +
      '<div class="fl-alert" role="alert">' + e(tr.flGeometryNote || "This exam doesn't contain Geometry. We are very sorry for the inconvenience. We will add the geometry section very soon. This exam doesn't ensure your guaranteed marks in TRYOS. It's just a practice test.") + "</div>" +
      '<div class="about-card" style="margin-top:18px"><p class="eyebrow">' + e(tr.flRules || "Exam instructions") + '</p><ul class="fl-rules">' +
      "<li><b>80</b> " + e(tr.questions || "questions") + " — 40 IQ, then 40 Math</li>" +
      "<li><b>100</b> " + e(tr.minutes || "minutes") + " total</li>" +
      "<li><b>500</b> " + e(tr.marks || "marks") + " max (IQ 45% / Math 55%)</li>" +
      "<li>" + e(tr.flRulePts || "Each IQ question: 5.625 marks. Each Math question: 6.875 marks.") + "</li>" +
      "<li>" + e(tr.flRulePen || "Wrong answer: no marks for that question, plus a 0.25 mark penalty.") + "</li>" +
      "<li>" + e(tr.flRuleMcq || "All questions are multiple choice (A–E).") + "</li>" +
      "<li>" + e(tr.flRuleNav || "You may move between questions and change answers before you submit.") + "</li>" +
      "<li>" + e(tr.flRuleUnans || "Unanswered questions stay unanswered (0 marks, no penalty).") + "</li>" +
      "<li>" + e(tr.flRuleTimer || "The countdown runs until you submit or time ends.") + "</li>" +
      "<li>" + e(tr.flRuleAuto || "When time reaches 00:00 the exam submits automatically.") + "</li>" +
      "<li>" + e(tr.flRuleExit || "Exit, closing the tab, or leaving the page will discard this attempt. Only a finished exam saves your score.") + "</li>" +
      "<li>" + e(tr.flRuleNoKey || "Correct answers are shown only after submission.") + "</li>" +
      "</ul><p class=\"note\" style=\"margin-top:12px\">" + e(tr.flRuleNote || "These are practice-exam instructions for this site, not an official exam board document.") + "</p></div>" +
      '<div class="mrow" style="margin-top:22px"><button class="btn" type="button" data-flstart="' + n + '">' + e(tr.beginExam || "Begin exam") + '</button><button class="btn ghost" type="button" data-go="fullHome">' + e(tr.cancel || "Cancel") + "</button></div></div>";
  }

  function palette(d, picks, i) {
    return '<div class="fl-palette" role="navigation" aria-label="Questions">' + d.questions.map(function (q, idx) {
      const ans = picks[q.id];
      const cls = ["fl-dot"];
      if (idx === i) cls.push("cur");
      if (ans) cls.push("ans");
      else cls.push("open");
      return '<button type="button" class="' + cls.join(" ") + '" data-fljump="' + idx + '">' + (idx + 1) + "</button>";
    }).join("") + "</div>";
  }

  function quizView(n) {
    const tr = t();
    const d = mockData(n);
    if (!d) return homeView();
    if (!ACTIVE || ACTIVE.n !== +n || ACTIVE.completed) {
      return rulesView(n);
    }
    const i = Math.max(0, Math.min(ACTIVE.index, d.questions.length - 1));
    const q = d.questions[i];
    const pick = ACTIVE.picks[q.id] || null;
    const secNo = q.section === "iq" ? i + 1 : i - 39;
    const secLabel = q.section === "math" ? (tr.math || "Math") : (tr.iq || "IQ");
    const left = remainingMs();
    const answered = Object.keys(ACTIVE.picks).length;
    const opts = OPTS.map(function (k) {
      return '<button class="iqopt ' + (pick === k ? "sel" : "") + '" type="button" data-flopt="' + k + '"><span class="k">' + k + '</span><span>' + (pick === k ? (tr.selected || "Selected") : "") + "</span></button>";
    }).join("");
    const last = i === d.questions.length - 1;
    setTimeout(startTick, 0);
    return '<div class="narrow fl-exam"><div class="qbar fl-qbar"><button class="back" type="button" data-flexit="1">‹ ' + e(tr.exit || "Exit") + '</button>' +
      '<span class="fl-timer-wrap"><span class="eyebrow">' + e(tr.timeLeft || "Time") + '</span> <strong id="flTimer" class="fl-timer' + (left <= 60000 ? " danger" : left <= 300000 ? " warn" : "") + '">' + e(fmt(left)) + "</strong></span></div>" +
      '<p class="fl-meta">' + e(secLabel) + " — " + e(tr.question || "Question") + " " + secNo + " " + e(tr.of || "of") + " 40 · " + e(tr.question || "Question") + " " + (i + 1) + " / 80 · " + answered + " " + e(tr.answered || "answered") + "</p>" +
      palette(d, ACTIVE.picks, i) +
      '<article style="margin-top:12px"><div class="iqpaper"><img class="iqimg" src="' + e(q.img) + '" alt="Question ' + (i + 1) + '" loading="eager"></div>' +
      '<div class="dock"><div class="iqopts">' + opts + '</div><div class="iqnav">' +
      '<button class="btn outline" type="button" data-flprev="1"' + (i === 0 ? " disabled" : "") + ">‹ " + e(tr.previous || "Previous") + "</button>" +
      (last
        ? '<button class="btn" type="button" data-flconfirm="1">' + e(tr.submitExam || "Submit exam") + "</button>"
        : '<button class="btn" type="button" data-flnext="1">' + e(tr.next || "Next") + " ›</button>") +
      "</div></div></article></div>";
  }

  function confirmView(n) {
    const tr = t();
    const d = mockData(n);
    if (!d || !ACTIVE || ACTIVE.n !== +n) return homeView();
    const unanswered = d.questions.filter(function (q) { return !ACTIVE.picks[q.id]; }).length;
    const msg = unanswered
      ? (tr.flConfirmUnans || "You still have X unanswered questions. Submit anyway?").replace("X", String(unanswered))
      : (tr.flConfirmAll || "You answered every question. Submit the exam?");
    return '<div class="narrow"><button class="back" type="button" data-flresume="' + n + '">← ' + e(tr.back || "Back") + '</button><p class="eyebrow" style="margin-top:24px">' + e(tr.full || "Full Length") + '</p><h1 class="page">' + e(tr.submitExam || "Submit exam") + '</h1><p class="muted" style="margin-top:12px">' + e(msg) + '</p><div class="mrow" style="margin-top:22px"><button class="btn" type="button" data-flsubmit="' + n + '">' + e(tr.confirmSubmit || "Yes, submit") + '</button><button class="btn ghost" type="button" data-flresume="' + n + '">' + e(tr.keepWorking || "Keep working") + "</button></div></div>";
  }

  function resultView(n) {
    const tr = t();
    const d = mockData(n);
    const res = lastResult(n);
    if (!d || !res) return homeView();
    const used = fmt(res.usedMs || 0);
    return '<div class="narrow"><button class="back" type="button" data-go="fullHome">← ' + e(tr.full || "Full Length") + '</button><p class="eyebrow" style="margin-top:24px">' + e(d.title) + '</p><h1 class="page">' + e(tr.result || "Result") + '</h1>' +
      '<div class="stats" style="margin-top:24px">' +
      '<div class="stat"><p class="eyebrow">' + e(tr.score || "Score") + "</p><p>" + e(res.score) + "/" + MAX_SCORE + "</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.correct || "Correct") + "</p><p>" + res.correct + "</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.wrong || "Wrong") + "</p><p>" + res.wrong + "</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.unanswered || "Unanswered") + "</p><p>" + res.unanswered + "</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.penalty || "Penalty") + "</p><p>−" + e(res.penalty) + "</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.accuracy || "Accuracy") + "</p><p>" + e(res.pct) + "%</p></div>" +
      '<div class="stat"><p class="eyebrow">' + e(tr.timeUsed || "Time used") + "</p><p>" + used + "</p></div>" +
      "</div>" +
      '<div class="about-card" style="margin-top:18px"><p class="eyebrow">IQ (45%)</p><p class="muted">' + e(tr.correct || "Correct") + ": " + res.iqC + " · " + e(tr.wrong || "Wrong") + ": " + res.iqW + " · " + e(tr.unanswered || "Unanswered") + ": " + res.iqU + "</p>" +
      '<p class="eyebrow" style="margin-top:12px">Math (55%)</p><p class="muted">' + e(tr.correct || "Correct") + ": " + res.mathC + " · " + e(tr.wrong || "Wrong") + ": " + res.mathW + " · " + e(tr.unanswered || "Unanswered") + ": " + res.mathU + "</p></div>" +
      '<div class="mrow" style="margin-top:22px"><button class="btn" type="button" data-flreview="1">' + e(tr.reviewAnswers || "Review answers") + '</button><button class="btn ghost" type="button" data-flrules="' + n + '">' + e(tr.retake || "Retake") + "</button></div></div>";
  }

  function reviewView(n) {
    const tr = t();
    const d = mockData(n);
    const res = lastResult(n);
    if (!d || !res || !res.picks) return homeView();
    const picks = res.picks;
    const idx = Math.max(0, Math.min(res.reviewIndex || 0, d.questions.length - 1));
    const q = d.questions[idx];
    const p = picks[q.id] || null;
    const ok = p && p === q.answer;
    const status = !p ? (tr.unanswered || "Unanswered") : (ok ? (tr.correct || "Correct") : (tr.wrong || "Wrong"));
    const badge = !p ? "open" : (ok ? "ok" : "bad");
    const opts = OPTS.map(function (k) {
      const cls = ["iqopt"];
      if (k === q.answer) cls.push("ok");
      if (p === k && k !== q.answer) cls.push("bad");
      if (p === k) cls.push("sel");
      return '<button class="' + cls.join(" ") + '" type="button" disabled><span class="k">' + k + '</span><span>' +
        (k === q.answer ? (tr.correct || "Correct") : (p === k ? (tr.yourPick || "Your answer") : "")) +
        "</span></button>";
    }).join("");
    return '<div class="narrow"><div class="qbar"><button class="back" type="button" data-go="fullResult">‹ ' + e(tr.result || "Result") + '</button><span>' + e(tr.review || "Review") + " · " + (idx + 1) + "/80</span></div>" +
      '<p class="fl-meta"><span class="fl-badge ' + badge + '">' + e(status) + "</span> · " + e(q.section === "math" ? (tr.math || "Math") : (tr.iq || "IQ")) + "</p>" +
      '<article style="margin-top:12px"><div class="iqpaper"><img class="iqimg" src="' + e(q.img) + '" alt="Question ' + (idx + 1) + '" loading="eager"></div>' +
      '<div class="dock"><div class="iqopts">' + opts + '</div><div class="iqnav">' +
      '<button class="btn outline" type="button" data-flrevprev="1"' + (idx === 0 ? " disabled" : "") + ">‹ " + e(tr.previous || "Previous") + "</button>" +
      '<button class="btn" type="button" data-flrevnext="1">' + (idx === d.questions.length - 1 ? e(tr.result || "Result") : e(tr.next || "Next") + " ›") + "</button>" +
      "</div></div></article>" +
      '<div class="fl-palette" style="margin-top:14px">' + d.questions.map(function (qq, i2) {
        const pp = picks[qq.id];
        const cls = ["fl-dot"];
        if (i2 === idx) cls.push("cur");
        if (!pp) cls.push("open");
        else if (pp === qq.answer) cls.push("ok");
        else cls.push("bad");
        return '<button type="button" class="' + cls.join(" ") + '" data-flrevjump="' + i2 + '">' + (i2 + 1) + "</button>";
      }).join("") + "</div></div>";
  }

  function view(name) {
    const r = route();
    const n = r.test || 1;
    if (name === "fullHome") return homeView();
    if (name === "fullRules") return rulesView(n);
    if (name === "fullQuiz") return quizView(n);
    if (name === "fullConfirm") return confirmView(n);
    if (name === "fullResult") return resultView(n);
    if (name === "fullReview") return reviewView(n);
    return homeView();
  }

  function discardActive() {
    stopTick();
    ACTIVE = null;
  }

  function start(n) {
    n = +n;
    const d = mockData(n);
    if (!d) return go("fullHome");
    const now = Date.now();
    ACTIVE = {
      n: n,
      index: 0,
      picks: {},
      startedAt: now,
      endsAt: now + EXAM_MS,
      completed: false
    };
    go("fullQuiz", { test: n });
  }

  function submit(n, auto) {
    n = +n;
    const d = mockData(n);
    if (!d || !ACTIVE || ACTIVE.n !== n) return go("fullHome");
    const submittedAt = Date.now();
    const scored = computeScore(d, ACTIVE.picks, ACTIVE.startedAt, submittedAt);
    STATE.results[String(n)] = {
      score: scored.score,
      correct: scored.correct,
      wrong: scored.wrong,
      unanswered: scored.unanswered,
      mathC: scored.mathC, mathW: scored.mathW, mathU: scored.mathU,
      iqC: scored.iqC, iqW: scored.iqW, iqU: scored.iqU,
      penalty: scored.penalty,
      usedMs: scored.usedMs,
      pct: scored.pct,
      picks: Object.assign({}, ACTIVE.picks),
      reviewIndex: 0,
      submittedAt: submittedAt,
      autoSubmit: !!auto
    };
    saveResults();
    discardActive();
    go("fullResult", { test: n });
  }

  function onClick(d) {
    if (d.flrules !== undefined) {
      discardActive();
      return go("fullRules", { test: +d.flrules });
    }
    if (d.flstart !== undefined) return start(+d.flstart);
    if (d.flexit !== undefined) {
      discardActive();
      return go("fullHome");
    }
    if (d.flresume !== undefined) {
      if (ACTIVE && ACTIVE.n === +d.flresume && !ACTIVE.completed) return go("fullQuiz", { test: +d.flresume });
      return go("fullHome");
    }
    if (d.flopenresult !== undefined) return go("fullResult", { test: +d.flopenresult });
    if (d.flopt !== undefined) {
      if (!ACTIVE || ACTIVE.completed) return;
      if (remainingMs() <= 0) return submit(ACTIVE.n, true);
      const dta = mockData(ACTIVE.n);
      if (!dta) return;
      const q = dta.questions[ACTIVE.index];
      ACTIVE.picks[q.id] = d.flopt;
      if (window.render) window.render();
      return;
    }
    if (d.flnext !== undefined) {
      if (!ACTIVE || ACTIVE.completed) return;
      const dta = mockData(ACTIVE.n);
      if (!dta) return;
      if (ACTIVE.index < dta.questions.length - 1) {
        ACTIVE.index++;
        if (window.render) window.render();
      } else go("fullConfirm", { test: ACTIVE.n });
      return;
    }
    if (d.flprev !== undefined) {
      if (!ACTIVE) return;
      ACTIVE.index = Math.max(0, ACTIVE.index - 1);
      if (window.render) window.render();
      return;
    }
    if (d.fljump !== undefined) {
      if (!ACTIVE) return;
      ACTIVE.index = +d.fljump;
      if (window.render) window.render();
      return;
    }
    if (d.flconfirm !== undefined) {
      if (!ACTIVE) return go("fullHome");
      return go("fullConfirm", { test: ACTIVE.n });
    }
    if (d.flsubmit !== undefined) return submit(+d.flsubmit, false);
    if (d.flreview !== undefined) {
      const n = route().test;
      const res = lastResult(n);
      if (!res) return go("fullHome");
      res.reviewIndex = 0;
      saveResults();
      return go("fullReview", { test: n });
    }
    if (d.flrevprev !== undefined) {
      const res = lastResult(route().test);
      if (!res) return;
      res.reviewIndex = Math.max(0, (res.reviewIndex || 0) - 1);
      saveResults();
      if (window.render) window.render();
      return;
    }
    if (d.flrevnext !== undefined) {
      const n = route().test;
      const dta = mockData(n);
      const res = lastResult(n);
      if (!res || !dta) return;
      if ((res.reviewIndex || 0) < dta.questions.length - 1) {
        res.reviewIndex = (res.reviewIndex || 0) + 1;
        saveResults();
        if (window.render) window.render();
      } else go("fullResult", { test: n });
      return;
    }
    if (d.flrevjump !== undefined) {
      const res = lastResult(route().test);
      if (!res) return;
      res.reviewIndex = +d.flrevjump;
      saveResults();
      if (window.render) window.render();
      return;
    }
  }

  function afterRender() {
    if (route().name === "fullQuiz" && ACTIVE && !ACTIVE.completed) startTick();
    else stopTick();
  }

  window.TRYOSFull = {
    load: load,
    view: view,
    onClick: onClick,
    afterRender: afterRender,
    stopTick: stopTick,
    discardActive: discardActive
  };
})();
