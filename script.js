/**
 * AI Homework Solver — script.js
 * Features: AI solving, steps toggle, ELI10, copy, PDF download,
 *           voice input, dark mode, localStorage history, word count
 */

// ── CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  MAX_WORDS:     500,
  MAX_HISTORY:   10,
  STORAGE_KEY:   'homeworkai_history',
  THEME_KEY:     'homeworkai_theme',
  // Replace with your real API key — never expose in production!
  // For production: proxy through your own backend server.
  OPENAI_KEY:    '',   // e.g. 'sk-...'  (leave empty to use demo mode)
  DEMO_MODE:     true, // set false when using real API
};

// ── DOM REFS ──────────────────────────────────────────────────────
const DOM = {
  input:         () => document.getElementById('questionInput'),
  subject:       () => document.getElementById('subject'),
  solveBtn:      () => document.getElementById('solveBtn'),
  clearBtn:      () => document.getElementById('clearBtn'),
  solveText:     () => document.querySelector('.solve-text'),
  solveLoading:  () => document.querySelector('.solve-loading'),
  errorBanner:   () => document.getElementById('errorBanner'),
  errorMsg:      () => document.getElementById('errorMsg'),
  outputSection: () => document.getElementById('outputSection'),
  outputTag:     () => document.getElementById('outputSubjectTag'),
  stepsList:     () => document.getElementById('stepsList'),
  stepsSection:  () => document.getElementById('stepsSection'),
  finalAnswer:   () => document.getElementById('finalAnswer'),
  simpleText:    () => document.getElementById('simpleText'),
  eli10Section:  () => document.getElementById('eli10Section'),
  eli10Text:     () => document.getElementById('eli10Text'),
  eli10Btn:      () => document.getElementById('eli10Btn'),
  copyBtn:       () => document.getElementById('copyBtn'),
  downloadBtn:   () => document.getElementById('downloadBtn'),
  wordCount:     () => document.getElementById('wordCount'),
  voiceBtn:      () => document.getElementById('voiceBtn'),
  showSteps:     () => document.getElementById('showSteps'),
  eli10Mode:     () => document.getElementById('eli10Mode'),
  historyList:   () => document.getElementById('historyList'),
  clearHistory:  () => document.getElementById('clearHistoryBtn'),
  themeToggle:   () => document.getElementById('themeToggle'),
  themeIcon:     () => document.querySelector('.theme-icon'),
};

// ── APP STATE ─────────────────────────────────────────────────────
let currentAnswer = null;  // { steps, finalAnswer, simpleExplanation, eli10 }
let isListening   = false;
let recognition   = null;

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initHistory();
  initVoice();
  bindEvents();
});

// ── EVENT BINDINGS ────────────────────────────────────────────────
function bindEvents() {
  DOM.input().addEventListener('input',   handleInputChange);
  DOM.solveBtn().addEventListener('click',  handleSolve);
  DOM.clearBtn().addEventListener('click',  handleClear);
  DOM.copyBtn().addEventListener('click',   handleCopy);
  DOM.downloadBtn().addEventListener('click', handleDownload);
  DOM.eli10Btn().addEventListener('click',  handleELI10);
  DOM.voiceBtn().addEventListener('click',  handleVoice);
  DOM.themeToggle().addEventListener('click', toggleTheme);
  DOM.clearHistory().addEventListener('click', clearHistory);
  DOM.showSteps().addEventListener('change', toggleStepsView);
  DOM.eli10Mode().addEventListener('change', () => {
    if (DOM.eli10Mode().checked && currentAnswer) showELI10();
  });
  // Allow Ctrl+Enter to solve
  DOM.input().addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSolve();
  });
}

// ── WORD / CHAR COUNT ─────────────────────────────────────────────
function handleInputChange() {
  const text  = DOM.input().value;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const el    = DOM.wordCount();
  el.textContent = `${words} / ${CONFIG.MAX_WORDS} words`;
  el.className = 'word-count';
  if (words > CONFIG.MAX_WORDS * 0.85) el.classList.add('near-limit');
  if (words >= CONFIG.MAX_WORDS)        el.classList.add('at-limit');
  hideError();
}

function getWordCount(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

// ── SOLVE HANDLER ─────────────────────────────────────────────────
async function handleSolve() {
  const question = DOM.input().value.trim();
  const subject  = DOM.subject().value;

  // Validation
  if (!question) { showError('Please enter a question before solving.'); return; }
  if (getWordCount(question) > CONFIG.MAX_WORDS) {
    showError(`Question exceeds ${CONFIG.MAX_WORDS} words. Please shorten it (free plan limit).`);
    return;
  }

  hideError();
  setLoading(true);
  hideOutput();

  try {
    let answer;
    if (CONFIG.DEMO_MODE || !CONFIG.OPENAI_KEY) {
      answer = await getDemoAnswer(question, subject);
    } else {
      answer = await getAIAnswer(question, subject);
    }

    currentAnswer = answer;
    renderAnswer(answer, subject);
    saveToHistory(question, subject);
    renderHistory();

    // Auto-trigger ELI10 if mode is on
    if (DOM.eli10Mode().checked) showELI10();

  } catch (err) {
    showError('Something went wrong. Please try again. (' + err.message + ')');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ── REAL AI CALL (OpenAI) ─────────────────────────────────────────
async function getAIAnswer(question, subject) {
  const systemPrompt = buildSystemPrompt(subject);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'API error');
  }

  const data = await response.json();
  const raw  = data.choices[0].message.content;
  return parseAIResponse(raw);
}

// Build the system prompt based on subject
function buildSystemPrompt(subject) {
  const subjectInstructions = {
    math: 'Show all mathematical formulas and calculations. Use clear notation.',
    science: 'Include relevant scientific principles, laws, and real-world examples.',
    english: 'Focus on grammar rules, literary analysis, or writing techniques as appropriate.',
    history: 'Include dates, key figures, and causes/effects. Put events in context.',
    cs: 'Include code examples where helpful. Explain algorithms step by step.',
  };
  return `You are a friendly, expert homework tutor for students. 
Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "steps": ["step 1 text", "step 2 text", "step 3 text"],
  "finalAnswer": "The clear, highlighted final answer",
  "simpleExplanation": "A short, student-friendly summary of the concept",
  "eli10": "Explain this like the student is 10 years old, using a fun analogy or simple story"
}

Rules:
- Always break into 3-6 clear steps
- Use simple student-friendly language
- ${subjectInstructions[subject] || ''}
- Highlight the final answer clearly
- Keep eli10 fun, relatable, and under 3 sentences`;
}

// Parse JSON response from AI
function parseAIResponse(raw) {
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: wrap raw response
    return {
      steps: ['The AI provided a response that could not be parsed into steps.', raw],
      finalAnswer: raw,
      simpleExplanation: raw,
      eli10: raw,
    };
  }
}

// ── DEMO MODE ANSWERS ─────────────────────────────────────────────
// Used when no API key is provided — shows realistic dummy responses
async function getDemoAnswer(question, subject) {
  // Simulate network delay
  await new Promise(r => setTimeout(r, 1400 + Math.random() * 800));

  const demos = {
    math: {
      steps: [
        'Identify the type of problem. This appears to be a linear equation.',
        'Isolate the variable by moving constants to one side: <code>2x = 15 - 5</code>',
        'Simplify the right side: <code>2x = 10</code>',
        'Divide both sides by the coefficient of x: <code>x = 10 ÷ 2</code>',
        'Verify by substituting back into the original equation: <code>2(5) + 5 = 15 ✓</code>',
      ],
      finalAnswer: '✅ x = 5',
      simpleExplanation: 'We solved for x by performing the same operation on both sides of the equation to keep it balanced, then simplified to find the value of x.',
      eli10: 'Think of it like a seesaw! Both sides must stay equal. We moved the numbers around step by step, always doing the same thing to both sides — just like if you add a rock to one side of a seesaw, you add the same rock to the other side!',
    },
    science: {
      steps: [
        'Define the concept: Photosynthesis is the process plants use to make food.',
        'Identify the inputs: Plants need sunlight, water (H₂O), and carbon dioxide (CO₂).',
        'The chemical equation: <code>6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂</code>',
        'Understand the two stages: Light-dependent reactions (in thylakoids) and the Calvin Cycle (in stroma).',
        'Identify the outputs: Glucose (sugar for energy) and oxygen (released into air).',
      ],
      finalAnswer: '✅ Photosynthesis converts light energy, CO₂, and water into glucose (food) and oxygen using chlorophyll in plant cells.',
      simpleExplanation: 'Photosynthesis is how plants "eat." They capture sunlight with their green pigment (chlorophyll) and use it to turn CO₂ from the air and water from the soil into glucose for energy, releasing oxygen as a byproduct.',
      eli10: 'Imagine plants have tiny solar panels in their leaves called chlorophyll. When sunlight hits them, the plant uses that energy to cook up its own food — like making a smoothie out of water and air! And the leftover stuff? That\'s the oxygen we breathe. Pretty cool, right?',
    },
    english: {
      steps: [
        'Identify the grammatical structure of the sentence in question.',
        'Look for the subject (who/what the sentence is about).',
        'Identify the predicate (what the subject is doing or being).',
        'Check agreement: subject and verb must match in number (singular/plural).',
        'Review punctuation rules for the sentence type (declarative, interrogative, etc.).',
      ],
      finalAnswer: '✅ The sentence follows correct Subject-Verb-Object structure with proper punctuation.',
      simpleExplanation: 'In English grammar, every sentence needs a subject and a verb that agree with each other. The subject tells us who/what, the verb tells us the action, and the object receives that action.',
      eli10: 'A sentence is like a mini-story! It needs a hero (the subject), something the hero does (the verb), and sometimes something the hero does it to (the object). Without all of these, the story feels incomplete!',
    },
    history: {
      steps: [
        'Set the scene: Identify the time period and geographic location.',
        'Identify the key figures and nations involved.',
        'Examine the long-term causes (MAIN: Militarism, Alliances, Imperialism, Nationalism).',
        'Identify the immediate trigger: The assassination of Archduke Franz Ferdinand (June 28, 1914).',
        'Trace the chain reaction: how alliance systems pulled nations into the conflict.',
        'Assess the outcomes: 4 years of war, ~20 million deaths, redrawing of European borders.',
      ],
      finalAnswer: '✅ WWI was caused by a combination of nationalism, military buildup, alliance systems, and imperialism — triggered by the assassination of Archduke Franz Ferdinand in 1914.',
      simpleExplanation: 'WWI had both deep underlying causes (MAIN factors) and an immediate trigger. The alliance system meant that when one country went to war, others were pulled in like a chain reaction.',
      eli10: 'Imagine Europe was like a school playground full of rival friend groups. Everyone had made promises to back each other up in a fight. Then one bully did something really bad (the assassination), and suddenly ALL the friend groups were fighting everyone else — even kids who didn\'t want to fight had to because of their promises!',
    },
    cs: {
      steps: [
        'Understand the problem: Identify inputs, outputs, and constraints.',
        'Choose the right data structure: arrays for ordered data, objects/dicts for key-value pairs.',
        'Write the algorithm in pseudocode first before coding.',
        'Implement the solution: <code>function solve(input) { ... }</code>',
        'Test with edge cases: empty input, very large values, unexpected types.',
        'Analyze time complexity: is it O(n), O(n²), or better?',
      ],
      finalAnswer: '✅ Break the problem into steps, implement cleanly, and always test edge cases.',
      simpleExplanation: 'Good programming is about breaking complex problems into small, manageable steps. Start with pseudocode, then translate to real code, and always consider what could go wrong.',
      eli10: 'Writing code is like giving instructions to a very literal robot. You have to be super specific — the robot does EXACTLY what you say, nothing more. So you have to think of every possible situation, even weird ones, and tell the robot what to do in each one!',
    },
  };

  return demos[subject] || demos.math;
}

// ── RENDER ANSWER ─────────────────────────────────────────────────
function renderAnswer(answer, subject) {
  const subjectLabels = {
    math: '📐 Mathematics', science: '🔬 Science',
    english: '📖 English', history: '🏛️ History', cs: '💻 Computer Science',
  };

  // Set subject tag
  DOM.outputTag().textContent = subjectLabels[subject] || subject;

  // Render steps
  const stepsList = DOM.stepsList();
  stepsList.innerHTML = '';
  if (answer.steps && answer.steps.length) {
    answer.steps.forEach((step, i) => {
      const el = document.createElement('div');
      el.className = 'step-item';
      el.style.animationDelay = `${i * 0.08}s`;
      el.innerHTML = `
        <div class="step-num">${i + 1}</div>
        <div class="step-content">${step}</div>
      `;
      stepsList.appendChild(el);
    });
  }

  // Toggle steps visibility
  DOM.stepsSection().style.display = DOM.showSteps().checked ? 'block' : 'none';

  // Final answer
  DOM.finalAnswer().innerHTML = answer.finalAnswer || 'See steps above.';

  // Simple explanation
  DOM.simpleText().textContent = answer.simpleExplanation || '';

  // Hide ELI10 initially
  DOM.eli10Section().style.display = 'none';

  // Show output
  DOM.outputSection().style.display = 'block';
  DOM.outputSection().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── TOGGLE STEPS VIEW ─────────────────────────────────────────────
function toggleStepsView() {
  if (!currentAnswer) return;
  DOM.stepsSection().style.display = DOM.showSteps().checked ? 'block' : 'none';
}

// ── ELI10 ─────────────────────────────────────────────────────────
function showELI10() {
  if (!currentAnswer?.eli10) return;
  DOM.eli10Text().textContent = currentAnswer.eli10;
  DOM.eli10Section().style.display = 'block';
  DOM.eli10Section().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleELI10() {
  if (!currentAnswer) { showError('Solve a question first to use ELI10.'); return; }
  const visible = DOM.eli10Section().style.display !== 'none';
  if (visible) {
    DOM.eli10Section().style.display = 'none';
    DOM.eli10Btn().textContent = '🧒 ELI10';
  } else {
    showELI10();
    DOM.eli10Btn().textContent = '🧒 Hide ELI10';
  }
}

// ── COPY ──────────────────────────────────────────────────────────
async function handleCopy() {
  if (!currentAnswer) return;
  const text = buildPlainText(currentAnswer);
  try {
    await navigator.clipboard.writeText(text);
    showToast('✅ Answer copied to clipboard!', 'success');
  } catch {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    showToast('✅ Answer copied!', 'success');
  }
}

function buildPlainText(answer) {
  let text = '--- AI Homework Solver ---\n\n';
  text += 'QUESTION:\n' + DOM.input().value + '\n\n';
  text += 'STEPS:\n';
  (answer.steps || []).forEach((s, i) => {
    text += `${i + 1}. ${s.replace(/<[^>]+>/g, '')}\n`;
  });
  text += '\nFINAL ANSWER:\n' + (answer.finalAnswer || '').replace(/<[^>]+>/g, '') + '\n\n';
  text += 'SIMPLE EXPLANATION:\n' + (answer.simpleExplanation || '') + '\n\n';
  text += 'ELI10:\n' + (answer.eli10 || '') + '\n\n';
  text += 'Generated by HomeworkAI — homeworkai.app';
  return text;
}

// ── PDF DOWNLOAD ──────────────────────────────────────────────────
function handleDownload() {
  if (!currentAnswer) return;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const margin = 20;
    const usable = pageW - margin * 2;
    let   y      = 20;

    // Helper: add wrapped text, returns new y
    function addText(text, x, startY, opts = {}) {
      const { fontSize = 11, color = [30,30,30], fontStyle = 'normal', maxW = usable } = opts;
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.setFont('helvetica', fontStyle);
      const lines = doc.splitTextToSize(String(text).replace(/<[^>]+>/g, ''), maxW);
      lines.forEach(line => {
        if (startY > 275) { doc.addPage(); startY = 20; }
        doc.text(line, x, startY);
        startY += fontSize * 0.5 + 2;
      });
      return startY + 3;
    }

    // Header bar
    doc.setFillColor(79, 110, 247);
    doc.roundedRect(0, 0, pageW, 18, 0, 0, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('🧠 AI Homework Solver', margin, 12);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString(), pageW - margin - 20, 12);
    y = 26;

    // Question
    y = addText('QUESTION', margin, y, { fontSize: 8, color: [120, 120, 180], fontStyle: 'bold' });
    y = addText(DOM.input().value, margin, y, { fontSize: 11, color: [20, 20, 50] });
    y += 4;

    // Divider
    doc.setDrawColor(200, 210, 240);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // Steps
    y = addText('STEP-BY-STEP SOLUTION', margin, y, { fontSize: 8, color: [120, 120, 180], fontStyle: 'bold' });
    (currentAnswer.steps || []).forEach((step, i) => {
      const clean = step.replace(/<[^>]+>/g, '');
      if (y > 270) { doc.addPage(); y = 20; }
      // Step number circle
      doc.setFillColor(79, 110, 247);
      doc.circle(margin + 3, y - 2, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), margin + 3, y - 0.5, { align: 'center' });
      y = addText(clean, margin + 10, y, { fontSize: 10, color: [50, 60, 90] });
      y += 1;
    });
    y += 2;

    // Final Answer box
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(margin, y - 3, usable, 18, 3, 3, 'F');
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y - 3, usable, 18, 3, 3, 'S');
    y = addText('FINAL ANSWER: ' + (currentAnswer.finalAnswer || '').replace(/<[^>]+>/g, ''), margin + 4, y + 4, {
      fontSize: 11, color: [5, 120, 80], fontStyle: 'bold',
    });
    y += 6;

    // Simple explanation
    y = addText('SIMPLE EXPLANATION', margin, y, { fontSize: 8, color: [120, 120, 180], fontStyle: 'bold' });
    y = addText(currentAnswer.simpleExplanation || '', margin, y, { fontSize: 10, color: [70, 80, 110] });
    y += 4;

    // ELI10
    if (currentAnswer.eli10) {
      y = addText('EXPLAIN LIKE I\'M 10', margin, y, { fontSize: 8, color: [120, 120, 180], fontStyle: 'bold' });
      y = addText(currentAnswer.eli10, margin, y, { fontSize: 10, color: [70, 80, 110], fontStyle: 'italic' });
    }

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 200);
      doc.text(`HomeworkAI · Generated ${new Date().toLocaleDateString()} · Page ${p} of ${totalPages}`, pageW / 2, 290, { align: 'center' });
    }

    doc.save('homework-solution.pdf');
    showToast('⬇️ PDF downloaded!', 'success');
  } catch (err) {
    showToast('❌ PDF download failed. Try again.', 'error');
    console.error(err);
  }
}

// ── VOICE INPUT ───────────────────────────────────────────────────
function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    DOM.voiceBtn().style.display = 'none';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript).join('');
    DOM.input().value = transcript;
    handleInputChange();
  };
  recognition.onend = () => {
    isListening = false;
    DOM.voiceBtn().classList.remove('listening');
    DOM.voiceBtn().innerHTML = '🎤 <span class="voice-label">Speak</span>';
  };
  recognition.onerror = (e) => {
    isListening = false;
    DOM.voiceBtn().classList.remove('listening');
    DOM.voiceBtn().innerHTML = '🎤 <span class="voice-label">Speak</span>';
    if (e.error !== 'aborted') showToast('🎤 Voice input error: ' + e.error, 'error');
  };
}

function handleVoice() {
  if (!recognition) { showToast('🎤 Voice not supported in this browser.', 'error'); return; }
  if (isListening) {
    recognition.stop();
  } else {
    isListening = true;
    DOM.voiceBtn().classList.add('listening');
    DOM.voiceBtn().innerHTML = '🔴 <span class="voice-label">Listening...</span>';
    recognition.start();
  }
}

// ── CLEAR ─────────────────────────────────────────────────────────
function handleClear() {
  DOM.input().value = '';
  handleInputChange();
  hideOutput();
  hideError();
  currentAnswer = null;
  DOM.eli10Btn().textContent = '🧒 ELI10';
}

// ── THEME ─────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(CONFIG.THEME_KEY) || 'light';
  applyTheme(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  DOM.themeIcon().textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(CONFIG.THEME_KEY, theme);
}

// ── HISTORY ───────────────────────────────────────────────────────
function initHistory() {
  renderHistory();
}
function saveToHistory(question, subject) {
  const history = getHistory();
  const entry = {
    id:       Date.now(),
    question: question.slice(0, 120),
    subject,
    time:     new Date().toLocaleString(),
  };
  history.unshift(entry);
  if (history.length > CONFIG.MAX_HISTORY) history.pop();
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(history));
}
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '[]');
  } catch { return []; }
}
function renderHistory() {
  const history = getHistory();
  const list    = DOM.historyList();
  const labels  = { math:'📐 Math', science:'🔬 Science', english:'📖 English', history:'🏛️ History', cs:'💻 CS' };

  if (!history.length) {
    list.innerHTML = '<p class="history-empty">Your recent questions will appear here.</p>';
    return;
  }
  list.innerHTML = history.map(item => `
    <div class="history-item" onclick="loadFromHistory(${item.id})">
      <div>
        <div class="history-q">${escapeHTML(item.question)}${item.question.length >= 120 ? '…' : ''}</div>
        <div class="history-meta">${item.time}</div>
      </div>
      <span class="history-subject">${labels[item.subject] || item.subject}</span>
    </div>
  `).join('');
}
function clearHistory() {
  if (!confirm('Clear all recent questions?')) return;
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  renderHistory();
  showToast('🗑️ History cleared', 'success');
}

// Load a history item back into the input
window.loadFromHistory = function(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item) return;
  DOM.input().value = item.question;
  DOM.subject().value = item.subject;
  handleInputChange();
  DOM.input().scrollIntoView({ behavior: 'smooth' });
  DOM.input().focus();
};

// ── FAQ TOGGLE ────────────────────────────────────────────────────
window.toggleFaq = function(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
};

// ── LOADING STATE ─────────────────────────────────────────────────
function setLoading(on) {
  const btn = DOM.solveBtn();
  btn.disabled = on;
  DOM.solveText().style.display    = on ? 'none'         : 'inline';
  DOM.solveLoading().style.display = on ? 'inline-flex'  : 'none';
}

// ── SHOW / HIDE ───────────────────────────────────────────────────
function hideOutput() { DOM.outputSection().style.display = 'none'; }
function showError(msg) {
  DOM.errorMsg().textContent = msg;
  DOM.errorBanner().style.display = 'flex';
  DOM.errorBanner().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() { DOM.errorBanner().style.display = 'none'; }

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── UTILITY ───────────────────────────────────────────────────────
function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
