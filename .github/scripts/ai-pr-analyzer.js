import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Initialize clients
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Environment variables
const {
  PR_NUMBER,
  PR_TITLE,
  PR_BODY,
  PR_URL,
  PR_AUTHOR,
  REPO_OWNER,
  REPO_NAME
} = process.env;

async function analyzePRWithAI() {
  try {
    console.log('🤖 Starting AI-powered PR analysis...');
    
    // Get PR files and changes
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER,
    });

    // Get commit messages
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER,
    });

    // Prepare data for AI analysis
    const prData = {
      title: PR_TITLE,
      body: PR_BODY || '',
      author: PR_AUTHOR,
      url: PR_URL,
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes
      })),
      commits: commits.map(commit => ({
        message: commit.commit.message,
        author: commit.commit.author.name
      }))
    };

    // AI prompt for analysis
    const prompt = `
Analyze this Pull Request for the Material Kai Vision Platform and generate a changelog entry.

PR Details:
- Title: ${PR_TITLE}
- Author: ${PR_AUTHOR}
- Body: ${PR_BODY || 'No description provided'}

Files Changed:
${files.map(file => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`).join('\n')}

Commit Messages:
${commits.map(commit => `- ${commit.commit.message}`).join('\n')}

Please analyze this PR and categorize the changes. Generate a changelog entry in the following format:

## [Date] - Release Version

### 🚀 New Features
- List any new features added

### ✨ Enhancements
- List any improvements or enhancements

### 🐛 Bug Fixes
- List any bug fixes

### 📚 Documentation
- List any documentation updates

### 🔧 Technical Changes
- List any technical/infrastructure changes

### 🎨 UI/UX Improvements
- List any user interface improvements

### 🤖 AI/ML Improvements
- List any AI or machine learning related changes

### 📊 Performance Improvements
- List any performance optimizations

### 🔐 Security Improvements
- List any security enhancements

Only include sections that are relevant to this PR. Be specific and technical but also user-friendly.
Focus on the business value and impact of the changes.

For the Material Kai Vision Platform context:
- This is an AI-powered material intelligence platform
- Key components include MIVAA (AI service), PDF processing, search, 3D generation
- Recent focus has been on MIVAA integration enhancements
- Important features include vector similarity search, entity-based filtering, multi-modal testing

Generate a concise but informative changelog entry.
`;

    console.log('🧠 Sending PR data to OpenAI for analysis...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert software developer and technical writer specializing in AI-powered platforms. You analyze pull requests and generate professional changelog entries that are both technical and business-focused."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const aiAnalysis = completion.choices[0].message.content;
    console.log('✅ AI analysis completed');

    // Update changelog
    await updateChangelog(aiAnalysis, prData);
    
    console.log('🎉 Changelog update completed successfully');

  } catch (error) {
    console.error('❌ Error in AI PR analysis:', error);
    
    // Fallback: create basic changelog entry without AI
    console.log('🔄 Creating fallback changelog entry...');
    await createFallbackChangelog();
  }
}

async function updateChangelog(aiAnalysis, prData) {
  const changelogPath = path.join(process.cwd(), 'docs', 'changes-log.md');
  
  // Ensure docs directory exists
  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Read existing changelog or create new one
  let existingChangelog = '';
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, 'utf8');
  } else {
    existingChangelog = `# 📋 Material Kai Vision Platform - Changes Log

This file contains a detailed log of all changes, improvements, and releases for the Material Kai Vision Platform.

---

`;
  }

  // Generate current date
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Create new changelog entry
  const newEntry = `
## [${currentDate}] - PR #${PR_NUMBER}

**Author**: ${PR_AUTHOR}  
**PR URL**: ${PR_URL}

${aiAnalysis}

**Files Changed**: ${prData.files.length} files  
**Total Changes**: +${prData.files.reduce((sum, file) => sum + file.additions, 0)}/-${prData.files.reduce((sum, file) => sum + file.deletions, 0)}

---

`;

  // Insert new entry at the top (after the header)
  const headerEndIndex = existingChangelog.indexOf('---\n') + 4;
  const updatedChangelog = existingChangelog.slice(0, headerEndIndex) + newEntry + existingChangelog.slice(headerEndIndex);

  // Write updated changelog
  fs.writeFileSync(changelogPath, updatedChangelog);
  console.log('✅ Changelog updated successfully');
}

async function createFallbackChangelog() {
  const changelogPath = path.join(process.cwd(), 'docs', 'changes-log.md');
  
  // Ensure docs directory exists
  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Read existing changelog or create new one
  let existingChangelog = '';
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, 'utf8');
  } else {
    existingChangelog = `# 📋 Material Kai Vision Platform - Changes Log

This file contains a detailed log of all changes, improvements, and releases for the Material Kai Vision Platform.

---

`;
  }

  // Generate current date
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Create basic changelog entry
  const newEntry = `
## [${currentDate}] - PR #${PR_NUMBER}

**Author**: ${PR_AUTHOR}  
**PR URL**: ${PR_URL}  
**Title**: ${PR_TITLE}

### 📋 Changes
${PR_BODY || 'No description provided'}

### 🔧 Technical Details
- Pull Request #${PR_NUMBER} merged successfully
- Changes reviewed and approved
- Automated changelog entry generated

---

`;

  // Insert new entry at the top (after the header)
  const headerEndIndex = existingChangelog.indexOf('---\n') + 4;
  const updatedChangelog = existingChangelog.slice(0, headerEndIndex) + newEntry + existingChangelog.slice(headerEndIndex);

  // Write updated changelog
  fs.writeFileSync(changelogPath, updatedChangelog);
  console.log('✅ Fallback changelog created successfully');
}

// Run the analysis
analyzePRWithAI().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
