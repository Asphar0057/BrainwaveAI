import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Globe, Plus, ChevronRight, ChevronLeft, FileText, Upload,
  Lock, Unlock, Trash2, Search, Star, Users, GraduationCap,
  X, AlertCircle, Loader2, Home, CheckCircle, Shield, TrendingUp,
  BookMarked, RefreshCw, Grid, List as ListIcon, Info, Layers,
  BookCopy, Sparkles, Library, FolderOpen, Calculator, PenLine,
  Dna, FlaskConical, Zap, Microscope, Landmark, Code2, BarChart2,
  Palette, Wrench, Dumbbell, Music, Tv, Brain, Scale, Hash,
  Triangle, Heart, Film, Leaf, Mic2, Languages, Building2, Sun,
  MessageCircle, Globe2, Sigma, Send,
  Tag, ArrowRight, CheckSquare, Square, Filter, Target
} from 'lucide-react';
import contextService from '../services/contextService';
import './ContextHub.css';
import '../components/SocialHubChrome.css';

const FlagUK = ({ size = 28 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.6)}
    viewBox="0 0 60 40"
    xmlns="http://www.w3.org/2000/svg"
    style={{ borderRadius: 3, flexShrink: 0, display: 'block' }}
  >
    <rect width="60" height="40" fill="#012169" />
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="white" strokeWidth="8" />
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="5" />
    <rect x="24" y="0" width="12" height="40" fill="white" />
    <rect x="0" y="14" width="60" height="12" fill="white" />
    <rect x="26" y="0" width="8" height="40" fill="#C8102E" />
    <rect x="0" y="16" width="60" height="8" fill="#C8102E" />
  </svg>
);

const FlagUS = ({ size = 28 }) => {
  const h = Math.round(size * 0.6);
  const sw = size;
  const sh = h;
  const stripeH = sh / 13;
  return (
    <svg
      width={sw}
      height={sh}
      viewBox={`0 0 ${sw} ${sh}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: 3, flexShrink: 0, display: 'block' }}
    >
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x="0" y={i * stripeH} width={sw} height={stripeH}
          fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
      ))}
      <rect x="0" y="0" width={sw * 0.4} height={stripeH * 7} fill="#3C3B6E" />
    </svg>
  );
};

const UK_GCSE_SUBJECTS = [
  { id: 'maths',           name: 'Mathematics',       Icon: Calculator,  category: 'STEM',          desc: 'Number, algebra, geometry, statistics & probability' },
  { id: 'english_lang',    name: 'English Language',  Icon: PenLine,     category: 'Humanities',    desc: 'Reading, writing, speaking & listening skills' },
  { id: 'english_lit',     name: 'English Literature',Icon: BookOpen,    category: 'Humanities',    desc: 'Poetry, prose, drama & critical analysis' },
  { id: 'biology',         name: 'Biology',           Icon: Dna,         category: 'STEM',          desc: 'Cell biology, genetics, ecology & physiology' },
  { id: 'chemistry',       name: 'Chemistry',         Icon: FlaskConical,category: 'STEM',          desc: 'Atomic structure, bonding, reactions & organic chemistry' },
  { id: 'physics',         name: 'Physics',           Icon: Zap,         category: 'STEM',          desc: 'Forces, energy, waves, electricity & particle physics' },
  { id: 'combined_science',name: 'Combined Science',  Icon: Microscope,  category: 'STEM',          desc: 'Biology, chemistry & physics combined award' },
  { id: 'history',         name: 'History',           Icon: Landmark,    category: 'Humanities',    desc: 'Modern, medieval & ancient world history' },
  { id: 'geography',       name: 'Geography',         Icon: Globe,       category: 'Humanities',    desc: 'Physical & human geography, fieldwork & analysis' },
  { id: 'computer_science',name: 'Computer Science',  Icon: Code2,       category: 'STEM',          desc: 'Programming, algorithms, data & networks' },
  { id: 'business',        name: 'Business Studies',  Icon: BarChart2,   category: 'Social Sciences',desc: 'Enterprise, marketing, finance & operations' },
  { id: 'art',             name: 'Art & Design',      Icon: Palette,     category: 'Arts',          desc: 'Drawing, painting, sculpture & digital art' },
  { id: 'dt',              name: 'Design & Technology',Icon: Wrench,     category: 'STEM',          desc: 'Product design, materials & manufacturing processes' },
  { id: 'pe',              name: 'Physical Education',Icon: Dumbbell,    category: 'Arts',          desc: 'Sports science, performance & health & fitness' },
  { id: 'rs',              name: 'Religious Studies', Icon: Sun,         category: 'Humanities',    desc: 'Philosophy, ethics & world religions' },
  { id: 'french',          name: 'French',            Icon: Languages,   category: 'Languages',     desc: 'Reading, writing, listening & speaking in French' },
  { id: 'spanish',         name: 'Spanish',           Icon: Languages,   category: 'Languages',     desc: 'Reading, writing, listening & speaking in Spanish' },
  { id: 'german',          name: 'German',            Icon: Languages,   category: 'Languages',     desc: 'Reading, writing, listening & speaking in German' },
  { id: 'music',           name: 'Music',             Icon: Music,       category: 'Arts',          desc: 'Performance, composition & music theory' },
  { id: 'drama',           name: 'Drama',             Icon: Mic2,        category: 'Arts',          desc: 'Performance, devising & theatre studies' },
  { id: 'media',           name: 'Media Studies',     Icon: Tv,          category: 'Arts',          desc: 'Media analysis, production & industry' },
  { id: 'sociology',       name: 'Sociology',         Icon: Users,       category: 'Social Sciences',desc: 'Society, culture, identity & social structures' },
  { id: 'psychology',      name: 'Psychology',        Icon: Brain,       category: 'Social Sciences',desc: 'Human behaviour, cognition & research methods' },
  { id: 'economics',       name: 'Economics',         Icon: TrendingUp,  category: 'Social Sciences',desc: 'Markets, supply & demand, national & global economy' },
];

const UK_ALEVEL_SUBJECTS = [
  { id: 'maths',           name: 'Mathematics',       Icon: Calculator,  category: 'STEM',          desc: 'Pure maths, mechanics & statistics at advanced level' },
  { id: 'further_maths',   name: 'Further Mathematics',Icon: Hash,       category: 'STEM',          desc: 'Advanced pure, additional mechanics & decision maths' },
  { id: 'english_lit',     name: 'English Literature',Icon: BookOpen,    category: 'Humanities',    desc: 'Advanced textual analysis, comparative study & unseen' },
  { id: 'biology',         name: 'Biology',           Icon: Dna,         category: 'STEM',          desc: 'Biochemistry, genetics, ecology & physiology' },
  { id: 'chemistry',       name: 'Chemistry',         Icon: FlaskConical,category: 'STEM',          desc: 'Physical, organic & inorganic chemistry' },
  { id: 'physics',         name: 'Physics',           Icon: Zap,         category: 'STEM',          desc: 'Mechanics, electricity, quantum & nuclear physics' },
  { id: 'history',         name: 'History',           Icon: Landmark,    category: 'Humanities',    desc: 'Depth & breadth studies, historical skills & essay writing' },
  { id: 'geography',       name: 'Geography',         Icon: Globe,       category: 'Humanities',    desc: 'Physical systems, human geography & independent investigation' },
  { id: 'computer_science',name: 'Computer Science',  Icon: Code2,       category: 'STEM',          desc: 'Programming, computational thinking & theory of computation' },
  { id: 'economics',       name: 'Economics',         Icon: TrendingUp,  category: 'Social Sciences',desc: 'Microeconomics, macroeconomics & quantitative methods' },
  { id: 'psychology',      name: 'Psychology',        Icon: Brain,       category: 'Social Sciences',desc: 'Social, cognitive, biological & developmental psychology' },
  { id: 'sociology',       name: 'Sociology',         Icon: Users,       category: 'Social Sciences',desc: 'Education, crime, families & beliefs in society' },
  { id: 'business',        name: 'Business Studies',  Icon: BarChart2,   category: 'Social Sciences',desc: 'Strategic management, finance & business environment' },
  { id: 'art',             name: 'Art & Design',      Icon: Palette,     category: 'Arts',          desc: 'Portfolio development, critical & contextual studies' },
  { id: 'rs',              name: 'Religious Studies', Icon: Sun,         category: 'Humanities',    desc: 'Philosophy of religion, ethics & Christianity or Islam' },
  { id: 'french',          name: 'French',            Icon: Languages,   category: 'Languages',     desc: 'Advanced language skills, literature & film studies' },
  { id: 'spanish',         name: 'Spanish',           Icon: Languages,   category: 'Languages',     desc: 'Advanced language skills, literature & film studies' },
  { id: 'german',          name: 'German',            Icon: Languages,   category: 'Languages',     desc: 'Advanced language skills, literature & film studies' },
  { id: 'music',           name: 'Music',             Icon: Music,       category: 'Arts',          desc: 'Performance, composition & historical & analytical studies' },
  { id: 'drama',           name: 'Drama & Theatre',   Icon: Mic2,        category: 'Arts',          desc: 'Performance, devising & study of two plays' },
  { id: 'media',           name: 'Media Studies',     Icon: Tv,          category: 'Arts',          desc: 'Media language, representation & industries' },
  { id: 'politics',        name: 'Politics',          Icon: Building2,   category: 'Social Sciences',desc: 'UK politics, global politics & political ideas' },
  { id: 'law',             name: 'Law',               Icon: Scale,       category: 'Social Sciences',desc: 'Criminal law, tort, contract & the legal system' },
  { id: 'philosophy',      name: 'Philosophy',        Icon: MessageCircle,category: 'Humanities',  desc: 'Epistemology, ethics, philosophy of mind & political philosophy' },
  { id: 'pe',              name: 'Physical Education',Icon: Dumbbell,    category: 'Arts',          desc: 'Sports science, physiology & performance analysis' },
];

const US_SUBJECTS = {
  9: [
    { id: 'english9',       name: 'English 9',              Icon: PenLine,     category: 'Language Arts', desc: 'Composition, literature & language arts fundamentals' },
    { id: 'algebra1',       name: 'Algebra I',              Icon: Calculator,  category: 'Mathematics',   desc: 'Linear equations, inequalities, functions & data analysis' },
    { id: 'geometry',       name: 'Geometry',               Icon: Triangle,    category: 'Mathematics',   desc: 'Euclidean geometry, proofs, transformations & measurement' },
    { id: 'biology',        name: 'Biology',                Icon: Dna,         category: 'Sciences',      desc: 'Cell biology, genetics, ecology & evolution' },
    { id: 'earth_science',  name: 'Earth Science',          Icon: Globe,       category: 'Sciences',      desc: 'Geology, meteorology, oceanography & astronomy' },
    { id: 'world_history',  name: 'World History',          Icon: Globe2,      category: 'Social Studies',desc: 'Ancient civilizations through modern world events' },
    { id: 'pe',             name: 'Physical Education',     Icon: Dumbbell,    category: 'Electives',     desc: 'Fitness, team sports & health education' },
    { id: 'health',         name: 'Health',                 Icon: Heart,       category: 'Electives',     desc: 'Personal health, nutrition & wellness' },
    { id: 'computer_science',name: 'Intro to Computer Science',Icon: Code2,   category: 'Sciences',      desc: 'Programming basics, digital literacy & problem solving' },
    { id: 'art',            name: 'Visual Arts',            Icon: Palette,     category: 'Electives',     desc: 'Drawing, painting, sculpture & art history' },
    { id: 'music',          name: 'Music',                  Icon: Music,       category: 'Electives',     desc: 'Music theory, performance & appreciation' },
    { id: 'spanish1',       name: 'Spanish I',              Icon: Languages,   category: 'Languages',     desc: 'Introductory Spanish language & culture' },
    { id: 'french1',        name: 'French I',               Icon: Languages,   category: 'Languages',     desc: 'Introductory French language & culture' },
    { id: 'drama',          name: 'Drama / Theater',        Icon: Mic2,        category: 'Electives',     desc: 'Acting, stagecraft & theater production' },
  ],
  10: [
    { id: 'english10',      name: 'English 10',             Icon: PenLine,     category: 'Language Arts', desc: 'World literature, composition & critical thinking' },
    { id: 'algebra2',       name: 'Algebra II',             Icon: Calculator,  category: 'Mathematics',   desc: 'Polynomial functions, exponentials & logarithms' },
    { id: 'geometry',       name: 'Geometry',               Icon: Triangle,    category: 'Mathematics',   desc: 'Proofs, coordinate geometry & trigonometry intro' },
    { id: 'chemistry',      name: 'Chemistry',              Icon: FlaskConical,category: 'Sciences',      desc: 'Atomic theory, chemical bonding & reactions' },
    { id: 'biology',        name: 'Biology',                Icon: Dna,         category: 'Sciences',      desc: 'Advanced cell biology, genetics & physiology' },
    { id: 'world_history2', name: 'World History II',       Icon: Globe2,      category: 'Social Studies',desc: 'Modern world history from 1500 to present' },
    { id: 'us_history',     name: 'US History',             Icon: Landmark,    category: 'Social Studies',desc: 'American history from founding to the modern era' },
    { id: 'computer_science',name: 'Computer Science',      Icon: Code2,       category: 'Sciences',      desc: 'Programming, data structures & algorithms' },
    { id: 'spanish2',       name: 'Spanish II',             Icon: Languages,   category: 'Languages',     desc: 'Intermediate Spanish language & literature' },
    { id: 'french2',        name: 'French II',              Icon: Languages,   category: 'Languages',     desc: 'Intermediate French language & culture' },
    { id: 'psychology',     name: 'Psychology',             Icon: Brain,       category: 'Social Studies',desc: 'Introduction to human behavior & mental processes' },
    { id: 'art',            name: 'Visual Arts',            Icon: Palette,     category: 'Electives',     desc: 'Advanced drawing, painting & digital media' },
    { id: 'pe',             name: 'Physical Education',     Icon: Dumbbell,    category: 'Electives',     desc: 'Advanced fitness & sports specialization' },
  ],
  11: [
    { id: 'english11',      name: 'American Literature',    Icon: BookOpen,    category: 'Language Arts', desc: 'American literary history, analysis & writing' },
    { id: 'ap_english_lang',name: 'AP English Language',    Icon: PenLine,     category: 'Language Arts', desc: 'Rhetorical analysis, argumentation & synthesis essays' },
    { id: 'precalc',        name: 'Pre-Calculus',           Icon: Calculator,  category: 'Mathematics',   desc: 'Trigonometry, analytic geometry & limits intro' },
    { id: 'ap_calc_ab',     name: 'AP Calculus AB',         Icon: Sigma,       category: 'Mathematics',   desc: 'Differential & integral calculus' },
    { id: 'ap_stats',       name: 'AP Statistics',          Icon: BarChart2,   category: 'Mathematics',   desc: 'Exploratory analysis, probability & inference' },
    { id: 'physics',        name: 'Physics',                Icon: Zap,         category: 'Sciences',      desc: 'Mechanics, electricity, magnetism & waves' },
    { id: 'ap_bio',         name: 'AP Biology',             Icon: Dna,         category: 'Sciences',      desc: 'Advanced cellular biology, genetics & ecology' },
    { id: 'ap_chem',        name: 'AP Chemistry',           Icon: FlaskConical,category: 'Sciences',      desc: 'Advanced chemical reactions, thermodynamics & kinetics' },
    { id: 'ap_cs_a',        name: 'AP Computer Science A',  Icon: Code2,       category: 'Sciences',      desc: 'Object-oriented programming in Java' },
    { id: 'us_history',     name: 'US History',             Icon: Landmark,    category: 'Social Studies',desc: 'In-depth American history & document analysis' },
    { id: 'ap_us_history',  name: 'AP US History',          Icon: Landmark,    category: 'Social Studies',desc: 'Comprehensive US history with DBQs & essays' },
    { id: 'economics',      name: 'Economics',              Icon: TrendingUp,  category: 'Social Studies',desc: 'Micro & macroeconomics fundamentals' },
    { id: 'ap_psych',       name: 'AP Psychology',          Icon: Brain,       category: 'Social Studies',desc: 'Human behavior, cognition & research methods' },
    { id: 'spanish3',       name: 'Spanish III',            Icon: Languages,   category: 'Languages',     desc: 'Advanced Spanish conversation & literature' },
    { id: 'ap_spanish',     name: 'AP Spanish Language',    Icon: Languages,   category: 'Languages',     desc: 'AP-level Spanish language & culture' },
  ],
  12: [
    { id: 'english12',      name: 'English 12',             Icon: PenLine,     category: 'Language Arts', desc: 'British literature, composition & college essay writing' },
    { id: 'ap_english_lit', name: 'AP English Literature',  Icon: BookOpen,    category: 'Language Arts', desc: 'Advanced literary analysis, poetry & prose' },
    { id: 'ap_calc_bc',     name: 'AP Calculus BC',         Icon: Sigma,       category: 'Mathematics',   desc: 'Advanced calculus including series & parametric equations' },
    { id: 'ap_stats',       name: 'AP Statistics',          Icon: BarChart2,   category: 'Mathematics',   desc: 'Statistical inference, regression & experimental design' },
    { id: 'ap_physics_1',   name: 'AP Physics 1',           Icon: Zap,         category: 'Sciences',      desc: 'Algebra-based mechanics & waves' },
    { id: 'ap_physics_c',   name: 'AP Physics C',           Icon: Zap,         category: 'Sciences',      desc: 'Calculus-based mechanics & electromagnetism' },
    { id: 'ap_bio',         name: 'AP Biology',             Icon: Dna,         category: 'Sciences',      desc: 'Advanced biology with free-response mastery' },
    { id: 'ap_environ',     name: 'AP Environmental Science',Icon: Leaf,       category: 'Sciences',      desc: 'Earth systems, pollution, biodiversity & sustainability' },
    { id: 'ap_gov',         name: 'AP Government & Politics',Icon: Building2,  category: 'Social Studies',desc: 'US political institutions, systems & policy analysis' },
    { id: 'ap_econ_micro',  name: 'AP Microeconomics',      Icon: TrendingUp,  category: 'Social Studies',desc: 'Consumer & producer theory, market structures' },
    { id: 'ap_econ_macro',  name: 'AP Macroeconomics',      Icon: BarChart2,   category: 'Social Studies',desc: 'National income, money & international economics' },
    { id: 'sociology',      name: 'Sociology',              Icon: Users,       category: 'Social Studies',desc: 'Social institutions, culture & inequality' },
    { id: 'ap_cs_principles',name: 'AP CS Principles',      Icon: Code2,       category: 'Sciences',      desc: 'Computing impacts, big data & creative development' },
    { id: 'philosophy',     name: 'Philosophy',             Icon: MessageCircle,category: 'Electives',   desc: 'Ethics, logic, epistemology & political philosophy' },
    { id: 'ap_spanish',     name: 'AP Spanish Language',    Icon: Languages,   category: 'Languages',     desc: 'Near-native Spanish communication & analysis' },
    { id: 'ap_french',      name: 'AP French Language',     Icon: Languages,   category: 'Languages',     desc: 'Near-native French communication & analysis' },
    { id: 'film',           name: 'Film Studies',           Icon: Film,        category: 'Electives',     desc: 'Film history, analysis & production' },
  ],
};

const CURRICULA = {
  uk: {
    id: 'uk',
    name: 'UK High School',
    shortName: 'UK HS',
    Flag: FlagUK,
    subtitle: 'AQA · Edexcel · OCR · WJEC',
    description: 'GCSE & A-Level curriculum aligned resources covering all major exam boards in England, Wales & Scotland',
    grades: {
      9:  { label: 'Year 10', subtitle: 'GCSE — Year 1',       examBoard: 'AQA / Edexcel / OCR', subjects: UK_GCSE_SUBJECTS   },
      10: { label: 'Year 11', subtitle: 'GCSE — Exam Year',    examBoard: 'AQA / Edexcel / OCR', subjects: UK_GCSE_SUBJECTS   },
      11: { label: 'Year 12', subtitle: 'A-Level — AS Year',   examBoard: 'AQA / Edexcel / OCR', subjects: UK_ALEVEL_SUBJECTS },
      12: { label: 'Year 13', subtitle: 'A-Level — Exam Year', examBoard: 'AQA / Edexcel / OCR', subjects: UK_ALEVEL_SUBJECTS },
    },
  },
  us: {
    id: 'us',
    name: 'American High School',
    shortName: 'US HS',
    Flag: FlagUS,
    subtitle: 'Common Core · AP · SAT Prep',
    description: 'College-prep curriculum resources aligned to Common Core standards for American high school students in grades 9–12',
    grades: {
      9:  { label: 'Grade 9',  subtitle: 'Freshman Year',   examBoard: 'Common Core',       subjects: US_SUBJECTS[9]  },
      10: { label: 'Grade 10', subtitle: 'Sophomore Year',  examBoard: 'Common Core',       subjects: US_SUBJECTS[10] },
      11: { label: 'Grade 11', subtitle: 'Junior Year',     examBoard: 'Common Core + AP',  subjects: US_SUBJECTS[11] },
      12: { label: 'Grade 12', subtitle: 'Senior Year',     examBoard: 'AP + College Prep', subjects: US_SUBJECTS[12] },
    },
  },
};

const GRADE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316'];
const EXCLUDED_CATEGORIES = new Set(['Arts', 'Languages', 'Language Arts', 'Electives']);

const CATEGORY_COLOR = {
  'STEM':           '#22c55e',
  'Humanities':     '#3b82f6',
  'Languages':      '#a855f7',
  'Arts':           '#ec4899',
  'Social Sciences':'#f97316',
  'Mathematics':    '#22c55e',
  'Language Arts':  '#3b82f6',
  'Sciences':       '#06b6d4',
  'Social Studies': '#f97316',
  'Electives':      '#84736e',
};

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function subjectLabel(s) {
  return (s || 'General').replace(/_/g, ' ');
}

function fmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeStr(value) {
  return String(value || '').trim().toLowerCase();
}

function getDocKey(doc) {
  return doc.doc_id || doc.id || `${doc.filename || 'doc'}-${doc.created_at || ''}`;
}

const SELECTED_DOCS_KEY = 'ctx_selected_doc_ids';

function loadSelectedDocIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SELECTED_DOCS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function Breadcrumb({ curriculum, grade, subject, onLanding, onCurriculum, onGrade }) {
  const curr = curriculum ? CURRICULA[curriculum] : null;
  const gradeInfo = curr && grade ? curr.grades[grade] : null;
  return (
    <nav className="ch-breadcrumb" aria-label="breadcrumb">
      <button className="ch-bc-item ch-bc-link" onClick={onLanding}>
        <Home size={13} />
        <span>Context Hub</span>
      </button>
      {curr && (
        <>
          <ChevronRight size={12} className="ch-bc-sep" />
          <button className="ch-bc-item ch-bc-link" onClick={onCurriculum}>
            <curr.Flag size={16} />
            <span>{curr.shortName}</span>
          </button>
        </>
      )}
      {gradeInfo && (
        <>
          <ChevronRight size={12} className="ch-bc-sep" />
          <button className="ch-bc-item ch-bc-link" onClick={onGrade}>{gradeInfo.label}</button>
        </>
      )}
      {subject && (
        <>
          <ChevronRight size={12} className="ch-bc-sep" />
          <span className="ch-bc-item ch-bc-current">
            <subject.Icon size={12} />
            {subject.name}
          </span>
        </>
      )}
    </nav>
  );
}

function DocRow({ doc, isNew, isSelected, onSelect, onDelete, onAction, isOwn = true }) {
  const docId = doc.doc_id || doc.id;
  const name  = doc.title || doc.filename || 'Untitled';
  const isPublic = doc.scope === 'public' || doc.scope === 'community';

  return (
    <div className={`doc-row ${isSelected ? 'doc-row--selected' : ''} ${isNew ? 'doc-row--new' : ''}`}>
      <button className="doc-row-select" onClick={() => docId && onSelect(docId, name)}
        title={isSelected ? 'Remove from context' : 'Select for context'}>
        {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>

      <div className="doc-row-icon-wrap">
        <FileText size={18} />
      </div>

      <div className="doc-row-info">
        <div className="doc-row-name">
          {name}
          {isNew && <span className="doc-row-new-tag">New</span>}
        </div>
        <div className="doc-row-meta">
          {isPublic ? 'Community' : 'Private'}
          {doc.created_at && <> · {fmtDate(doc.created_at)}</>}
          {doc.chunk_count ? <> · {doc.chunk_count} chunks</> : null}
        </div>
      </div>

      <div className="doc-row-actions">
        <button className="doc-action-chip doc-action-chip--chat"
          onClick={() => docId && onAction(doc, 'chat')} title="Open in AI Chat">
          <MessageCircle size={12} />AI Chat
        </button>
        <button className="doc-action-chip doc-action-chip--notes"
          onClick={() => docId && onAction(doc, 'notes')} title="Open in Notes">
          <PenLine size={12} />Notes
        </button>
        <button className="doc-action-chip doc-action-chip--flash"
          onClick={() => docId && onAction(doc, 'flash')} title="Create Flashcards">
          <BookOpen size={12} />Flashcards
        </button>
        <button className="doc-action-chip doc-action-chip--quiz"
          onClick={() => docId && onAction(doc, 'quiz')} title="Create Quiz">
          <Brain size={12} />Quiz
        </button>
        {isOwn && (
          <button className="doc-action-chip doc-action-chip--delete"
            onClick={() => docId && onDelete(docId)} title="Delete">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function DocCard({ doc, viewMode, onDelete, isOwn, isSelected, onToggleSelect, onAction, isNew = false }) {
  return (
    <DocRow
      doc={doc}
      isNew={isNew}
      isSelected={isSelected}
      onSelect={(id, n) => onToggleSelect(id)}
      onDelete={onDelete}
      onAction={onAction || (() => {})}
      isOwn={isOwn}
    />
  );
}

const CARD_FEATURE_STATS = [
  { id: 'chat',       icon: MessageCircle, color: '#c084fc', label: 'Chat'  },
  { id: 'flashcards', icon: Layers,        color: '#34d399', label: 'Cards' },
  { id: 'notes',      icon: PenLine,       color: '#60a5fa', label: 'Notes' },
  { id: 'quiz',       icon: Brain,         color: '#fb923c', label: 'Quiz'  },
  { id: 'roadmap',    icon: Target,        color: '#22d3ee', label: 'Map'   },
];

function MyDocFileCard({ doc, usageStats, isNew, isSelected, onToggleSelect, onDelete, onAction, onNavigate }) {
  const docId = doc.doc_id || doc.id;
  const name  = doc.filename || doc.title || 'Untitled';
  const acts  = usageStats?.actions && typeof usageStats.actions === 'object' ? usageStats.actions : {};
  const total = CARD_FEATURE_STATS.reduce((a, f) => a + (Number(acts[f.id] || 0)), 0);
  const isPublic = doc.scope === 'public' || doc.scope === 'hs_shared';

  return (
    <article
      className={`ch-myfile-card ${isSelected ? 'ch-myfile-card--ctx' : ''} ${isNew ? 'ch-myfile-card--new' : ''}`}
      onClick={() => onNavigate(docId)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onNavigate(docId)}
    >
      <div className="ch-myfile-top">
        <div className="ch-myfile-icon"><FileText size={18} /></div>
        <div className="ch-myfile-pill-row">
          {isPublic
            ? <span className="ch-myfile-pill ch-myfile-pill--pub">Community</span>
            : <span className="ch-myfile-pill">Private</span>}
          {isNew && <span className="ch-myfile-pill ch-myfile-pill--new">New</span>}
          {isSelected && <span className="ch-myfile-pill ch-myfile-pill--ctx">In Deck</span>}
        </div>
      </div>

      <div className="ch-myfile-name">{name}</div>

      <div className="ch-myfile-meta">
        <span>{subjectLabel(doc.subject || 'General')}</span>
        <span className="ch-myfile-dot">·</span>
        <span>{doc.chunk_count || 0} chunks</span>
        {doc.created_at && (
          <><span className="ch-myfile-dot">·</span><span>{fmtDate(doc.created_at)}</span></>
        )}
      </div>

      <div className="ch-myfile-usage">
        {CARD_FEATURE_STATS.map(f => {
          const count = Number(acts[f.id] || 0);
          const FIcon = f.icon;
          return (
            <div
              key={f.id}
              className="ch-myfile-usage-item"
              style={{ '--fsc': f.color, opacity: count > 0 ? 1 : 0.28 }}
              title={`${f.label}: ${count}×`}
            >
              <FIcon size={10} />
              <span>{count}</span>
            </div>
          );
        })}
        {total > 0 && <span className="ch-myfile-total-uses">{total}× total</span>}
      </div>

      <div className="ch-myfile-actions" onClick={e => e.stopPropagation()}>
        <button
          className={`ch-myfile-btn ${isSelected ? 'ch-myfile-btn--in-deck' : 'ch-myfile-btn--add'}`}
          onClick={e => { e.stopPropagation(); onToggleSelect(docId); }}
        >
          {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
          {isSelected ? 'In Deck' : 'Add to Deck'}
        </button>
        <button
          className="ch-myfile-btn ch-myfile-btn--action ch-myfile-btn--chat"
          onClick={e => { e.stopPropagation(); onAction(doc, 'chat'); }}
          title="Open in AI Chat"
        >
          <MessageCircle size={12} />Chat
        </button>
        <button
          className="ch-myfile-btn ch-myfile-btn--action ch-myfile-btn--quiz"
          onClick={e => { e.stopPropagation(); onAction(doc, 'quiz'); }}
          title="Create Quiz"
        >
          <Brain size={12} />Quiz
        </button>
        <button
          className="ch-myfile-btn ch-myfile-btn--del"
          onClick={e => { e.stopPropagation(); onDelete(docId); }}
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </article>
  );
}

function UploadModal({ isOpen, onClose, curriculum, grade, subject, onUploaded }) {
  const navigate = useNavigate();
  const [file, setFile]       = useState(null);
  const [scope, setScope]     = useState('private');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const curr      = curriculum ? CURRICULA[curriculum] : null;
  const gradeInfo = curr && grade ? curr.grades[grade] : null;

  useEffect(() => {
    if (isOpen) { setFile(null); setError(''); setSuccess(false); setUploadedFilename(''); setScope('private'); }
  }, [isOpen]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) { setError('Please select a file.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await contextService.uploadDocument(
        file,
        subject?.id || '',
        grade ? String(grade) : '',
        scope,
        { sourceName: curr?.shortName || '' }
      );
      setUploadedFilename(result?.filename || file.name);
      setSuccess(true);
      if (onUploaded) onUploaded(result);
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="ch-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ch-modal">
        <div className="ch-modal-header">
          <div className="ch-modal-header-info">
            <h3 className="ch-modal-title">Upload Document</h3>
            <p className="ch-modal-subtitle">
              {curr ? curr.name : 'Custom Context'}
              {gradeInfo ? ` · ${gradeInfo.label}` : ''}
              {subject ? ` · ${subject.name}` : ''}
            </p>
          </div>
          <button className="ch-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ch-modal-body">
          {success ? (
            <div className="ch-modal-success">
              <CheckCircle size={36} className="ch-modal-success-icon" />
              <p className="ch-modal-success-title">Document uploaded!</p>
              {uploadedFilename && (
                <p className="ch-modal-success-file">{uploadedFilename}</p>
              )}
              <p className="ch-modal-success-sub">
                Auto-selected as context. Open AI Chat or Notes to use it.
              </p>
              <div className="ch-modal-success-actions">
                <button className="ch-btn ch-btn--primary" onClick={() => navigate('/ai-chat')}>
                  <MessageCircle size={14} />Open AI Chat
                </button>
                <button className="ch-btn ch-btn--ghost" onClick={onClose}>
                  Stay Here
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`ch-drop-zone ${dragOver ? 'ch-drop-zone--active' : ''} ${file ? 'ch-drop-zone--has-file' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
                role="button"
                tabIndex={0}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])}
                />
                {file ? (
                  <div className="ch-drop-file">
                    <FileText size={26} className="ch-drop-file-icon-svg" />
                    <div>
                      <p className="ch-drop-file-name">{file.name}</p>
                      <p className="ch-drop-file-size">{fmtBytes(file.size)}</p>
                    </div>
                    <button className="ch-drop-file-remove" onClick={e => { e.stopPropagation(); setFile(null); }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={28} className="ch-drop-icon" />
                    <p className="ch-drop-label">Drop file here or <span>browse</span></p>
                    <p className="ch-drop-hint">Supports PDF, TXT, MD · Max 50 MB</p>
                  </>
                )}
              </div>

              <div className="ch-modal-scope">
                <p className="ch-modal-scope-label">Visibility</p>
                <div className="ch-scope-options">
                  <button
                    className={`ch-scope-btn ${scope === 'private' ? 'ch-scope-btn--active' : ''}`}
                    onClick={() => setScope('private')}
                  >
                    <Lock size={14} />
                    <div>
                      <span className="ch-scope-btn-title">Private</span>
                      <span className="ch-scope-btn-desc">Only you can see this</span>
                    </div>
                  </button>
                  <button
                    className={`ch-scope-btn ${scope === 'public' ? 'ch-scope-btn--active' : ''}`}
                    onClick={() => setScope('public')}
                  >
                    <Users size={14} />
                    <div>
                      <span className="ch-scope-btn-title">Contribute to Community</span>
                      <span className="ch-scope-btn-desc">Share with all Cerbyl students</span>
                    </div>
                  </button>
                </div>
              </div>

              {error && (
                <div className="ch-modal-error">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="ch-modal-actions">
                <button className="ch-btn ch-btn--ghost" onClick={onClose}>Cancel</button>
                <button className="ch-btn ch-btn--primary" onClick={handleSubmit} disabled={loading || !file}>
                  {loading ? <Loader2 size={14} className="ch-spinner" /> : <Upload size={14} />}
                  {loading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadView({ onSuccess }) {
  const [file, setFile]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const result = await contextService.uploadDocument(file, '', '', 'private');
      if (onSuccess) onSuccess(result);
    } catch (e) {
      setError(e.message || 'Upload failed');
      setLoading(false);
    }
  };

  return (
    <div className="ch-upload-page">
      <div className="ch-upload-page-header">
        <h2><Upload size={20} />Upload Document</h2>
        <p>Supports PDF, TXT, Markdown — up to 50 MB. After upload, you'll be taken to your document library.</p>
      </div>

      <div
        className={`ch-upload-dz ${dragOver ? 'ch-upload-dz--active' : ''} ${file ? 'ch-upload-dz--ready' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !file) { e.preventDefault(); fileRef.current?.click(); } }}
        role="button"
        tabIndex={0}
      >
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }}
          onChange={e => { setFile(e.target.files[0]); setError(''); }} />

        {file ? (
          <div className="ch-upload-dz-file">
            <FileText size={40} className="ch-upload-dz-file-icon" />
            <div>
              <p className="ch-upload-dz-file-name">{file.name}</p>
              <p className="ch-upload-dz-file-size">{fmtBytes(file.size)}</p>
            </div>
            <button className="ch-upload-dz-remove" onClick={e => { e.stopPropagation(); setFile(null); }}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="ch-upload-dz-icon"><Upload size={40} /></div>
            <p className="ch-upload-dz-label">Drop file here or <span onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>browse</span></p>
            <div className="ch-upload-dz-pills">
              <span>PDF</span><span>TXT</span><span>MD</span>
            </div>
          </>
        )}
      </div>

      {error && <div className="ch-upload-page-error"><AlertCircle size={14} />{error}</div>}

      <button className="ch-upload-page-btn" onClick={handleSubmit} disabled={!file || loading}>
        {loading ? <><Loader2 size={16} className="ch-spinner" />Uploading…</> : <><Upload size={16} />Upload</>}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ContextHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-driven navigation state ────────────────────────────────────────────
  const urlC = searchParams.get('c');
  const urlG = searchParams.get('g') ? Number(searchParams.get('g')) : null;
  const urlS = searchParams.get('s');
  const urlViewParam = searchParams.get('view');

  const selectedCurriculum = urlC && CURRICULA[urlC] ? urlC : null;
  const curr               = selectedCurriculum ? CURRICULA[selectedCurriculum] : null;
  const selectedGrade      = curr && urlG && curr.grades[urlG] ? urlG : null;
  const gradeInfo          = curr && selectedGrade ? curr.grades[selectedGrade] : null;
  const selectedSubject    = gradeInfo && urlS ? (gradeInfo.subjects.find(s => s.id === urlS) || null) : null;
  const view               = urlViewParam === 'ask'     ? 'ask'
    : urlViewParam === 'upload'  ? 'upload'
    : urlViewParam === 'library' ? 'library'
    : urlViewParam === 'custom'  ? 'library'
    : selectedSubject    ? 'subject'
    : selectedGrade      ? 'grade'
    : selectedCurriculum ? 'curriculum'
    : 'landing';

  const [myDocs, setMyDocs]               = useState([]);
  const [communityDocs, setCommunityDocs] = useState([]);
  const [docsLoading, setDocsLoading]     = useState(false);
  const [docsError, setDocsError]         = useState('');
  const [docTab, setDocTab]               = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [viewMode, setViewMode]           = useState('grid');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedDocIds, setSelectedDocIds] = useState(loadSelectedDocIds);

  const [activeContext, setActiveContext] = useState(() => {
    try { return JSON.parse(localStorage.getItem('active_context') || 'null'); } catch { return null; }
  });
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');

  const [uploadOpen, setUploadOpen]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  ));
  const [stats, setStats]             = useState({ myDocs: 0, communityDocs: 0 });
  const [libScope, setLibScope]       = useState('all');
  const [highlightedDocId, setHighlightedDocId] = useState(null);

  const [allActionStats, setAllActionStats] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem('ctx_file_action_stats') || '{}');
      return p && typeof p === 'object' ? p : {};
    } catch { return {}; }
  });

  useEffect(() => {
    const refresh = () => {
      try {
        const p = JSON.parse(localStorage.getItem('ctx_file_action_stats') || '{}');
        setAllActionStats(p && typeof p === 'object' ? p : {});
      } catch {}
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // ── Ask Your Notes state ───────────────────────────────────────────────────
  const [askHistory, setAskHistory]   = useState([]);
  const [askInput, setAskInput]       = useState('');
  const [askLoading, setAskLoading]   = useState(false);
  const [askUseHs, setAskUseHs]       = useState(true);
  const askEndRef                      = useRef(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError('');
    try {
      const all  = await contextService.listDocuments();
      const docs = Array.isArray(all) ? all : (all.user_docs || all.documents || []);
      const community = docs.filter(d => d.scope === 'public' || d.scope === 'hs_shared');
      setMyDocs(docs);
      setCommunityDocs(community);
      setStats(s => ({ ...s, myDocs: docs.length, communityDocs: community.length }));
    } catch (e) {
      setDocsError(e.message || 'Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const loadCommunityDocs = useCallback(async (curriculumId, gradeNum, subjectId) => {
    try {
      const data = await contextService.listCommunityDocuments({ curriculum: curriculumId, grade: gradeNum, subject: subjectId });
      setCommunityDocs(Array.isArray(data) ? data : (data.documents || []));
    } catch { /* silenced */ }
  }, []);

  const persistSelectedDocs = useCallback((ids) => {
    localStorage.setItem(SELECTED_DOCS_KEY, JSON.stringify(ids));
  }, []);

  const toggleDocSelection = useCallback((docId) => {
    if (!docId) return;
    setSelectedDocIds(prev => {
      const exists = prev.includes(docId);
      const next = exists ? prev.filter(id => id !== docId) : [...prev, docId];
      persistSelectedDocs(next);
      return next;
    });
  }, [persistSelectedDocs]);

  const clearSelectedDocs = useCallback(() => {
    setSelectedDocIds([]);
    persistSelectedDocs([]);
  }, [persistSelectedDocs]);

  useEffect(() => {
    if (view === 'subject' && selectedSubject) {
      loadDocs();
      loadCommunityDocs(selectedCurriculum, selectedGrade, selectedSubject?.id);
    }
    if (view === 'ask' || view === 'library') {
      loadDocs();
    }
  }, [urlC, urlG, urlS, urlViewParam, loadDocs, loadCommunityDocs]); // eslint-disable-line

  // ── Active Context ─────────────────────────────────────────────────────────
  const addToRecent = useCallback((curriculum, grade, subject) => {
    if (!curriculum || !grade || !subject) return;
    try {
      const raw = JSON.parse(localStorage.getItem('context_history') || '[]');
      const filtered = raw.filter(r => !(r.curriculum === curriculum && r.grade === grade && r.subject === subject.id));
      const next = [{ curriculum, grade, subject: subject.id, name: subject.name }, ...filtered].slice(0, 4);
      localStorage.setItem('context_history', JSON.stringify(next));
    } catch {}
  }, []);

  const setAsActiveContext = useCallback(() => {
    const ctx = { curriculum: selectedCurriculum, grade: selectedGrade, subject: selectedSubject?.id };
    localStorage.setItem('active_context', JSON.stringify(ctx));
    localStorage.setItem('hs_mode_enabled', 'true');
    setActiveContext(ctx);
    setHsMode(true);
    addToRecent(selectedCurriculum, selectedGrade, selectedSubject);
  }, [selectedCurriculum, selectedGrade, selectedSubject, addToRecent]);

  const clearActiveContext = useCallback(() => {
    localStorage.removeItem('active_context');
    localStorage.setItem('hs_mode_enabled', 'false');
    setActiveContext(null);
    setHsMode(false);
  }, []);

  const isCurrentActive = activeContext &&
    activeContext.curriculum === selectedCurriculum &&
    activeContext.grade === selectedGrade &&
    activeContext.subject === selectedSubject?.id;

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goLanding = () => { setSearchParams({}); setCategoryFilter('all'); setSearchQuery(''); };
  const goCurriculum = (id) => { setSearchParams({ c: id }); setCategoryFilter('all'); };
  const goGrade = (g) => { setSearchParams({ c: selectedCurriculum, g: String(g) }); setCategoryFilter('all'); setSearchQuery(''); };
  const goSubject = (s) => { setSearchParams({ c: selectedCurriculum, g: String(selectedGrade), s: s.id }); setDocTab('all'); setSearchQuery(''); };
  const goBack = () => {
    if (view === 'subject')         setSearchParams({ c: urlC, g: String(urlG) });
    else if (view === 'grade')      setSearchParams({ c: urlC });
    else if (view === 'curriculum') setSearchParams({});
    else if (view === 'custom')     setSearchParams({});
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await contextService.deleteDocument(docId);
      setMyDocs(prev => prev.filter(d => (d.doc_id || d.id) !== docId));
      setCommunityDocs(prev => prev.filter(d => (d.doc_id || d.id) !== docId));
      setSelectedDocIds(prev => {
        const next = prev.filter(id => id !== docId);
        persistSelectedDocs(next);
        return next;
      });
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  }, [persistSelectedDocs]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredSubjects = useMemo(() => (
    gradeInfo
      ? gradeInfo.subjects.filter(s => {
          if (EXCLUDED_CATEGORIES.has(s.category)) return false;
          const matchCat = categoryFilter === 'all' || s.category === categoryFilter;
          const matchSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        })
      : []
  ), [gradeInfo, categoryFilter, searchQuery]);

  const filteredDocs = useMemo(() => {
    let base = docTab === 'community' ? communityDocs
      : docTab === 'mine' ? myDocs
      : [...communityDocs, ...myDocs];

    if (docTab === 'all') {
      const seen = new Set();
      base = base.filter((doc) => {
        const key = getDocKey(doc);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (selectedSubject?.id) {
      const selectedSubjectId = normalizeStr(selectedSubject.id);
      const selectedSubjectName = normalizeStr(selectedSubject.name);
      const selectedGradeStr = selectedGrade ? String(selectedGrade) : '';
      base = base.filter((doc) => {
        const docSubject = normalizeStr(doc.subject);
        const tags = Array.isArray(doc.topic_tags) ? doc.topic_tags.map(normalizeStr) : [];
        const subjectMatches = docSubject === selectedSubjectId || tags.includes(selectedSubjectId) || tags.includes(selectedSubjectName);
        if (!subjectMatches) return false;
        if (selectedGradeStr && doc.grade_level && String(doc.grade_level) !== selectedGradeStr) return false;
        return true;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      base = base.filter(d => (d.title || d.filename || '').toLowerCase().includes(query));
    }
    return base;
  }, [docTab, communityDocs, myDocs, selectedSubject, selectedGrade, searchQuery]);

  const MAX_RENDERED_DOCS = 250;
  const visibleDocs = useMemo(() => filteredDocs.slice(0, MAX_RENDERED_DOCS), [filteredDocs]);
  const selectedDocIdSet = useMemo(() => new Set(selectedDocIds), [selectedDocIds]);
  const filteredDocIds = useMemo(
    () => filteredDocs.map(d => d.doc_id || d.id).filter(Boolean),
    [filteredDocs]
  );
  const filteredSelectedCount = useMemo(
    () => filteredDocIds.filter(id => selectedDocIdSet.has(id)).length,
    [filteredDocIds, selectedDocIdSet]
  );

  const selectFilteredDocs = useCallback(() => {
    if (filteredDocIds.length === 0) return;
    setSelectedDocIds(prev => {
      const merged = Array.from(new Set([...prev, ...filteredDocIds]));
      persistSelectedDocs(merged);
      return merged;
    });
  }, [filteredDocIds, persistSelectedDocs]);

  const clearFilteredDocs = useCallback(() => {
    if (filteredDocIds.length === 0) return;
    setSelectedDocIds(prev => {
      const removeSet = new Set(filteredDocIds);
      const next = prev.filter(id => !removeSet.has(id));
      persistSelectedDocs(next);
      return next;
    });
  }, [filteredDocIds, persistSelectedDocs]);

  useEffect(() => {
    if (myDocs.length === 0 && communityDocs.length === 0) return;
    const knownDocIds = new Set(
      [...myDocs, ...communityDocs]
        .map(d => d.doc_id || d.id)
        .filter(Boolean)
    );
    setSelectedDocIds(prev => {
      const next = prev.filter(id => knownDocIds.has(id));
      if (next.length === prev.length) return prev;
      persistSelectedDocs(next);
      return next;
    });
  }, [myDocs, communityDocs, persistSelectedDocs]);

  const activeCtxCurr  = activeContext?.curriculum ? CURRICULA[activeContext.curriculum] : null;
  const activeCtxGrade = activeCtxCurr && activeContext?.grade ? activeCtxCurr.grades[activeContext.grade] : null;

  // ── Doc actions (select + navigate to AI tool) ────────────────────────────
  const handleDocAction = useCallback((doc, action) => {
    const docId = doc.doc_id || doc.id;
    const fname = doc.title || doc.filename || String(docId);
    if (docId) {
      contextService.autoSelectDoc(docId, fname);
      setSelectedDocIds(prev => {
        const id = String(docId);
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        persistSelectedDocs(next);
        return next;
      });
    }
    const routes = { chat: '/ai-chat', notes: '/notes/my-notes', flash: '/flashcards', quiz: '/quiz-hub' };
    navigate(routes[action] || '/ai-chat');
  }, [navigate, persistSelectedDocs]);

  // ── Ask Your Notes ─────────────────────────────────────────────────────────
  const handleAsk = useCallback(async () => {
    const q = askInput.trim();
    if (!q || askLoading) return;
    setAskInput('');
    const entry = { question: q, answer: null, sources: [], loading: true, error: null };
    setAskHistory(prev => [...prev, entry]);
    setAskLoading(true);
    try {
      const res = await contextService.askKnowledgeBase(q, { useHs: askUseHs, topK: 6 });
      setAskHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = { question: q, answer: res.answer, sources: res.sources || [], loading: false, error: null };
        return next;
      });
    } catch (e) {
      setAskHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = { question: q, answer: null, sources: [], loading: false, error: e.message || 'Request failed' };
        return next;
      });
    } finally {
      setAskLoading(false);
    }
  }, [askInput, askLoading, askUseHs]);

  useEffect(() => {
    if (askEndRef.current) askEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [askHistory]);

  // ─── SIDEBAR ──────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className={`ch-qb-sidebar ${!sidebarOpen ? 'ch-qb-sidebar--collapsed' : ''}`} aria-label="Context Hub navigation">
      {!sidebarOpen ? (
        <div className="ch-qb-collapsed-strip">
          <button className="ch-qb-strip-btn ch-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarOpen(true)} type="button">
            <ChevronRight size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${view === 'upload' ? 'active' : ''}`} data-tip="Upload" onClick={() => setSearchParams({ view: 'upload' })} type="button">
            <Upload size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${view === 'library' ? 'active' : ''}`} data-tip="My Documents" onClick={() => { setSearchParams({ view: 'library' }); loadDocs(); }} type="button">
            <FolderOpen size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${view === 'landing' ? 'active' : ''}`} data-tip="Curriculum" onClick={goLanding} type="button">
            <Library size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${selectedCurriculum === 'uk' ? 'active' : ''}`} data-tip="UK High School" onClick={() => goCurriculum('uk')} type="button">
            <FlagUK size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${selectedCurriculum === 'us' ? 'active' : ''}`} data-tip="US High School" onClick={() => goCurriculum('us')} type="button">
            <FlagUS size={18} />
          </button>
          <button className={`ch-qb-strip-btn ${urlViewParam === 'ask' ? 'active' : ''}`} data-tip="Ask Your Notes" onClick={() => setSearchParams({ view: 'ask' })} type="button">
            <MessageCircle size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="ch-qb-side-brand">
            <div className="ch-qb-brand-wrap">
              <div className="ch-qb-brand">cerbyl</div>
              <div className="ch-qb-brand-kicker">Context Hub</div>
            </div>
            <button className="ch-qb-side-close-btn" onClick={() => setSidebarOpen(false)} title="Close sidebar" aria-label="Close sidebar" type="button">
              <ChevronLeft size={14} />
            </button>
          </div>

          <button className="ch-qb-new-btn" onClick={() => setSearchParams({ view: 'upload' })} type="button">
            <Upload size={14} />
            <span>Upload Document</span>
          </button>

          <div className="ch-qb-side-block ch-qb-side-block--grow">
            <div className="ch-qb-side-label">Library</div>
            <nav className="ch-qb-view-nav">
              <button
                className={`ch-qb-view-link ${view === 'library' || view === 'upload' ? 'ch-qb-view-link--active' : ''}`}
                onClick={() => { setSearchParams({ view: 'library' }); loadDocs(); }}
                type="button"
              >
                <FolderOpen size={16} />
                <span>My Documents</span>
              </button>
            </nav>
          </div>

          <div className="ch-qb-side-block">
            <div className="ch-qb-side-label">Curriculum</div>
            <nav className="ch-qb-view-nav">
              <button className={`ch-qb-view-link ${view === 'landing' ? 'ch-qb-view-link--active' : ''}`} onClick={goLanding} type="button">
                <Library size={16} /><span>Browse All</span>
              </button>
              <button className={`ch-qb-view-link ${selectedCurriculum === 'uk' ? 'ch-qb-view-link--active' : ''}`} onClick={() => goCurriculum('uk')} type="button">
                <FlagUK size={16} /><span>UK High School</span>
              </button>
              {selectedCurriculum === 'uk' && Object.entries(CURRICULA.uk.grades).map(([g, info], idx) => (
                <button key={g} className={`ch-qb-view-link ch-qb-view-link--indent ${selectedGrade === Number(g) ? 'ch-qb-view-link--active' : ''}`} onClick={() => goGrade(Number(g))} type="button">
                  <span className="ch-qb-grade-dot" style={{ background: GRADE_COLORS[idx] }} />
                  <span>{info.label}</span>
                </button>
              ))}
              <button className={`ch-qb-view-link ${selectedCurriculum === 'us' ? 'ch-qb-view-link--active' : ''}`} onClick={() => goCurriculum('us')} type="button">
                <FlagUS size={16} /><span>US High School</span>
              </button>
              {selectedCurriculum === 'us' && Object.entries(CURRICULA.us.grades).map(([g, info], idx) => (
                <button key={g} className={`ch-qb-view-link ch-qb-view-link--indent ${selectedGrade === Number(g) ? 'ch-qb-view-link--active' : ''}`} onClick={() => goGrade(Number(g))} type="button">
                  <span className="ch-qb-grade-dot" style={{ background: GRADE_COLORS[idx] }} />
                  <span>{info.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="ch-qb-side-block">
            <div className="ch-qb-side-label">Tools</div>
            <nav className="ch-qb-view-nav">
              <button className={`ch-qb-view-link ${urlViewParam === 'ask' ? 'ch-qb-view-link--active' : ''}`} onClick={() => setSearchParams({ view: 'ask' })} type="button">
                <MessageCircle size={16} /><span>Ask Your Notes</span>
              </button>
            </nav>
          </div>

        </>
      )}
    </aside>
  );

  // ─── LANDING ──────────────────────────────────────────────────────────────
  const LandingView = () => (
    <div className="ch-landing">
      <div className="ch-landing-header">
        <h1 className="ch-landing-title">
          <BookCopy size={28} />
          Context Hub
        </h1>
        <p className="ch-landing-desc">
          Upload your study materials or browse the curriculum library — your AI tutor, flashcards, quizzes, and notes will use them as context.
        </p>
      </div>

      <div className="ch-how-it-works">
        <div className="ch-hiw-step">
          <div className="ch-hiw-num">1</div>
          <div className="ch-hiw-text">
            <strong>Browse or upload</strong>
            <span>Pick a curriculum subject or upload your own notes/PDFs</span>
          </div>
        </div>
        <div className="ch-hiw-arrow"><ChevronRight size={16} /></div>
        <div className="ch-hiw-step">
          <div className="ch-hiw-num">2</div>
          <div className="ch-hiw-text">
            <strong>Select documents</strong>
            <span>Tick the docs you want the AI to read from</span>
          </div>
        </div>
        <div className="ch-hiw-arrow"><ChevronRight size={16} /></div>
        <div className="ch-hiw-step">
          <div className="ch-hiw-num">3</div>
          <div className="ch-hiw-text">
            <strong>Use AI tools</strong>
            <span>AI Chat, Notes, Flashcards & Quizzes all use your context</span>
          </div>
        </div>
      </div>

      <div className="ch-bento">
        <button className="ch-bento-card ch-bento-card--uk" onClick={() => goCurriculum('uk')}>
          <div className="ch-bento-card-bg" />
          <div className="ch-bento-card-inner">
            <div className="ch-bento-card-flag-wrap"><FlagUK size={56} /></div>
            <div className="ch-bento-card-text">
              <h2 className="ch-bento-card-title">UK High School</h2>
              <p className="ch-bento-card-subtitle">AQA · Edexcel · OCR · WJEC</p>
              <p className="ch-bento-card-desc">
                GCSE (Years 10–11) and A-Level (Years 12–13) resources covering all major exam boards.
              </p>
            </div>
            <div className="ch-bento-card-meta">
              <span className="ch-bento-meta-pill"><GraduationCap size={11} />GCSE + A-Level</span>
              <span className="ch-bento-meta-pill"><BookMarked size={11} />4 year groups</span>
              <span className="ch-bento-meta-pill"><Layers size={11} />{UK_ALEVEL_SUBJECTS.length}+ subjects</span>
            </div>
            <div className="ch-bento-card-cta">Explore <ChevronRight size={14} /></div>
          </div>
        </button>

        <button className="ch-bento-card ch-bento-card--us" onClick={() => goCurriculum('us')}>
          <div className="ch-bento-card-bg" />
          <div className="ch-bento-card-inner">
            <div className="ch-bento-card-flag-wrap"><FlagUS size={56} /></div>
            <div className="ch-bento-card-text">
              <h2 className="ch-bento-card-title">American High School</h2>
              <p className="ch-bento-card-subtitle">Common Core · AP · SAT Prep</p>
              <p className="ch-bento-card-desc">
                Grades 9–12 college-prep curriculum with AP courses and standardized test preparation.
              </p>
            </div>
            <div className="ch-bento-card-meta">
              <span className="ch-bento-meta-pill"><GraduationCap size={11} />Grades 9–12</span>
              <span className="ch-bento-meta-pill"><Star size={11} />AP Courses</span>
              <span className="ch-bento-meta-pill"><Layers size={11} />Common Core</span>
            </div>
            <div className="ch-bento-card-cta">Explore <ChevronRight size={14} /></div>
          </div>
        </button>

        <button className="ch-bento-card ch-bento-card--custom" onClick={() => setSearchParams({ view: 'upload' })}>
          <div className="ch-bento-card-inner">
            <div className="ch-bento-card-plus-icon"><Upload size={28} /></div>
            <div className="ch-bento-card-text">
              <h2 className="ch-bento-card-title">Upload Your Own Docs</h2>
              <p className="ch-bento-card-desc">
                Drop in your textbook, syllabus, or notes. It auto-selects as context — open AI Chat and it's already reading from it.
              </p>
            </div>
            <div className="ch-bento-card-meta">
              <span className="ch-bento-meta-pill"><Upload size={11} />PDF / TXT / MD</span>
              <span className="ch-bento-meta-pill"><Sparkles size={11} />Auto-selects as context</span>
            </div>
            <div className="ch-bento-card-cta">Upload Now <ChevronRight size={14} /></div>
          </div>
        </button>

        <div className="ch-bento-card ch-bento-card--stats ch-bento-card--no-hover">
          <div className="ch-bento-card-inner">
            <h3 className="ch-bento-stats-title"><TrendingUp size={16} />Community Library</h3>
            <div className="ch-bento-stats-grid">
              <div className="ch-bento-stat">
                <span className="ch-bento-stat-num">{UK_GCSE_SUBJECTS.length + UK_ALEVEL_SUBJECTS.length}</span>
                <span className="ch-bento-stat-label">UK Subjects</span>
              </div>
              <div className="ch-bento-stat">
                <span className="ch-bento-stat-num">{Object.values(US_SUBJECTS).flat().length}</span>
                <span className="ch-bento-stat-label">US Subjects</span>
              </div>
              <div className="ch-bento-stat">
                <span className="ch-bento-stat-num">{stats.communityDocs}</span>
                <span className="ch-bento-stat-label">Community Docs</span>
              </div>
              <div className="ch-bento-stat">
                <span className="ch-bento-stat-num">{stats.myDocs}</span>
                <span className="ch-bento-stat-label">My Docs</span>
              </div>
            </div>
            <p className="ch-bento-stats-hint">
              <Info size={11} />Upload public documents to help fellow students
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  
  const CurriculumView = () => {
    if (!curr) return null;
    const CurrFlag = curr.Flag;
    return (
      <div className="ch-curriculum-view">
        <div className="ch-view-header">
          <button className="ch-back-btn" onClick={goBack}><ChevronLeft size={20} /></button>
          <div className="ch-view-header-info">
            <CurrFlag size={32} />
            <div>
              <h2 className="ch-view-title">{curr.name}</h2>
            </div>
          </div>
        </div>
        <p className="ch-view-description">{curr.description}</p>

        <div className="ch-grade-grid">
          {Object.entries(curr.grades).map(([g, info], idx) => (
            <button
              key={g}
              className="ch-grade-card"
              style={{ '--grade-color': GRADE_COLORS[idx] }}
              onClick={() => goGrade(Number(g))}
            >
              <div className="ch-grade-card-accent" />
              <div className="ch-grade-card-inner">
                <div className="ch-grade-card-number">
                  <span className="ch-grade-num">{info.label}</span>
                  <span className="ch-grade-sub">{info.subtitle}</span>
                </div>
                <div className="ch-grade-card-info">
                  <p className="ch-grade-exam-board"><BookOpen size={11} />{info.examBoard}</p>
                  <p className="ch-grade-subject-count"><Layers size={11} />{info.subjects.length} subjects</p>
                </div>
                <div className="ch-grade-card-arrow"><ChevronRight size={16} /></div>
              </div>
            </button>
          ))}
        </div>

        <div className="ch-curriculum-feature-row">
          <div className="ch-curriculum-feature">
            <BookMarked size={16} />
            <div>
              <p className="ch-curriculum-feature-title">Community Resources</p>
              <p className="ch-curriculum-feature-desc">PDFs & notes uploaded by students and teachers</p>
            </div>
          </div>
          <div className="ch-curriculum-feature">
            <Shield size={16} />
            <div>
              <p className="ch-curriculum-feature-title">Private Uploads</p>
              <p className="ch-curriculum-feature-desc">Keep your own notes private or share with the community</p>
            </div>
          </div>
          <div className="ch-curriculum-feature">
            <Sparkles size={16} />
            <div>
              <p className="ch-curriculum-feature-title">AI Context Injection</p>
              <p className="ch-curriculum-feature-desc">Set any subject as your active AI tutor context</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  
  const GradeView = () => {
    if (!curr || !gradeInfo) return null;
    const cats = ['all', ...new Set(gradeInfo.subjects.filter(s => !EXCLUDED_CATEGORIES.has(s.category)).map(s => s.category))];
    const CurrFlag = curr.Flag;
    return (
      <div className="ch-grade-view">
        <div className="ch-view-header">
          <button className="ch-back-btn" onClick={goBack}><ChevronLeft size={20} /></button>
          <div className="ch-view-header-info">
            <CurrFlag size={26} />
            <div>
              <h2 className="ch-view-title">{gradeInfo.label}</h2>
            </div>
          </div>
          <div className="ch-view-header-actions">
            <div className="ch-search-bar">
              <Search size={14} />
              <input type="text" placeholder="Search subjects…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="ch-search-input" />
              {searchQuery && <button className="ch-search-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>}
            </div>
          </div>
        </div>

        <div className="ch-category-pills">
          {cats.map(cat => (
            <button
              key={cat}
              className={`ch-category-pill ${categoryFilter === cat ? 'ch-category-pill--active' : ''}`}
              style={cat !== 'all' ? { '--cat-color': CATEGORY_COLOR[cat] || '#888' } : {}}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'all' ? 'All Subjects' : cat}
              <span className="ch-category-pill-count">
                {cat === 'all' ? gradeInfo.subjects.length : gradeInfo.subjects.filter(s => s.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        <div className="ch-subject-grid">
          {filteredSubjects.length === 0 ? (
            <div className="ch-empty-state">
              <Search size={32} />
              <p>No subjects match "{searchQuery}"</p>
              <button className="ch-btn ch-btn--ghost" onClick={() => { setSearchQuery(''); setCategoryFilter('all'); }}>
                Clear filters
              </button>
            </div>
          ) : (
            filteredSubjects.map(subject => {
              const SubjectIcon = subject.Icon;
              return (
                <button
                  key={subject.id}
                  className="ch-subject-card"
                  style={{ '--cat-color': CATEGORY_COLOR[subject.category] || '#888' }}
                  onClick={() => goSubject(subject)}
                >
                  <div className="ch-subject-card-accent" />
                  <div className="ch-subject-card-inner">
                    <div className="ch-subject-icon-wrap">
                      <SubjectIcon size={20} />
                    </div>
                    <div className="ch-subject-info">
                      <h3 className="ch-subject-name">{subject.name}</h3>
                      <p className="ch-subject-desc">{subject.desc}</p>
                    </div>
                    <span
                      className="ch-subject-category"
                      style={{
                        background: `color-mix(in srgb, ${CATEGORY_COLOR[subject.category] || '#888'} 15%, transparent)`,
                        color: CATEGORY_COLOR[subject.category] || '#888'
                      }}
                    >
                      {subject.category}
                    </span>
                  </div>
                  <div className="ch-subject-card-hover-indicator"><ChevronRight size={14} /></div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  
  const SubjectView = () => {
    if (!selectedSubject || !curr || !gradeInfo) return null;
    return (
      <div className="ch-subject-view">
        <div className="ch-view-header">
          <button className="ch-back-btn" onClick={goBack}><ChevronLeft size={20} /></button>
          <div className="ch-view-header-info">
            <div>
              <h2 className="ch-view-title">{selectedSubject.name}</h2>
              <p className="ch-view-subtitle">{selectedSubject.desc}</p>
            </div>
          </div>
          <div className="ch-view-header-actions">
            {isCurrentActive ? (
              <div className="ch-active-badge"><CheckCircle size={13} />Active Context</div>
            ) : (
              <button className="ch-btn ch-btn--set-active" onClick={setAsActiveContext}>
                <Sparkles size={13} />Set as Active Context
              </button>
            )}
            <button className="ch-btn ch-btn--primary" onClick={() => setUploadOpen(true)}>
              <Upload size={14} />Upload
            </button>
          </div>
        </div>

        <div className="ch-docs-controls">
          <div className="ch-doc-tabs">
            {[
              { key: 'all',       label: 'All Resources', icon: FolderOpen },
              { key: 'community', label: 'Community',     icon: Users      },
              { key: 'mine',      label: 'My Documents',  icon: Lock       },
            ].map(tab => {
              const TabIcon = tab.icon;
              return (
                <button key={tab.key} className={`ch-doc-tab ${docTab === tab.key ? 'ch-doc-tab--active' : ''}`}
                  onClick={() => setDocTab(tab.key)}>
                  <TabIcon size={13} />
                  {tab.label}
                  <span className="ch-doc-tab-count">
                    {tab.key === 'all' ? filteredDocs.length
                      : tab.key === 'community' ? communityDocs.length : myDocs.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ch-docs-controls-right">
            <div className="ch-search-bar">
              <Search size={14} />
              <input type="text" placeholder="Search documents…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="ch-search-input" />
              {searchQuery && <button className="ch-search-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>}
            </div>
            <button className="ch-icon-btn" onClick={loadDocs} title="Refresh"><RefreshCw size={14} /></button>
          </div>
        </div>

        {docsLoading ? (
          <div className="ch-docs-loading"><Loader2 size={24} className="ch-spinner" /><p>Loading documents…</p></div>
        ) : docsError ? (
          <div className="ch-docs-error"><AlertCircle size={20} /><p>{docsError}</p>
            <button className="ch-btn ch-btn--ghost" onClick={loadDocs}>Retry</button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="ch-docs-empty">
            <div className="ch-docs-empty-illustration"><FileText size={48} /></div>
            <h3>No documents yet</h3>
            <p>No resources for this subject. Upload your own or be the first to contribute!</p>
            <button className="ch-btn ch-btn--primary" onClick={() => setUploadOpen(true)}>
              <Upload size={14} />Upload Document
            </button>
          </div>
        ) : (
          <div className="ch-doc-list-rows">
            {visibleDocs.map(doc => (
              <DocRow key={getDocKey(doc)}
                doc={doc}
                isNew={false}
                isSelected={selectedDocIdSet.has(doc.doc_id || doc.id)}
                onSelect={(id, name) => { toggleDocSelection(id); contextService.setDocName(id, name); }}
                onDelete={handleDelete}
                onAction={handleDocAction}
                isOwn={doc.owner_is_me !== false}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  
  const now = Date.now();
  const isNewDoc = (doc) => doc.created_at && (now - new Date(doc.created_at).getTime()) < 24 * 60 * 60 * 1000;

  const libDocs = useMemo(() => {
    let base = libScope === 'private'
      ? myDocs.filter(d => d.scope !== 'public' && d.scope !== 'hs_shared')
      : libScope === 'community'
      ? myDocs.filter(d => d.scope === 'public' || d.scope === 'hs_shared')
      : myDocs;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(d => (d.title || d.filename || '').toLowerCase().includes(q));
    }
    return [...base].sort((a, b) => {
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [myDocs, libScope, searchQuery]);

  const LibraryView = () => {
    const isUploadTab = view === 'upload';

    return (
      <div className="ch-library-view">
        {}
        <div className="ch-inner-tabs">
          <button
            className={`ch-inner-tab ${!isUploadTab ? 'ch-inner-tab--active' : ''}`}
            onClick={() => { setSearchParams({ view: 'library' }); if (myDocs.length === 0) loadDocs(); }}
          >
            <FolderOpen size={14} />
            My Docs
            {myDocs.length > 0 && <span className="ch-inner-tab-count">{myDocs.length}</span>}
          </button>
          <button
            className={`ch-inner-tab ${isUploadTab ? 'ch-inner-tab--active' : ''}`}
            onClick={() => setSearchParams({ view: 'upload' })}
          >
            <Upload size={14} />
            Upload
          </button>
        </div>

        {isUploadTab ? (
          
          <div className="ch-lib-upload-wrap">
            <UploadView
              onSuccess={(result) => {
                if (result?.doc_id) {
                  const fname = result.filename || String(result.doc_id);
                  contextService.autoSelectDoc(result.doc_id, fname);
                  setSelectedDocIds(prev => {
                    const id = String(result.doc_id);
                    if (prev.includes(id)) return prev;
                    const next = [...prev, id];
                    persistSelectedDocs(next);
                    return next;
                  });
                  setHighlightedDocId(String(result.doc_id));
                }
                loadDocs();
                setSearchParams({ view: 'library' });
              }}
            />
          </div>
        ) : (
          
          <div className="ch-lib-docs-wrap">
            <div className="ch-lib-docs-header">
              <div className="ch-lib-docs-header-left">
                <span className="ch-lib-docs-count">
                  {myDocs.length} document{myDocs.length !== 1 ? 's' : ''}
                </span>
                {selectedDocIds.length > 0 && (
                  <span className="ch-lib-sel-info">
                    · {selectedDocIds.length} in context deck
                    <button className="ch-lib-sel-clear-sm" onClick={clearSelectedDocs}>Clear</button>
                  </span>
                )}
              </div>
              <div className="ch-lib-docs-header-right">
                <div className="ch-search-bar">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search documents…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="ch-search-input"
                  />
                  {searchQuery && (
                    <button className="ch-search-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>
                  )}
                </div>
                <button className="ch-icon-btn" onClick={loadDocs} title="Refresh"><RefreshCw size={14} /></button>
              </div>
            </div>

            <div className="ch-lib-scope-row">
              {[
                { key: 'all',       label: `All (${myDocs.length})` },
                { key: 'private',   label: 'Private' },
                { key: 'community', label: 'Community' },
              ].map(t => (
                <button
                  key={t.key}
                  className={`ch-lib-scope-pill ${libScope === t.key ? 'ch-lib-scope-pill--active' : ''}`}
                  onClick={() => setLibScope(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {docsLoading ? (
              <div className="ch-docs-loading"><Loader2 size={24} className="ch-spinner" /><p>Loading…</p></div>
            ) : docsError ? (
              <div className="ch-docs-error">
                <AlertCircle size={20} /><p>{docsError}</p>
                <button className="ch-btn ch-btn--ghost" onClick={loadDocs}>Retry</button>
              </div>
            ) : libDocs.length === 0 ? (
              <div className="ch-library-empty">
                <FolderOpen size={48} className="ch-library-empty-icon" />
                <h3>{searchQuery ? 'No matches' : 'Your library is empty'}</h3>
                <p>
                  {searchQuery
                    ? `Nothing found for "${searchQuery}"`
                    : 'Upload your first document to get started.'}
                </p>
                {!searchQuery && (
                  <button className="ch-btn ch-btn--primary" onClick={() => setSearchParams({ view: 'upload' })}>
                    <Upload size={14} />Upload Document
                  </button>
                )}
              </div>
            ) : (
              <div className="ch-myfile-grid">
                {libDocs.map(doc => {
                  const docId = String(doc.doc_id || doc.id);
                  const stats = allActionStats[docId] || {};
                  return (
                    <MyDocFileCard
                      key={getDocKey(doc)}
                      doc={doc}
                      usageStats={stats}
                      isNew={isNewDoc(doc) || docId === highlightedDocId}
                      isSelected={selectedDocIdSet.has(doc.doc_id || doc.id)}
                      onToggleSelect={(id) => {
                        toggleDocSelection(id);
                        contextService.setDocName(id, doc.filename || doc.title || '');
                      }}
                      onDelete={handleDelete}
                      onAction={handleDocAction}
                      onNavigate={(id) => navigate(`/contexthub/file/${encodeURIComponent(id)}`)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  
  const AskView = () => (
    <div className="ch-ask-view">
      <div className="ch-ask-header">
        <div className="ch-ask-header-info">
          <MessageCircle size={22} className="ch-ask-header-icon" />
          <div>
            <h2 className="ch-ask-title">Ask Your Notes</h2>
            <p className="ch-ask-subtitle">
              Ask any question — the AI will answer using your uploaded documents and the HS curriculum.
            </p>
          </div>
        </div>
        <label className="ch-ask-hs-toggle">
          <input
            type="checkbox"
            checked={askUseHs}
            onChange={e => setAskUseHs(e.target.checked)}
          />
          <span className="ch-ask-hs-label">Include curriculum</span>
        </label>
      </div>

      {askHistory.length === 0 ? (
        <div className="ch-ask-empty">
          <div className="ch-ask-empty-icon"><MessageCircle size={48} /></div>
          <h3>Ask anything about your documents</h3>
          <p>Upload notes, textbooks, or any study material — then ask questions and get cited answers.</p>
          <div className="ch-ask-suggestions">
            {[
              'What are the key concepts in this subject?',
              'Summarise the main topics covered',
              'Explain the most important formulas',
              'What should I focus on for the exam?',
            ].map(s => (
              <button
                key={s}
                className="ch-ask-suggestion-chip"
                onClick={() => { setAskInput(s); }}
              >
                <ArrowRight size={12} />{s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="ch-ask-history">
          {askHistory.map((item, idx) => (
            <div key={idx} className="ch-ask-turn">
              <div className="ch-ask-question">
                <div className="ch-ask-q-bubble">{item.question}</div>
              </div>

              {item.loading ? (
                <div className="ch-ask-answer ch-ask-answer--loading">
                  <Loader2 size={18} className="ch-spinner" />
                  <span>Searching your knowledge base…</span>
                </div>
              ) : item.error ? (
                <div className="ch-ask-answer ch-ask-answer--error">
                  <AlertCircle size={16} />
                  <span>{item.error}</span>
                </div>
              ) : (
                <div className="ch-ask-answer">
                  <div className="ch-ask-a-bubble">
                    {item.answer}
                  </div>
                  {item.sources && item.sources.length > 0 && (
                    <div className="ch-ask-sources">
                      <p className="ch-ask-sources-label">
                        <BookOpen size={12} />Sources used
                      </p>
                      <div className="ch-ask-source-chips">
                        {item.sources.map((src, si) => (
                          <div key={si} className={`ch-ask-source-chip ch-ask-source-chip--${src.source}`}>
                            <FileText size={11} />
                            <span className="ch-ask-source-name">
                              [{si + 1}] {src.filename}
                              {src.page && <em> p.{src.page}</em>}
                            </span>
                            {src.subject && (
                              <span className="ch-ask-source-subject">
                                <Tag size={9} />{src.subject}
                              </span>
                            )}
                            {src.source === 'hs' && (
                              <span className="ch-ask-source-hs-badge">Curriculum</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={askEndRef} />
        </div>
      )}

      <div className="ch-ask-input-area">
        <div className="ch-ask-input-wrap">
          <textarea
            className="ch-ask-textarea"
            placeholder="Ask a question about your notes…"
            value={askInput}
            onChange={e => setAskInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
            }}
            rows={2}
            disabled={askLoading}
          />
          <button
            className="ch-ask-send-btn"
            onClick={handleAsk}
            disabled={askLoading || !askInput.trim()}
            title="Send"
          >
            {askLoading ? <Loader2 size={16} className="ch-spinner" /> : <Send size={16} />}
          </button>
        </div>
        <p className="ch-ask-hint">
          {myDocs.length === 0
            ? <>No documents uploaded yet. <button className="ch-ask-hint-link" onClick={() => setUploadOpen(true)}>Upload one</button> to get started.</>
            : <>
                {selectedDocIds.length > 0
                  ? <>Using {selectedDocIds.length} selected source{selectedDocIds.length !== 1 ? 's' : ''}</>
                  : <>Searching across {myDocs.length} document{myDocs.length !== 1 ? 's' : ''}</>}
                {askUseHs ? ' + curriculum' : ''}. Press Enter to send.
              </>
          }
        </p>
      </div>
    </div>
  );

  
  const renderView = () => {
    if (view === 'landing')                   return <LandingView />;
    if (view === 'curriculum')                return <CurriculumView />;
    if (view === 'grade')                     return <GradeView />;
    if (view === 'subject')                   return <SubjectView />;
    if (view === 'library' || view === 'upload') return <LibraryView />;
    if (view === 'ask')                       return <AskView />;
    return <LandingView />;
  };

  return (
    <div className="ch-page" data-view={view}>
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="ch-layout">
        <Sidebar />
        <main className="ch-main">
          <div className="ch-main-bg" aria-hidden="true">
            <div className="ch-main-orb ch-main-orb-1" />
            <div className="ch-main-orb ch-main-orb-2" />
            <div className="ch-main-dots" />
            <div className="ch-main-vignette" />
          </div>
          {view !== 'landing' && view !== 'upload' && view !== 'library' && view !== 'ask' && (
            <Breadcrumb
              curriculum={selectedCurriculum}
              grade={selectedGrade}
              subject={selectedSubject}
              onLanding={goLanding}
              onCurriculum={() => setSearchParams({ c: urlC })}
              onGrade={() => setSearchParams({ c: urlC, g: String(urlG) })}
            />
          )}

          <div className="ch-main-content">{renderView()}</div>
        </main>
      </div>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        curriculum={selectedCurriculum}
        grade={selectedGrade}
        subject={selectedSubject}
        onUploaded={(result) => {
          loadDocs();
          if (result?.doc_id) {
            const fname = result.filename || result.doc_id;
            contextService.autoSelectDoc(result.doc_id, fname);
            setSelectedDocIds(prev => {
              const id = String(result.doc_id);
              if (prev.includes(id)) return prev;
              const next = [...prev, id];
              persistSelectedDocs(next);
              return next;
            });
          }
        }}
      />
    </div>
  );
}
