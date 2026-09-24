import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for uploaded reports
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

app.use(cors());
app.use(cookieParser('medical-report-simplifier-secret'));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Load medical dictionary
let medicalDict: any = { diseases: {}, medicines: {}, lab_terms: {}, recommendations: {} };
const dictPath = path.resolve('data', 'medical_dictionary.json');
try {
  if (fs.existsSync(dictPath)) {
    medicalDict = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Could not load medical dictionary:', e);
}

// In-Memory Data Store (seeded with demo patients)
interface User {
  id: number;
  email: string;
  display_name: string | null;
  provider: string;
  created_at: string;
}

interface Patient {
  id: number;
  owner_id: number;
  patient_code: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  blood_group: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

interface MedicalReport {
  id: number;
  owner_id: number;
  patient_id: number | null;
  filename: string | null;
  file_path: string | null;
  extracted_text: string;
  simplified_text: string;
  created_at: string;
  entities: Array<{
    id: number;
    report_id: number;
    entity_text: string;
    entity_label: string;
    explanation: string;
  }>;
  recommendations: Array<{
    id: number;
    report_id: number;
    condition_name: string;
    foods_to_eat: string[];
    foods_to_avoid: string[];
    recommended_exercise: string[];
    exercise_precautions: string;
  }>;
}

const dbFile = path.resolve('data', 'database.json');

let users: User[] = [
  {
    id: 1,
    email: 'workspace@example.com',
    display_name: 'Workspace Clinician',
    provider: 'local',
    created_at: new Date().toISOString(),
  },
];

let patients: Patient[] = [
  {
    id: 1,
    owner_id: 1,
    patient_code: 'PAT-2026-K48C',
    full_name: 'Karuna Chauhan',
    age: 36,
    gender: 'Female',
    blood_group: 'B+',
    contact_email: 'karuna.chauhan@example.com',
    contact_phone: '+91 98401 23456',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 2,
    owner_id: 1,
    patient_code: 'PAT-2026-A92M',
    full_name: 'Adhiya',
    age: 20,
    gender: 'Male',
    blood_group: 'O+',
    contact_email: 'adhiya.health@example.com',
    contact_phone: '+91 97892 34567',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 3,
    owner_id: 1,
    patient_code: 'PAT-2026-8A3F',
    full_name: 'John Doe',
    age: 45,
    gender: 'Male',
    blood_group: 'O+',
    contact_email: 'john.doe@example.com',
    contact_phone: '+1-555-0192',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 4,
    owner_id: 1,
    patient_code: 'PAT-2026-7B9C',
    full_name: 'Jane Smith',
    age: 38,
    gender: 'Female',
    blood_group: 'A+',
    contact_email: 'jane.smith@example.com',
    contact_phone: '+1-555-0143',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
];

let reports: MedicalReport[] = [];
let nextUserId = 4;
let nextPatientId = 5;
let nextReportId = 5;
let nextEntityId = 16;
let nextRecId = 5;

function saveDatabase() {
  try {
    const data = {
      users,
      patients,
      reports,
      nextUserId,
      nextPatientId,
      nextReportId,
      nextEntityId,
      nextRecId,
    };
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database.json:', err);
  }
}

function loadDatabase() {
  try {
    if (fs.existsSync(dbFile)) {
      const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      if (Array.isArray(parsed.users) && parsed.users.length) users = parsed.users;
      if (Array.isArray(parsed.patients) && parsed.patients.length) patients = parsed.patients;
      if (Array.isArray(parsed.reports) && parsed.reports.length) reports = parsed.reports;
      if (typeof parsed.nextUserId === 'number') nextUserId = parsed.nextUserId;
      if (typeof parsed.nextPatientId === 'number') nextPatientId = parsed.nextPatientId;
      if (typeof parsed.nextReportId === 'number') nextReportId = parsed.nextReportId;
      if (typeof parsed.nextEntityId === 'number') nextEntityId = parsed.nextEntityId;
      if (typeof parsed.nextRecId === 'number') nextRecId = parsed.nextRecId;
      console.log(`[Database Loaded] Loaded ${patients.length} patients and ${reports.length} reports.`);
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.warn('Could not load database.json:', err);
  }
}

// Initial load from disk
loadDatabase();

function generatePatientCode(): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PAT-${year}-${rand}`;
}

// Authentication Helper
function getCurrentUser(req: any): User | null {
  const userEmail = req.cookies?.user_email || req.headers?.['x-user-email'];
  if (!userEmail) {
    return null;
  }
  const cleanEmail = String(userEmail).trim().toLowerCase();
  let user = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    const isGoogle = cleanEmail.includes('@gmail.com');
    user = {
      id: nextUserId++,
      email: cleanEmail,
      display_name: cleanEmail.split('@')[0],
      provider: isGoogle ? 'google' : 'local',
      created_at: new Date().toISOString(),
    };
    users.push(user);
    saveDatabase();
  }
  return user;
}

// ==================== AUTH ROUTES ====================
app.get('/api/auth/session', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.json({
      authenticated: false,
      user_email: null,
      display_name: null,
      provider: null,
    });
  }
  return res.json({
    authenticated: true,
    user_email: user.email,
    display_name: user.display_name,
    provider: user.provider || (user.email.includes('@gmail.com') ? 'google' : 'local'),
  });
});

app.get('/api/auth/config', (_req, res) => {
  res.json({
    google_enabled: true,
    google_email: 'akash.saravanan1797@gmail.com',
    display_name: 'Akash Saravanan',
  });
});

app.post('/api/auth/google', (req, res) => {
  const email = (req.body.email || 'akash.saravanan1797@gmail.com').trim().toLowerCase();
  const displayName = (req.body.display_name || req.body.name || email.split('@')[0]).trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid Google email is required.' });
  }

  let user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: nextUserId++,
      email,
      display_name: displayName,
      provider: 'google',
      created_at: new Date().toISOString(),
    };
    users.push(user);
  } else {
    user.provider = 'google';
    if (displayName && (!user.display_name || user.display_name === email.split('@')[0])) {
      user.display_name = displayName;
    }
  }
  saveDatabase();

  const maxAge = 30 * 24 * 3600 * 1000;
  res.cookie('user_email', user.email, {
    httpOnly: true,
    maxAge,
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  res.json({
    authenticated: true,
    user_email: user.email,
    display_name: user.display_name,
    provider: 'google',
  });
});

app.get('/auth/google', (req, res) => {
  const email = (req.query.email as string || 'akash.saravanan1797@gmail.com').trim().toLowerCase();
  let user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: nextUserId++,
      email,
      display_name: email.split('@')[0],
      provider: 'google',
      created_at: new Date().toISOString(),
    };
    users.push(user);
  } else {
    user.provider = 'google';
  }
  saveDatabase();

  res.cookie('user_email', user.email, {
    httpOnly: true,
    maxAge: 30 * 24 * 3600 * 1000,
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  res.redirect('/#/dashboard');
});

app.post('/api/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Your password must be at least 6 characters.' });
  }

  let user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: nextUserId++,
      email,
      display_name: email.split('@')[0],
      provider: 'local',
      created_at: new Date().toISOString(),
    };
    users.push(user);
    saveDatabase();
  }

  const maxAge = req.body.remember === 'on' || req.body.remember === true ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  res.cookie('user_email', user.email, {
    httpOnly: true,
    maxAge,
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  res.json({ authenticated: true, user_email: user.email, display_name: user.display_name, provider: user.provider });
});

app.post('/api/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmation = req.body.password_confirmation || '';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Your password must be at least 6 characters.' });
  }
  if (confirmation && password !== confirmation) {
    return res.status(400).json({ error: 'Your passwords do not match.' });
  }

  let user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: nextUserId++,
      email,
      display_name: email.split('@')[0],
      provider: 'local',
      created_at: new Date().toISOString(),
    };
    users.push(user);
    saveDatabase();
  }

  res.cookie('user_email', user.email, {
    httpOnly: true,
    maxAge: 24 * 3600 * 1000,
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  res.json({ authenticated: true, user_email: user.email, display_name: user.display_name, provider: user.provider });
});

app.all(['/api/logout', '/logout'], (_req, res) => {
  res.clearCookie('user_email', {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
  });
  res.clearCookie('user_email', {
    path: '/',
  });
  res.setHeader('Set-Cookie', [
    'user_email=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=None; Secure',
    'user_email=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',
  ]);
  res.json({ authenticated: false });
});

// ==================== PATIENTS ROUTES (SCOPED PER USER) ====================
app.get('/patients/api/list', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userPatients = patients.filter((p) => p.owner_id === user.id);
  userPatients.sort((a, b) => a.full_name.localeCompare(b.full_name));

  const result = userPatients.map((p) => {
    const reportCount = reports.filter((r) => r.patient_id === p.id && r.owner_id === user.id).length;
    return {
      ...p,
      report_count: reportCount,
    };
  });

  res.json(result);
});

app.post('/patients/api', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const payload = req.body || {};
  const full_name = String(payload.full_name || '').trim();
  if (!full_name) {
    return res.status(400).json({ error: 'Patient full name is required.' });
  }

  const newPatient: Patient = {
    id: nextPatientId++,
    owner_id: user.id,
    patient_code: generatePatientCode(),
    full_name,
    age: payload.age ? Number(payload.age) : null,
    gender: String(payload.gender || '').trim() || null,
    blood_group: String(payload.blood_group || '').trim() || null,
    contact_email: String(payload.contact_email || '').trim() || null,
    contact_phone: String(payload.contact_phone || '').trim() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  patients.push(newPatient);
  saveDatabase();
  res.status(201).json({ ...newPatient, report_count: 0 });
});

app.get('/patients/api/:id', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const patientId = Number(req.params.id);
  const patient = patients.find((p) => p.id === patientId && p.owner_id === user.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const patientReports = reports
    .filter((r) => r.patient_id === patient.id && r.owner_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json({
    ...patient,
    report_count: patientReports.length,
    reports: patientReports,
  });
});

// ==================== REPORTS ROUTES (SCOPED PER USER) ====================
app.get('/api/reports', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userReports = reports
    .filter((r) => r.owner_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(userReports);
});

app.get('/reports/:id/download', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const reportId = Number(req.params.id);
  const report = reports.find((r) => r.id === reportId && r.owner_id === user.id);
  if (!report || !report.file_path || !fs.existsSync(report.file_path)) {
    return res.status(404).send('File not found');
  }
  res.download(report.file_path, report.filename || 'medical-report.txt');
});

app.post('/reports/:id/delete', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const reportId = Number(req.params.id);
  const report = reports.find((r) => r.id === reportId && r.owner_id === user.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  reports = reports.filter((r) => r.id !== reportId);
  saveDatabase();
  res.json({ success: true });
});

// ==================== PATIENT INFO EXTRACTOR ====================
function extractPatientInfo(text: string) {
  if (!text) return {};
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const headerChunk = lines.slice(0, 20).join('\n');

  const info: {
    full_name?: string;
    age?: number;
    gender?: string;
    blood_group?: string;
    contact_phone?: string;
    contact_email?: string;
  } = {};

  // 1. Name
  const nameMatch = headerChunk.match(
    /(?:Patient\s*Name|Pt\s*Name|Name|Patient)\s*[:\-]\s*([A-Za-z\s\.\,\'\-]+?)(?=\s*(?:,|\n|Age|Sex|Gender|DOB|Date|ID|Ref|Phone|Blood)|$)/i
  );
  if (nameMatch && nameMatch[1]) {
    const raw = nameMatch[1].trim().replace(/^[:\-., ]+|[:\-., ]+$/g, '');
    if (raw.length > 1 && !['report', 'summary', 'lab', 'test', 'male', 'female', 'patient'].includes(raw.toLowerCase())) {
      info.full_name = raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  // 2. Age & Gender combinations (e.g. Age/Gender: 19/M, 19 YRS / Male)
  const ageGenderMatch = headerChunk.match(/(?:Age\s*(?:\/|\&)\s*(?:Gender|Sex))\s*[:\-]?\s*(\d{1,3})\s*(?:\/|\s*,\s*)\s*([MF]|Male|Female)\b/i);
  if (ageGenderMatch) {
    const a = parseInt(ageGenderMatch[1], 10);
    if (a >= 0 && a <= 120) info.age = a;
    const g = ageGenderMatch[2].toUpperCase();
    info.gender = (g === 'M' || g === 'MALE') ? 'Male' : (g === 'F' || g === 'FEMALE') ? 'Female' : 'Other';
  } else {
    // 2a. Age alone
    const ageMatch = headerChunk.match(/(?:Age|YRS|Years)\s*[:\-]?\s*(\d{1,3})\s*(?:YRS|Years|Y\/O|Y)?/i);
    if (ageMatch && ageMatch[1]) {
      const a = parseInt(ageMatch[1], 10);
      if (a >= 0 && a <= 120) info.age = a;
    }

    // 3a. Gender alone
    const genderMatch = headerChunk.match(/(?:Gender|Sex)\s*[:\-]?\s*(Male|Female|Other|M|F)\b/i);
    if (genderMatch && genderMatch[1]) {
      const g = genderMatch[1].toUpperCase();
      if (g === 'M' || g === 'MALE') info.gender = 'Male';
      else if (g === 'F' || g === 'FEMALE') info.gender = 'Female';
      else info.gender = 'Other';
    }
  }

  // 4. Blood Group
  const bloodMatch = headerChunk.match(/(?:Blood\s*Group|Blood\s*Type|Blood)\s*[:\-]?\s*(A|B|AB|O)[\s]*([\+\-])/i);
  if (bloodMatch && bloodMatch[1] && bloodMatch[2]) {
    info.blood_group = `${bloodMatch[1].toUpperCase()}${bloodMatch[2]}`;
  }

  // 5. Phone
  const phoneMatch = headerChunk.match(/(?:Phone|Mobile|Contact|Tel)\s*[:\-]?\s*([+\d\s\-\(\)]{7,15})/i);
  if (phoneMatch && phoneMatch[1]) {
    const p = phoneMatch[1].trim();
    if (p.replace(/\D/g, '').length >= 7) info.contact_phone = p;
  }

  // 6. Email
  const emailMatch = headerChunk.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  if (emailMatch && emailMatch[0]) {
    info.contact_email = emailMatch[0].trim();
  }

  return info;
}

// ==================== SIMPLIFICATION LOGIC ====================
function lookupRecommendation(term: string) {
  const clean = term.toLowerCase().trim();
  const recs = medicalDict.recommendations || {};
  if (recs[clean]) return recs[clean];

  const aliases: Record<string, string> = {
    diabetes: 'diabetes mellitus',
    'type 2 diabetes': 'diabetes mellitus',
    'type 1 diabetes': 'diabetes mellitus',
    'high blood pressure': 'hypertension',
    bp: 'hypertension',
    cholesterol: 'hyperlipidemia',
    'high cholesterol': 'hyperlipidemia',
    'heart attack': 'myocardial infarction',
    'kidney disease': 'chronic kidney disease',
    ckd: 'chronic kidney disease',
    'low iron': 'anemia',
    thyroid: 'hypothyroidism',
    hypoglycemia: 'hypoglycemia',
    hypoglycemic: 'hypoglycemia',
    'low blood sugar': 'hypoglycemia',
    rbs: 'hypoglycemia',
  };

  const target = aliases[clean];
  if (target && recs[target]) return recs[target];

  for (const [key, val] of Object.entries(recs)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }
  return null;
}

function simplifyWithRules(text: string) {
  const entities: Array<{
    text: string;
    label: string;
    explanation: string;
    source: string;
  }> = [];
  const seenEntities = new Set<string>();

  const categories = [
    { cat: 'diseases', label: 'DISEASE' },
    { cat: 'medicines', label: 'MEDICINE' },
    { cat: 'lab_terms', label: 'LAB_TERM' },
  ];

  for (const { cat, label } of categories) {
    const dict = medicalDict[cat] || {};
    for (const [term, explanation] of Object.entries(dict)) {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        const key = `${term.toLowerCase()}:${label}`;
        if (!seenEntities.has(key)) {
          seenEntities.add(key);
          entities.push({
            text: term,
            label,
            explanation: String(explanation),
            source: 'dictionary',
          });
        }
      }
    }
  }

  const byCondition: any[] = [];
  const allEat: string[] = [];
  const allAvoid: string[] = [];
  const allExercise: string[] = [];
  const allPrecautions: string[] = [];
  const seenConditions = new Set<string>();

  for (const ent of entities) {
    if (ent.label === 'DISEASE' || ent.label === 'LAB_TERM') {
      const termClean = ent.text.toLowerCase().trim();
      if (seenConditions.has(termClean)) continue;
      seenConditions.add(termClean);

      const rec: any = lookupRecommendation(termClean);
      if (rec) {
        byCondition.push({
          condition: ent.text.charAt(0).toUpperCase() + ent.text.slice(1),
          foods_to_eat: rec.foods_to_eat || [],
          foods_to_avoid: rec.foods_to_avoid || [],
          recommended_exercise: rec.recommended_exercise || [],
          exercise_precautions: rec.exercise_precautions || '',
        });
        if (Array.isArray(rec.foods_to_eat)) allEat.push(...rec.foods_to_eat);
        if (Array.isArray(rec.foods_to_avoid)) allAvoid.push(...rec.foods_to_avoid);
        if (Array.isArray(rec.recommended_exercise)) allExercise.push(...rec.recommended_exercise);
        if (rec.exercise_precautions) allPrecautions.push(rec.exercise_precautions);
      }
    }
  }

  function dedupe(arr: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      if (item && !seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
    return out;
  }

  if (byCondition.length === 0) {
    allEat.push('Fresh fruits and vegetables', 'Whole grains and legumes', 'Adequate daily water intake');
    allAvoid.push('Excessive sodium and refined sugars', 'Deep-fried and heavily processed foods');
    allExercise.push('30 minutes of moderate physical activity (like walking) 5 days a week');
    allPrecautions.push('Listen to your body and consult your doctor before changes.');
  }

  const summaryLines = entities.map(
    (e) => `- ${e.text.charAt(0).toUpperCase() + e.text.slice(1)} (${e.label}): ${e.explanation}`
  );
  const simplified_summary = summaryLines.length > 0 ? summaryLines.join('\n') : 'No specific medical terms detected.';

  return {
    original_text: text.trim(),
    entities,
    simplified_summary,
    recommendations: {
      by_condition: byCondition,
      aggregated: {
        foods_to_eat: dedupe(allEat),
        foods_to_avoid: dedupe(allAvoid),
        recommended_exercise: dedupe(allExercise),
        general_precautions: dedupe(allPrecautions),
      },
      disclaimer:
        'Medical Disclaimer: These dietary and exercise suggestions are provided for general educational purposes only. Always consult a qualified physician or healthcare professional before making any significant changes to your diet, medication, or physical activity routine.',
    },
  };
}

// ==================== GEMINI MULTIMODAL EXTRACTION & SIMPLIFICATION ====================
function getGeminiApiKey(): string | null {
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && !envKey.startsWith('MY_')) {
    return envKey;
  }
  // Try reading from /app/.dev.env.json
  try {
    const devEnvPath = path.resolve('/app/.dev.env.json');
    if (fs.existsSync(devEnvPath)) {
      const devEnv = JSON.parse(fs.readFileSync(devEnvPath, 'utf-8'));
      if (devEnv.GEMINI_API_KEY) return devEnv.GEMINI_API_KEY;
    }
  } catch (e) {
    // ignore
  }
  // Try local .dev.env.json
  try {
    const localDevEnv = path.resolve('.dev.env.json');
    if (fs.existsSync(localDevEnv)) {
      const devEnv = JSON.parse(fs.readFileSync(localDevEnv, 'utf-8'));
      if (devEnv.GEMINI_API_KEY) return devEnv.GEMINI_API_KEY;
    }
  } catch (e) {
    // ignore
  }
  return envKey || null;
}

async function analyzeWithGemini(fileBuffer: Buffer | null, mimeType: string | null, textPrompt: string) {
  const apiKey = getGeminiApiKey();
  console.log('[Gemini Extraction] Started. FileBuffer:', !!fileBuffer, 'Mime:', mimeType, 'ApiKey valid:', !!(apiKey && !apiKey.startsWith('MY_')));
  if (!apiKey) {
    console.warn('[Gemini Extraction] No GEMINI_API_KEY found');
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [];

    if (fileBuffer && mimeType) {
      parts.push({
        inlineData: {
          mimeType,
          data: fileBuffer.toString('base64'),
        },
      });
    }

    const prompt = `You are a world-class clinical medical report reader and friendly patient health communicator.
Analyze this medical report (${fileBuffer ? 'attached document/image' : 'provided text'}).
Extract all information thoroughly and accurately, including handwritten or doctor notes, patient name, age, gender, symptoms, vitals (BP, PR, RBS), diagnoses/impressions, advice, and medications.
${textPrompt ? `Additional text context: ${textPrompt}` : ''}

Respond ONLY with valid JSON conforming to this exact structure:
{
  "extracted_text": "<Full verbatim extracted text from the document/report, including hospital name, date, patient info, findings, lab values, impression, advice>",
  "patient_info": {
    "full_name": "<Patient name if found, e.g. Vivek S, else null>",
    "age": <number or null>,
    "gender": "<Male/Female/Other or null>",
    "blood_group": "<e.g. A+, O- or null>",
    "contact_phone": "<phone or null>",
    "contact_email": "<email or null>"
  },
  "entities": [
    {
      "text": "<Name of term, e.g. Hypoglycemia, RBS 50 mg/dl, Dextrose, Giddiness>",
      "label": "<DISEASE or MEDICINE or LAB_TERM or SYMPTOM>",
      "explanation": "<Simple, compassionate, 1-2 sentence explanation in plain everyday language with no medical jargon>"
    }
  ],
  "simplified_summary": "<A clear, friendly, structured explanation of the report findings for the patient. Highlight what was observed, what is out of range, what the treatment does, and what questions to ask their doctor.>",
  "foods_to_eat": ["<food recommendation 1>", "<food recommendation 2>", "<food recommendation 3>"],
  "foods_to_avoid": ["<food to limit 1>", "<food to limit 2>"],
  "recommended_exercise": ["<safe physical activity tip 1>", "<safe physical activity tip 2>"],
  "exercise_precautions": "<Safety warning or note for doctor discussion>"
}`;

    parts.push({ text: prompt });

    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
    let responseText = '';

    for (const model of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
              responseMimeType: 'application/json',
            },
          });
          responseText = response.text?.trim() || '';
          if (responseText) break;
        } catch (e: any) {
          console.warn(`Model ${model} attempt ${attempt + 1} failed:`, e?.message || e);
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }
      }
      if (responseText) break;
    }

    if (!responseText) return null;

    const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonStr = (firstBrace !== -1 && lastBrace !== -1) ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('Gemini extraction failed:', err);
    return null;
  }
}

// ==================== UPLOAD & ANALYSIS ROUTE ====================
app.post(['/api/upload', '/upload'], upload.single('report') as any, async (req: any, res: any) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const file = req.file;
  const pastedText = (req.body.report_text || '').trim();
  const selectedPatientId = req.body.patient_id ? Number(req.body.patient_id) : null;
  const formName = (req.body.patient_name || '').trim();
  const formAge = req.body.patient_age ? Number(req.body.patient_age) : null;
  const formGender = (req.body.patient_gender || '').trim();
  const formBlood = (req.body.patient_blood_group || '').trim();
  const formPhone = (req.body.patient_phone || '').trim();
  const formEmail = (req.body.patient_email || '').trim();

  let text = '';
  let savedFilename: string | null = null;
  let savedFilepath: string | null = null;
  let geminiResult: any = null;

  if (file) {
    savedFilename = file.originalname;
    savedFilepath = file.path;

    // Determine mimeType
    let mimeType = file.mimetype;
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.txt') mimeType = 'text/plain';

    // If text file, read text directly
    if (ext === '.txt') {
      try {
        text = fs.readFileSync(file.path, 'utf-8');
      } catch (e) {
        text = '';
      }
    }

    // Try Gemini OCR & multimodal analysis
    try {
      const fileBuffer = fs.readFileSync(file.path);
      geminiResult = await analyzeWithGemini(fileBuffer, mimeType, pastedText);
    } catch (err) {
      console.warn('Multimodal extraction error:', err);
    }

    if (geminiResult && geminiResult.extracted_text) {
      text = geminiResult.extracted_text;
    } else if (!text && pastedText) {
      text = pastedText;
    } else if (!text) {
      // Basic text extraction fallback for files
      text = `Medical Report File: ${file.originalname}\nAnalysis based on uploaded diagnostic report.`;
    }
  } else if (pastedText) {
    text = pastedText;
    // Can also enhance pasted text with Gemini
    if (getGeminiApiKey()) {
      geminiResult = await analyzeWithGemini(null, null, text);
    }
  } else {
    return res.status(400).json({ error: 'Please upload a PDF/Image or paste report text.' });
  }

  // Auto-extract patient information
  const rulePatientInfo = extractPatientInfo(text);
  const geminiPatient = geminiResult?.patient_info || {};

  const patientName = formName || geminiPatient.full_name || rulePatientInfo.full_name;
  const patientAge = formAge !== null ? formAge : geminiPatient.age || rulePatientInfo.age || null;
  const patientGender = formGender || geminiPatient.gender || rulePatientInfo.gender || null;
  const patientBlood = formBlood || geminiPatient.blood_group || rulePatientInfo.blood_group || null;
  const patientPhone = formPhone || geminiPatient.contact_phone || rulePatientInfo.contact_phone || null;
  const patientEmail = formEmail || geminiPatient.contact_email || rulePatientInfo.contact_email || null;

  let targetPatient: Patient | null = null;
  if (selectedPatientId) {
    targetPatient = patients.find((p) => p.id === selectedPatientId && p.owner_id === user.id) || null;
  }
  if (!targetPatient && patientName) {
    targetPatient =
      patients.find(
        (p) =>
          p.full_name.toLowerCase() === patientName.toLowerCase() && p.owner_id === user.id
      ) || null;
  }
  if (!targetPatient && patientPhone) {
    targetPatient = patients.find((p) => p.contact_phone === patientPhone && p.owner_id === user.id) || null;
  }

  if (!targetPatient) {
    targetPatient = {
      id: nextPatientId++,
      owner_id: user.id,
      patient_code: generatePatientCode(),
      full_name: patientName || 'Patient Record',
      age: patientAge,
      gender: patientGender,
      blood_group: patientBlood,
      contact_phone: patientPhone,
      contact_email: patientEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    patients.push(targetPatient);
  } else {
    if (!targetPatient.age && patientAge) targetPatient.age = patientAge;
    if (!targetPatient.gender && patientGender) targetPatient.gender = patientGender;
    if (!targetPatient.blood_group && patientBlood) targetPatient.blood_group = patientBlood;
    if (!targetPatient.contact_phone && patientPhone) targetPatient.contact_phone = patientPhone;
    if (!targetPatient.contact_email && patientEmail) targetPatient.contact_email = patientEmail;
    targetPatient.updated_at = new Date().toISOString();
  }

  // Generate Simplification Result
  const ruleResult = simplifyWithRules(text);

  let finalResult: any;
  if (geminiResult && (geminiResult.entities?.length > 0 || geminiResult.simplified_summary)) {
    // Merge Gemini insights with rule dictionary terms
    const seen = new Set<string>();
    const combinedEntities = [];

    for (const ent of geminiResult.entities || []) {
      const key = ent.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combinedEntities.push({
          text: ent.text,
          label: ent.label || 'DISEASE',
          explanation: ent.explanation,
          source: 'gemini_ai',
        });
      }
    }

    for (const ent of ruleResult.entities || []) {
      const key = ent.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combinedEntities.push(ent);
      }
    }

    const foodsToEat = [
      ...(geminiResult.foods_to_eat || []),
      ...(ruleResult.recommendations.aggregated.foods_to_eat || []),
    ];
    const foodsToAvoid = [
      ...(geminiResult.foods_to_avoid || []),
      ...(ruleResult.recommendations.aggregated.foods_to_avoid || []),
    ];
    const exercise = [
      ...(geminiResult.recommended_exercise || []),
      ...(ruleResult.recommendations.aggregated.recommended_exercise || []),
    ];

    const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    finalResult = {
      original_text: text,
      entities: combinedEntities,
      simplified_summary:
        geminiResult.simplified_summary || ruleResult.simplified_summary,
      recommendations: {
        by_condition: ruleResult.recommendations.by_condition,
        aggregated: {
          foods_to_eat: dedupe(foodsToEat),
          foods_to_avoid: dedupe(foodsToAvoid),
          recommended_exercise: dedupe(exercise),
          general_precautions: [
            geminiResult.exercise_precautions,
            ...ruleResult.recommendations.aggregated.general_precautions,
          ].filter(Boolean),
        },
        disclaimer: ruleResult.recommendations.disclaimer,
      },
    };
  } else {
    finalResult = ruleResult;
  }

  const recSource = (finalResult.recommendations.by_condition && finalResult.recommendations.by_condition.length > 0)
    ? finalResult.recommendations.by_condition
    : [{
        condition: 'Clinical Guidance',
        foods_to_eat: finalResult.recommendations?.aggregated?.foods_to_eat || [],
        foods_to_avoid: finalResult.recommendations?.aggregated?.foods_to_avoid || [],
        recommended_exercise: finalResult.recommendations?.aggregated?.recommended_exercise || [],
        exercise_precautions: finalResult.recommendations?.aggregated?.general_precautions?.[0] || '',
      }];

  // Create & store Report Record
  const newReportId = nextReportId++;
  const newReport: MedicalReport = {
    id: newReportId,
    owner_id: user.id,
    patient_id: targetPatient.id,
    filename: savedFilename,
    file_path: savedFilepath,
    extracted_text: text,
    simplified_text: finalResult.simplified_summary,
    created_at: new Date().toISOString(),
    entities: finalResult.entities.map((e: any) => ({
      id: nextEntityId++,
      report_id: newReportId,
      entity_text: e.text,
      entity_label: e.label,
      explanation: e.explanation,
    })),
    recommendations: recSource.map((c: any) => ({
      id: nextRecId++,
      report_id: newReportId,
      condition_name: c.condition || 'General Guidance',
      foods_to_eat: c.foods_to_eat || [],
      foods_to_avoid: c.foods_to_avoid || [],
      recommended_exercise: c.recommended_exercise || [],
      exercise_precautions: c.exercise_precautions || '',
    })),
  };

  reports.push(newReport);
  saveDatabase();

  const reportCount = reports.filter((r) => r.patient_id === targetPatient.id && r.owner_id === user.id).length;

  res.json({
    result: finalResult,
    patient: { ...targetPatient, report_count: reportCount },
    report: newReport,
  });
});

// ==================== SPA & STATIC SERVING ====================
async function setupViteOrStatic() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error('Failed to start server:', err);
});
