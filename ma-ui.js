/* MatricAce UI behaviour (pairs with ma-ui.css). Added at the end of every MatricAce page.
   - html[data-device] = mobile | tablet | desktop, so each device gets its own layout.
   - Jaca, the jacaranda-blossom mascot, with moods (idle, think, cheer, oops, wave).
   - Pick, then Check on multiple-choice questions (student quizzes, Skills Academy, Learn to Code), with a feedback
     sheet, sounds and read-aloud. The page's own answer handler still does the scoring: this only adds a step in front.
   - Falling jacaranda petals and a fanfare on good results; a sound on/off switch (remembered on the device).
   - Staff sign-in screens are tagged so the new styles reach them.
   Nothing here talks to the server or changes saved data. */
(function () {
  'use strict';
  var H = document.documentElement, PAGE = H.getAttribute('data-ma') || '';
  if (!H.classList.contains('ma')) H.classList.add('ma');
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- device ---------- */
  function device() {
    var w = window.innerWidth, d = w >= 1100 ? 'desktop' : w >= 760 ? 'tablet' : 'mobile';
    if (H.getAttribute('data-device') !== d) H.setAttribute('data-device', d);
  }
  device(); window.addEventListener('resize', device);

  /* ---------- sound ---------- */
  var AC = null, mute = false;
  try { mute = localStorage.getItem('ma-snd') === '0'; } catch (e) { }
  function ctx() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, t0, dur, vol, type) {
    var a = ctx(); if (!a || mute) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (t0 || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  var FX = {
    pick: function () { tone(520, 0, 0.08, 0.05, 'triangle'); },
    ok: function () { tone(660, 0, 0.12, 0.08); tone(880, 0.09, 0.12, 0.08); tone(1320, 0.18, 0.2, 0.06); },
    no: function () { tone(330, 0, 0.18, 0.07, 'sawtooth'); tone(247, 0.12, 0.25, 0.06, 'sawtooth'); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.3, 0.07, 'triangle'); }); tone(1319, 0.5, 0.5, 0.05); }
  };
  function sndButton() {
    if (!/^(student|skills|coding)$/.test(PAGE) || $('.ma-snd')) return;
    var b = document.createElement('button'); b.className = 'ma-snd'; b.type = 'button';
    var paint = function () { b.textContent = mute ? '🔇' : '🔊'; b.setAttribute('aria-label', mute ? 'Turn sounds on' : 'Turn sounds off'); b.setAttribute('aria-pressed', String(!mute)); };
    paint(); b.addEventListener('click', function () { mute = !mute; try { localStorage.setItem('ma-snd', mute ? '0' : '1'); } catch (e) { } paint(); if (!mute) FX.pick(); });
    document.body.appendChild(b);
  }

  /* ---------- Jaca the jacaranda blossom ---------- */
  function petalPath(i) { var a = (i * 72 - 90) * Math.PI / 180, cx = 50 + Math.cos(a) * 21, cy = 52 + Math.sin(a) * 21; return '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="17" ry="14" transform="rotate(' + (i * 72) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"/>'; }
  var JACA = '<svg viewBox="0 0 100 104" aria-hidden="true"><g class="jp"><path d="M50 74 Q48 92 40 102" stroke="#3F7A3A" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 92 Q36 86 30 90 Q37 96 45 92Z" fill="#5FA052"/>'
    + '<g fill="#9B72E0" stroke="#5B3A9E" stroke-width="2.5">' + [0, 1, 2, 3, 4].map(petalPath).join('') + '</g>'
    + '<circle cx="50" cy="52" r="20" fill="#F6E9FF" stroke="#5B3A9E" stroke-width="2.5"/><circle cx="50" cy="52" r="20" fill="url(#jg)" opacity=".5"/><defs><radialGradient id="jg" cx=".4" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#C9B0F5"/></radialGradient></defs>'
    + '<g fill="#1B1240"><ellipse class="eye" cx="43" cy="49" rx="3.2" ry="4"/><ellipse class="eye" cx="57" cy="49" rx="3.2" ry="4"/></g><g fill="#FF9EC0" opacity=".7"><ellipse cx="38.5" cy="57" rx="3.6" ry="2.2"/><ellipse cx="61.5" cy="57" rx="3.6" ry="2.2"/></g>'
    + '<g stroke="#1B1240" stroke-width="2.4" fill="none" stroke-linecap="round"><path class="mo m-smile" d="M44 58 Q50 64 56 58"/><path class="mo m-oops" d="M45 62 Q50 57.5 55 62"/><path class="mo m-think" d="M45 60.5 L55 59"/></g>'
    + '<path class="mo m-open" d="M43.5 57 Q50 68 56.5 57Z" fill="#1B1240"/></g></svg>';
  function jaca(mood) { var s = document.createElement('span'); s.className = 'ma-jaca'; s.setAttribute('data-mood', mood || 'idle'); s.innerHTML = JACA; return s; }
  window.MAJaca = jaca;

  /* ---------- petals ---------- */
  function petals(n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (var i = 0; i < (n || 36); i++) {
      var p = document.createElement('i'); p.className = 'ma-petal';
      p.style.left = (Math.random() * 100) + 'vw'; p.style.setProperty('--dx', ((Math.random() - .5) * 220) + 'px'); p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.animationDuration = (2.4 + Math.random() * 2.2) + 's'; p.style.animationDelay = (Math.random() * .9) + 's'; p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg) scale(' + (.7 + Math.random() * .6) + ')';
      document.body.appendChild(p); (function (el) { setTimeout(function () { el.remove(); }, 5600); })(p);
    }
  }
  window.MAPetals = petals;

  /* ---------- read aloud ---------- */
  function say(text) {
    var S = window.speechSynthesis; if (!S || !text) return; S.cancel();
    var u = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ' ').trim()); u.lang = 'en-ZA';
    var v = S.getVoices().filter(function (x) { return /^en[-_](ZA|GB)/i.test(x.lang); })[0] || S.getVoices().filter(function (x) { return /^en/i.test(x.lang); })[0]; if (v) u.voice = v; u.rate = 1;
    S.speak(u);
  }

  /* ---------- feedback sheet ---------- */
  var OKS = ['Lekker! That’s right.', 'Spot on.', 'Yes! Nailed it.', 'Correct. Keep going.', 'Sharp work.'], NOS = ['Not quite.', 'Close, but not this time.', 'Almost. Read the explanation.', 'Not this one.'];
  var sheet = null, onCont = null;
  function showSheet(ok, detail, cont) {
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'ma-sheet'; sheet.setAttribute('role', 'status'); sheet.setAttribute('aria-live', 'polite');
      sheet.innerHTML = '<span class="ma-sh-m"></span><div class="ma-sh-t"><h3></h3><p></p></div><div class="ma-sh-act"><button type="button" class="ma-say" aria-label="Read it to me">🔊</button><button type="button" class="ma-cont">Continue</button></div>';
      document.body.appendChild(sheet);
      $('.ma-cont', sheet).addEventListener('click', function () { hideSheet(); if (onCont) onCont(); });
      $('.ma-say', sheet).addEventListener('click', function () { say($('h3', sheet).textContent + '. ' + $('p', sheet).textContent); });
    }
    var m = $('.ma-sh-m', sheet); m.innerHTML = ''; m.appendChild(jaca(ok ? 'cheer' : 'oops'));
    sheet.classList.toggle('no', !ok); $('h3', sheet).textContent = (ok ? OKS : NOS)[Math.floor(Math.random() * (ok ? OKS : NOS).length)];
    $('p', sheet).textContent = detail || ''; onCont = cont || null;
    H.classList.add('ma-sheet-on'); requestAnimationFrame(function () { sheet.classList.add('on'); setTimeout(function () { var c = $('.ma-cont', sheet); if (c) c.focus({ preventScroll: true }); }, 250); });
    (ok ? FX.ok : FX.no)();
  }
  function hideSheet() { if (sheet) sheet.classList.remove('on'); H.classList.remove('ma-sheet-on'); }
  window.MAFeedback = showSheet;

  /* ---------- pick, then Check ---------- */
  var passing = false;
  function eligible(btn) {
    if (!btn || btn.disabled) return false;
    if (PAGE === 'student') return !!btn.closest('#options-container');
    if (PAGE === 'skills' || PAGE === 'coding') { var t = document.querySelector('.exam-timer'); return !(t && t.offsetParent); }
    return false;
  }
  function group(btn) { return btn.parentElement; }
  function checkBtn(g) {
    var c = g.parentElement.querySelector(':scope > .ma-check');
    if (!c) { c = document.createElement('button'); c.type = 'button'; c.className = 'ma-check'; c.textContent = 'Check'; g.insertAdjacentElement('afterend', c); c.addEventListener('click', doCheck); }
    return c;
  }
  function doCheck(e) {
    var c = e.currentTarget, g = c.previousElementSibling, pick = g && g.querySelector('.opt-btn.ma-pick'); if (!pick) return;
    c.hidden = true; passing = true; pick.classList.remove('ma-pick');
    try { pick.click(); } finally { passing = false; }
    setTimeout(function () {
      var ok = pick.classList.contains('selected-correct') || pick.classList.contains('correct');
      var right = g.querySelector('.opt-btn.selected-correct,.opt-btn.show-correct,.opt-btn.correct'), ans = right ? right.innerText.replace(/^\s*[A-D]\s*/, '').trim() : '';
      var cont = null;
      if (PAGE === 'student') { var nx = $('#btn-next-q'); cont = function () { var n = $('#btn-next-q'); if (n && !n.disabled) n.click(); }; setBubble(ok ? 'cheer' : 'oops', ok ? 'Nice! Read why, or carry on.' : 'Look at the green answer and the explanation.'); }
      else cont = function () { var b = $$('.continue-btn, .explain-box, .feedback').filter(function (x) { return x.offsetParent; })[0]; if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      showSheet(ok, ok ? '' : (ans ? 'Answer: ' + ans : ''), cont);
    }, 30);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.opt-btn');
    if (!btn || passing || !eligible(btn)) return;
    e.stopPropagation(); e.preventDefault();
    var g = group(btn); $$('.opt-btn.ma-pick', g).forEach(function (b) { b.classList.remove('ma-pick'); });
    btn.classList.add('ma-pick'); FX.pick(); var c = checkBtn(g); c.hidden = false; c.disabled = false;
    if (PAGE === 'student') setBubble('think', 'Happy with that? Tap Check.');
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    var c = $$('.ma-check').filter(function (x) { return !x.hidden && x.offsetParent; })[0];
    if (e.key === 'Enter' && sheet && sheet.classList.contains('on')) { e.preventDefault(); $('.ma-cont', sheet).click(); return; }
    if (!c) { var g0 = $$('.opt-btn').filter(function (x) { return x.offsetParent && eligible(x); }); if (/^[1-4a-d]$/i.test(e.key) && g0.length) { var i = /\d/.test(e.key) ? +e.key - 1 : e.key.toLowerCase().charCodeAt(0) - 97; if (g0[i]) { e.preventDefault(); g0[i].click(); } } return; }
    if (e.key === 'Enter') { e.preventDefault(); c.click(); }
    else if (/^[1-4a-d]$/i.test(e.key)) { var opts = $$('.opt-btn', c.previousElementSibling), j = /\d/.test(e.key) ? +e.key - 1 : e.key.toLowerCase().charCodeAt(0) - 97; if (opts[j]) { e.preventDefault(); opts[j].click(); } }
  });

  /* ---------- student portal extras ---------- */
  var BUB = ['Pick an answer, then tap Check.', 'Take your time. Read every option.', 'You know this one. Trust yourself.', 'Eliminate the wrong ones first.', 'Jacaranda season is exam season. You’ve got this.'];
  function setBubble(mood, text) { var h = $('.ma-qhead'); if (!h) return; $('.ma-jaca', h).setAttribute('data-mood', mood); var b = $('.ma-bub', h); b.textContent = text; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
  function studentQuestion() {
    var q = $('.q-text'); if (!q || !q.parentElement) return;
    var h = $('.ma-qhead');
    if (!h) { h = document.createElement('div'); h.className = 'ma-qhead'; h.appendChild(jaca('wave')); var b = document.createElement('div'); b.className = 'ma-bub'; h.appendChild(b); q.parentElement.insertBefore(h, q.parentElement.firstChild); }
    setBubble('idle', BUB[Math.floor(Math.random() * BUB.length)]); hideSheet();
    $$('.ma-check').forEach(function (c) { c.hidden = true; });
  }
  function studentResult(ov) {
    var emo = $('#res-emoji', ov), pct = parseInt(($('#res-pct', ov) || {}).textContent || '0', 10) || 0;
    if (emo && !emo.querySelector('.ma-jaca')) { emo.textContent = ''; emo.appendChild(jaca(pct >= 50 ? 'cheer' : 'idle')); } else if (emo) emo.querySelector('.ma-jaca').setAttribute('data-mood', pct >= 50 ? 'cheer' : 'idle');
    var card = $('.result-card', ov), luck = $('.ma-luck', card);
    if (!luck && card) { luck = document.createElement('p'); luck.className = 'ma-luck'; var msg = $('#res-msg', card); if (msg) msg.insertAdjacentElement('afterend', luck); }
    if (luck) luck.textContent = pct >= 50 ? '🌸 A jacaranda blossom just landed on you. That’s good luck for finals.' : 'Every attempt counts. Practise again and watch the score climb.';
    if (pct >= 50) { FX.win(); petals(pct >= 80 ? 60 : 32); }
  }
  function studentShell() {
    var nav = $('.bottom-nav'); if (nav && !$('.ma-brand', nav)) { var b = document.createElement('div'); b.className = 'ma-brand'; b.appendChild(jaca('idle')); b.insertAdjacentHTML('beforeend', '<span>Matric<b>Ace</b></span>'); nav.insertBefore(b, nav.firstChild); }
    var ac = $('.auth-card'); if (ac && !$('.ma-jaca', ac)) ac.insertBefore(jaca('wave'), ac.firstChild);
    var ov = $('#result-overlay');
    if (ov && !ov.__ma) { ov.__ma = 1; new MutationObserver(function () { if (ov.classList.contains('show')) studentResult(ov); }).observe(ov, { attributes: true, attributeFilter: ['class'] }); }
    var oc = $('#options-container');
    if (oc && !oc.__ma) { oc.__ma = 1; new MutationObserver(function () { if (oc.querySelector('.opt-btn:not(:disabled)')) studentQuestion(); }).observe(oc, { childList: true }); }
  }

  /* ---------- staff sign-in screens (rendered by replacing the page body) ---------- */
  function staffLogin() {
    $$('input[type=password]').forEach(function (inp) {
      var card = inp.closest('div[style*="max-width:380px"],div[style*="max-width: 380px"]'); if (!card || !/Sign in with your/i.test(card.textContent)) return;
      var wrap = card.parentElement; if (!wrap || wrap.classList.contains('ma-login')) return;
      wrap.classList.add('ma-login'); card.classList.add('ma-login-card');
      var emo = card.querySelector('div[style*="font-size:2rem"]'); if (emo) emo.style.display = 'none';
      var j = jaca('wave'); j.style.cssText = 'display:block;margin:0 auto 6px;width:72px'; card.insertBefore(j, card.firstChild);
      $$('button', card).forEach(function (b) { if (/sign in/i.test(b.textContent)) b.classList.add('ma-go'); });
    });
  }

  /* ---------- run ---------- */
  function scan() {
    if (PAGE === 'student') studentShell();
    if (H.classList.contains('ma-staff')) staffLogin();
  }
  function start() {
    sndButton(); scan();
    new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) if (ms[i].addedNodes.length) { scan(); break; } }).observe(document.body, { childList: true, subtree: false });
    if (H.classList.contains('ma-staff')) { var q = 0; new MutationObserver(function () { if (q) return; q = requestAnimationFrame(function () { q = 0; staffLogin(); }); }).observe(document.documentElement, { childList: true, subtree: true }); }
    // skills/coding: daily-challenge and lesson answers that are judged by the page show a correct/wrong class; nothing else to wire.
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.MAUI = { FX: FX, petals: petals, jaca: jaca, say: say };
})();
