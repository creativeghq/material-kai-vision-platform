/**
 * Simple job status check
 */

const fetch = require('node-fetch');

const jobId = process.argv[2] || '210b6d20-4060-4ead-86e4-b54379d2fd9e';
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkwMDI5NzcsImV4cCI6MjA0NDU3ODk3N30.Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu-Uu
