import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import {
  Brain, Layers, BookOpen, Target, Award, Mic, Swords,
  ArrowRight, ChevronLeft, ChevronRight, Check, X, GitBranch,
} from 'lucide-react';
import logo from '../assets/logo.svg';
import adiImg from '../assets/Adi.jpeg';
import parthavImg from '../assets/Parthav.png';
import './Home.css';

/* ---------- content ported from the original investor-deck Landing page.
   Neo4j is gone from the stack, so every Neo4j-specific claim (the
   "Learning Graph" system, the two "Knowledge Maps"/prerequisite-graph
   features, the concept-dependency diff row) has been dropped rather than
   replaced — nothing here is new copy, only trimmed. ChromaDB likewise
   became pgvector, so the label was updated in place. ---------- */

const TEAM = [
  { name: 'Aditya Lanka', role: 'Co-Founder', img: adiImg },
  { name: 'Parthav Elangovan', role: 'Co-Founder', img: parthavImg },
];

const BUILT_ITEMS = [
  'LangGraph AI pipelines: tutor, flashcards, quizzes, notes, search',
  'pgvector episodic memory: semantic retrieval across every session',
  'FSRS-6 spaced repetition scheduler (DSR memory model)',
  'Real-time WebSocket quiz battles & social layer',
  'Atlas 3D WebGL interface for the full product experience',
  'FastAPI + React full-stack platform — fully containerized',
  'Product roadmap, investor narrative & go-to-market strategy',
];

const CURVE_BARS = [
  { t: '20 min', r: 58 }, { t: '1 hour', r: 44 }, { t: '24 hrs', r: 33 },
  { t: '1 week', r: 21 }, { t: '1 month', r: 10 },
];

const SYSTEMS = [
  {
    num: '01', title: 'EPISODIC MEMORY', tech: 'pgvector', icon: <Layers size={12} />,
    desc: 'Every session — note, chat, quiz, flashcard review — is embedded as a semantic vector. The AI retrieves your relevant history before every new interaction.',
    points: ['Structured per-user collections: episodic, important, quiz history', 'Semantic retrieval across all past session types', 'AI reads your context before generating anything'],
  },
  {
    num: '02', title: 'ADAPTIVE ENGINE', tech: 'LangGraph', icon: <GitBranch size={12} />,
    desc: '5 independent graphs (tutor, flashcard, quiz, note, search) each follow one pattern: fetch_context → build_prompt → generate. Custom LLM routing assigns the right model per task.',
    points: ['5 graphs, one pattern across all content types', 'fetch_context → build_prompt → generate', 'Custom multi-model routing per task type'],
  },
];

const FEATURES = [
  { icon: <Brain size={19} />, title: 'Memory-Aware AI Tutor', desc: 'Reads your past sessions and weak topics before every reply. A tutor with actual memory.' },
  { icon: <BookOpen size={19} />, title: 'FSRS-6 Flashcards', desc: 'DSR algorithm schedules every card by memory stability — not arbitrary intervals.' },
  { icon: <Target size={19} />, title: 'Adaptive Quizzes', desc: 'Difficulty calibrates to your mastery. Every score updates your progress live.' },
  { icon: <Layers size={19} />, title: 'Smart Notes', desc: 'Depth (brief / standard / deep) + tone control. AI knows your gaps before writing.' },
  { icon: <Mic size={19} />, title: 'AI Podcasts', desc: 'Coach, Story, Rapid Review, or Socratic mode. Any topic becomes an on-demand lesson.' },
  { icon: <Swords size={19} />, title: 'Live Quiz Battles', desc: 'Real-time WebSocket multiplayer. Race friends, see live scores, track wins.' },
  { icon: <Award size={19} />, title: 'XP & Gamification', desc: 'Daily challenges, weekly bingo, achievements, global leaderboards. Gamified mastery.' },
];

const WHY_REASONS = [
  { num: '01', title: 'Built by students', desc: 'We were the students losing hours to four apps that never talked to each other. Cerbyl is the single workspace we wished existed.' },
  { num: '02', title: 'AI that remembers you', desc: 'Every quiz score, note, and chat session is stored in your permanent profile. The AI reads your actual history before every reply — not just the current message.' },
  { num: '03', title: 'The full study loop', desc: 'Tutor → Notes → Flashcards → Quizzes → Battles. One platform, one profile, zero app switching.' },
  { num: '04', title: 'Science-backed scheduling', desc: 'FSRS-6 spaced repetition ensures you study the right thing at the right time — always.' },
];

const DIFF_ROWS = [
  ['What it stores', 'Facts you typed that session', 'Every quiz score, note, chat, flashcard — linked to your permanent profile'],
  ['How memory is used', 'Passive — nothing carries over', 'Active — drives what content you see next and at what difficulty'],
  ['Spaced repetition', 'None', 'FSRS-6 DSR model built into flashcard and quiz scheduling'],
  ['Acts on your gaps', 'Waits for you to ask', 'Proactively surfaces weak topics across every session type'],
];

const COMPETITORS = [
  { name: 'NotebookLM', lead: 'Source-grounded trust model', win: 'Full study loop: AI tutor, quizzes, flashcards, analytics, social battles' },
  { name: 'Knowt', lead: 'Student distribution & UX', win: 'FSRS-6 spaced repetition, weakness remediation engine' },
  { name: 'StudyFetch', lead: 'Feature parity: plans, voice', win: 'Episodic AI memory, quiz battles, adaptive difficulty' },
  { name: 'Quizlet', lead: 'Brand trust & content library', win: 'True adaptive tutor with mastery-aware difficulty, not just flashcards' },
  { name: 'Khanmigo', lead: 'Pedagogy brand & school deals', win: 'Full student workflow: notes → quizzes → flashcards → battles in one loop' },
  { name: 'ChatGPT', lead: 'General-purpose AI breadth', win: 'FSRS scheduling, persistent cross-session memory' },
];

const SECTIONS = [
  { id: 'team', num: '01', label: 'TEAM' },
  { id: 'problem', num: '02', label: 'PROBLEM' },
  { id: 'architecture', num: '03', label: 'ARCHITECTURE' },
  { id: 'features', num: '04', label: 'FEATURES' },
  { id: 'why', num: '05', label: 'WHY CERBYL' },
  { id: 'competition', num: '06', label: 'COMPETITION' },
];

const INTRO_KEY = 'cb_intro_seen';

function GeometricGrid() {
  const W = 1600, H = 1000, STEP = 80;
  const lines = [];
  const nums = [];
  let lineKey = 0;
  for (let x = 0; x <= W; x += STEP) {
    lines.push(<line key={`v${lineKey++}`} x1={x} y1={0} x2={x} y2={H} />);
  }
  for (let y = 0; y <= H; y += STEP) {
    lines.push(<line key={`h${lineKey++}`} x1={0} y1={y} x2={W} y2={y} />);
  }
  let n = 1;
  for (let r = 0; r <= H; r += STEP * 3) {
    for (let c = 0; c <= W; c += STEP * 3) {
      nums.push(<text key={`n${c}${r}`} x={c + 3} y={r + 11}>{String(n++ % 99 + 1).padStart(2, '0')}</text>);
    }
  }
  return (
    <svg className="cb-bg-geo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className="cb-bg-geo-lines">{lines}</g>
      <g className="cb-bg-geo-nums">{nums}</g>
    </svg>
  );
}

function SectionDetail({ id, navigate }) {
  if (id === 'team') {
    return (
      <>
        <div className="cb-modal-label">THE FOUNDERS</div>
        <div className="cb-founders-row">
          {TEAM.map((m) => (
            <div className="cb-founder" key={m.name}>
              <div className="cb-founder-avatar"><img src={m.img} alt={m.name} /></div>
              <div className="cb-founder-name">{m.name}</div>
              <div className="cb-founder-role">{m.role}</div>
            </div>
          ))}
        </div>
        <div className="cb-built-label">TOGETHER WE BUILT</div>
        <div className="cb-built-grid">
          {BUILT_ITEMS.map((item) => (
            <div key={item} className="cb-built-item"><span className="cb-built-dot" />{item}</div>
          ))}
        </div>
        <div className="cb-quote">
          <span className="cb-quote-mark">"</span>
          <p>We're not outsiders. We were the students — losing hours to four different apps, forgetting what we studied last week, and asking AI that forgot us every morning. We built the tool we wished existed.</p>
        </div>
      </>
    );
  }

  if (id === 'problem') {
    return (
      <>
        <div className="cb-modal-label">THE PROBLEM</div>
        <h2 className="cb-modal-title">Your brain is actively<br />deleting what you study.</h2>
        <p className="cb-modal-sub">Ebbinghaus proved it in 1885. Most AI tools still ignore it in 2025.</p>
        <div className="cb-curve">
          {CURVE_BARS.map((b) => (
            <div key={b.t} className="cb-curve-col">
              <div className="cb-curve-pct">{b.r}%</div>
              <div className="cb-curve-bar-wrap"><div className="cb-curve-bar" style={{ height: `${b.r}%` }} /></div>
              <div className="cb-curve-time">{b.t}</div>
            </div>
          ))}
        </div>
        <p className="cb-modal-footnote">
          Humans forget ~50% of new information within an hour and ~90% within a month without active retrieval practice.
          Traditional learning treats every session as isolated. Most AI tools do too — they answer your question and forget you exist.
          Cerbyl's spaced repetition is <em>built into the core</em>, not bolted on.
        </p>
      </>
    );
  }

  if (id === 'architecture') {
    return (
      <>
        <div className="cb-modal-label">THE INFRASTRUCTURE</div>
        <h2 className="cb-modal-title">Two systems. One brain.</h2>
        <div className="cb-arch-grid">
          {SYSTEMS.map((s) => (
            <div key={s.num} className="cb-arch-card">
              <div className="cb-arch-num">{s.num}</div>
              <div className="cb-arch-head">
                <span className="cb-arch-title">{s.title}</span>
                <span className="cb-arch-tech">{s.icon}{s.tech}</span>
              </div>
              <p className="cb-arch-desc">{s.desc}</p>
              <ul className="cb-arch-list">
                {s.points.map((p) => <li key={p}><Check size={9} />{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="cb-arch-footer">
          Also powering the platform: Deep Knowledge Tracing (DKT) neural model · Style Bandit for content adaptation · FSRS-6 memory scheduling
        </div>
      </>
    );
  }

  if (id === 'features') {
    return (
      <>
        <div className="cb-modal-label">WHAT YOU GET</div>
        <h2 className="cb-modal-title">Seven features. One platform.</h2>
        <div className="cb-feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="cb-feat-card">
              <div className="cb-feat-icon">{f.icon}</div>
              <div className="cb-feat-title">{f.title}</div>
              <p className="cb-feat-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (id === 'why') {
    return (
      <>
        <div className="cb-modal-label">WHY CERBYL</div>
        <h2 className="cb-modal-title">One AI workspace that actually knows you.</h2>
        <div className="cb-why-grid">
          {WHY_REASONS.map((r) => (
            <div key={r.num} className="cb-why-card">
              <div className="cb-why-num">{r.num}</div>
              <div className="cb-why-title">{r.title}</div>
              <div className="cb-why-desc">{r.desc}</div>
            </div>
          ))}
        </div>
        <button className="cb-modal-cta" onClick={() => navigate('/register')}>
          Get started free <ArrowRight size={14} />
        </button>
      </>
    );
  }

  if (id === 'competition') {
    return <CompetitionDetail />;
  }

  return null;
}

function CompetitionDetail() {
  const [tab, setTab] = useState(0);
  return (
    <>
      <div className="cb-modal-label">COMPETITIVE ADVANTAGE</div>
      <h2 className="cb-modal-title">Why chatbots fail at learning.</h2>
      <div className="cb-comp-tabs">
        <button className={`cb-ctab${tab === 0 ? ' cb-ctab--on' : ''}`} onClick={() => setTab(0)}>VS AI CHATBOTS</button>
        <button className={`cb-ctab${tab === 1 ? ' cb-ctab--on' : ''}`} onClick={() => setTab(1)}>VS COMPETITORS</button>
      </div>
      {tab === 0 ? (
        <div className="cb-table">
          <div className="cb-table-hd"><div>DIMENSION</div><div>AI CHATBOTS</div><div className="cb-col-us">CERBYL</div></div>
          {DIFF_ROWS.map(([feat, them, us]) => (
            <div key={feat} className="cb-table-row">
              <div className="cb-cell-feat">{feat}</div>
              <div className="cb-cell-them"><span className="cb-x">✕</span>{them}</div>
              <div className="cb-cell-us"><Check size={10} />{us}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cb-table">
          <div className="cb-table-hd"><div>COMPETITOR</div><div>WHAT THEY LEAD IN</div><div className="cb-col-us">WHERE CERBYL WINS</div></div>
          {COMPETITORS.map((c) => (
            <div key={c.name} className="cb-table-row">
              <div className="cb-cell-feat cb-cell-name">{c.name}</div>
              <div className="cb-cell-them">{c.lead}</div>
              <div className="cb-cell-us"><Check size={10} />{c.win}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const introRef = useRef(null);
  const introMarkRef = useRef(null);
  const introWordRef = useRef(null);
  const introTagRef = useRef(null);
  const introSkipRef = useRef(null);
  const navRef = useRef(null);
  const tileRefs = useRef({});
  const tlRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(null);
  const [closing, setClosing] = useState(false);
  const [dir, setDir] = useState(1);
  const closeTimerRef = useRef(null);

  const revealGrid = () => {
    const tiles = Object.values(tileRefs.current).filter(Boolean);
    gsap.set(tiles, { opacity: 0, y: 22, rotateX: -6 });
    const tl = gsap.timeline();
    tl.to(navRef.current, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0);
    tl.to(tiles, {
      opacity: 1, y: 0, rotateX: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out',
      clearProps: 'transform',
    }, 0.08);
  };

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alreadySeen = sessionStorage.getItem(INTRO_KEY);

    if (reduceMotion || alreadySeen) {
      gsap.set(introRef.current, { display: 'none' });
      revealGrid();
      return;
    }

    sessionStorage.setItem(INTRO_KEY, '1');
    const letterEls = introWordRef.current.querySelectorAll('span');

    const finishIntro = () => {
      if (!introRef.current) return;
      gsap.to(introRef.current, {
        yPercent: -100,
        duration: 0.9,
        ease: 'expo.inOut',
        onComplete: () => { if (introRef.current) introRef.current.style.display = 'none'; },
      });
      revealGrid();
    };

    const tl = gsap.timeline({ onComplete: finishIntro });
    tlRef.current = tl;

    tl.to(introMarkRef.current, { opacity: 1, scale: 1, rotate: 0, duration: 0.9, ease: 'expo.out' })
      .to(introMarkRef.current, { opacity: 0, scale: 0.5, duration: 0.5, ease: 'power2.in' }, '+=0.25')
      .to(letterEls, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, stagger: 0.045, ease: 'power3.out' }, '-=0.3')
      .to(introTagRef.current, { clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: 'power3.out' }, '-=0.15')
      .to(introSkipRef.current, { opacity: 1, duration: 0.4 }, '-=0.5')
      .to({}, { duration: 0.9 });

    const skip = () => {
      if (tlRef.current) tlRef.current.progress(1).kill();
      finishIntro();
    };
    introRef.current.addEventListener('click', skip);
    window.addEventListener('keydown', skip, { once: true });

    return () => {
      tl.kill();
      window.removeEventListener('keydown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (tlRef.current) tlRef.current.kill(); }, []);

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);

  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const openSection = useCallback((i) => { setDir(1); setClosing(false); setActiveIdx(i); }, []);

  const closeModal = useCallback(() => {
    setClosing(true);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => { setActiveIdx(null); setClosing(false); }, 280);
  }, []);

  const prevSection = useCallback(() => {
    setDir(-1);
    setActiveIdx((i) => (i === null ? i : Math.max(0, i - 1)));
  }, []);

  const nextSection = useCallback(() => {
    setDir(1);
    setActiveIdx((i) => (i === null ? i : Math.min(SECTIONS.length - 1, i + 1)));
  }, []);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (activeIdx === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowRight') nextSection();
      if (e.key === 'ArrowLeft') prevSection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, closeModal, prevSection, nextSection]);

  return (
    <div className="cb-root" ref={rootRef}>
      <div className="cb-bg-fx" aria-hidden>
        <div className="cb-bg-orb cb-bg-orb-1" />
        <div className="cb-bg-orb cb-bg-orb-2" />
        <GeometricGrid />
        <div className="cb-bg-vignette" />
      </div>

      <div className="cb-intro" ref={introRef}>
        <img src={logo} alt="" className="cb-intro-mark" ref={introMarkRef} />
        <div className="cb-intro-word" ref={introWordRef}>
          {'cerbyl'.split('').map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
        <div className="cb-intro-tagline" ref={introTagRef}>
          Learning, <em>unified.</em>
        </div>
        <div className="cb-intro-skip" ref={introSkipRef}>Click or press any key to continue</div>
      </div>

      <nav className="cb-nav" ref={navRef}>
        <div className="cb-nav-mark">
          <span className="cb-nav-mark-dot" />
          LEARNING UNIFIED
        </div>
        <div className="cb-nav-right">
          <button onClick={() => navigate('/register')}>Get Started</button>
          <button className="cb-nav-login" onClick={() => navigate('/login')}>Log In</button>
        </div>
      </nav>

      <div className="cb-grid-wrap">
        <div className="cb-grid">
          <div className="cb-tile cb-tile-mark" ref={(el) => { tileRefs.current.mark = el; }}>
            <div className="cb-mark-logo" />
            <span className="cb-mark-word">cerbyl</span>
          </div>

          {SECTIONS.map((s, i) => (
            <div
              key={s.id}
              className={`cb-tile cb-t-${s.id}`}
              ref={(el) => { tileRefs.current[s.id] = el; }}
              onClick={() => openSection(i)}
              onMouseMove={handleTileMove}
              onMouseLeave={handleTileLeave}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') openSection(i); }}
            >
              <span className="cb-tile-num">{s.num}</span>
              <h3 className="cb-tile-title">{s.label}</h3>
            </div>
          ))}
        </div>
      </div>

      {activeIdx !== null && (
        <div className={`cb-modal-overlay${closing ? ' cb-modal-overlay--closing' : ''}`} onClick={closeModal}>
          <div className={`cb-modal${closing ? ' cb-modal--closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button className="cb-modal-close" onClick={closeModal} aria-label="Close"><X size={18} /></button>
            {activeIdx > 0 && (
              <button className="cb-modal-arrow cb-modal-arrow--left" onClick={prevSection} aria-label="Previous"><ChevronLeft size={18} /></button>
            )}
            {activeIdx < SECTIONS.length - 1 && (
              <button className="cb-modal-arrow cb-modal-arrow--right" onClick={nextSection} aria-label="Next"><ChevronRight size={18} /></button>
            )}
            <div className="cb-modal-body" key={activeIdx} data-dir={dir}>
              <SectionDetail id={SECTIONS[activeIdx].id} navigate={navigate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
