/* ═══════════════════════════════════════════════════════════
   FORGEHUB AI — engine.js
   Pure deterministic rule engine.  Zero API. Zero network.
   Everything runs in-browser using file analysis + templates.
═══════════════════════════════════════════════════════════ */

'use strict';

const FHEngine = (() => {

  /* ─────────────────────────────────────────
     1. PROJECT TYPE DETECTION
  ───────────────────────────────────────── */
  function detectProjectType(filePaths) {
    const all = filePaths.join('\n').toLowerCase();
    const names = filePaths.map(p => p.split('/').pop().toLowerCase());

    if (names.includes('package.json')) {
      if (all.includes('next.config')  || all.includes('next.config.js') || all.includes('next.config.mjs')) return 'nextjs';
      if (all.includes('vite.config'))  return 'vite';
      if (all.includes('.tsx') || all.includes('.jsx')) return 'react';
      if (all.includes('vue'))          return 'vue';
      if (all.includes('svelte'))       return 'svelte';
      if (all.includes('angular'))      return 'angular';
      return 'nodejs';
    }
    if (names.includes('requirements.txt') || names.includes('setup.py') || all.includes('.py')) return 'python';
    if (names.includes('go.mod') || all.includes('.go')) return 'golang';
    if (names.includes('cargo.toml') || all.includes('.rs')) return 'rust';
    if (names.includes('composer.json') || all.includes('.php')) return 'php';
    if (all.includes('.java') || names.includes('pom.xml') || names.includes('build.gradle')) return 'java';
    if (names.includes('gemfile') || all.includes('.rb')) return 'ruby';
    if (all.includes('.html') || all.includes('.css') || all.includes('.js')) return 'html';
    return 'generic';
  }

  /* ─────────────────────────────────────────
     2. FILE NAMER — strips messy suffixes
  ───────────────────────────────────────── */
  const DIRTY_PATTERNS = [
    /\s*[-_]?\s*(final|FINAL)\s*(v\d+)?(\s*copy\s*\d*)?/gi,
    /\s*[-_]?\s*copy\s*\d*/gi,
    /\s*[-_]?\s*BACKUP\s*/gi,
    /\s*[-_]?\s*OLD\s*/gi,
    /\s*[-_]?\s*NEW\s*/gi,
    /\s*[-_]?\s*v\d+\s*/gi,
    /\s*\(\d+\)\s*/g,
    /\s+/g,
  ];

  function cleanFileName(name) {
    const dotIdx = name.lastIndexOf('.');
    const ext  = dotIdx >= 0 ? name.slice(dotIdx) : '';
    let   base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;

    DIRTY_PATTERNS.forEach(p => { base = base.replace(p, p.source === '\\s+' ? '-' : ''); });
    base = base.replace(/[-_]+/g, '-').replace(/^[-_]|[-_]$/g, '').toLowerCase();
    if (!base) base = 'file';
    return base + ext;
  }

  /* ─────────────────────────────────────────
     3. FOLDER STRUCTURE TEMPLATES
  ───────────────────────────────────────── */
  const STRUCTURES = {
    nextjs: {
      label: 'Next.js',
      map: (name) => {
        if (/^page[s]?[/\\]|\/pages\/|app\//.test(name)) return 'app/' + name.split('/').pop();
        if (/component/i.test(name))  return 'components/' + name.split('/').pop();
        if (/hook[s]?|use[A-Z]/i.test(name)) return 'hooks/' + name.split('/').pop();
        if (/util|helper|lib/i.test(name))   return 'lib/' + name.split('/').pop();
        if (/style|css|scss/i.test(name))    return 'styles/' + name.split('/').pop();
        if (/type[s]?|interface/i.test(name))return 'types/' + name.split('/').pop();
        if (/api/i.test(name))               return 'app/api/' + name.split('/').pop();
        if (/public|asset|image|img/i.test(name)) return 'public/' + name.split('/').pop();
        return name;
      },
      missing: ['app/page.tsx','app/layout.tsx','app/globals.css','next.config.js','.env.example']
    },
    react: {
      label: 'React',
      map: (name) => {
        if (/component/i.test(name))         return 'src/components/' + name.split('/').pop();
        if (/hook[s]?|use[A-Z]/i.test(name)) return 'src/hooks/' + name.split('/').pop();
        if (/util|helper/i.test(name))       return 'src/utils/' + name.split('/').pop();
        if (/style|css|scss/i.test(name))    return 'src/styles/' + name.split('/').pop();
        if (/context|store|redux/i.test(name)) return 'src/context/' + name.split('/').pop();
        if (/page|view|screen/i.test(name))  return 'src/pages/' + name.split('/').pop();
        if (/asset|image|img/i.test(name))   return 'public/' + name.split('/').pop();
        if (/\.(jsx?|tsx?)$/.test(name))     return 'src/' + name.split('/').pop();
        return name;
      },
      missing: ['src/index.jsx','src/App.jsx','public/index.html','.env.example']
    },
    vite: {
      label: 'Vite',
      map: (name) => {
        if (/component/i.test(name)) return 'src/components/' + name.split('/').pop();
        if (/util|helper/i.test(name)) return 'src/utils/' + name.split('/').pop();
        if (/\.(jsx?|tsx?|vue|svelte)$/.test(name)) return 'src/' + name.split('/').pop();
        if (/\.(css|scss|less)$/.test(name)) return 'src/styles/' + name.split('/').pop();
        if (/public|asset|image/i.test(name)) return 'public/' + name.split('/').pop();
        return name;
      },
      missing: ['src/main.ts','vite.config.ts','index.html']
    },
    nodejs: {
      label: 'Node.js',
      map: (name) => {
        if (/route[s]?|controller/i.test(name)) return 'src/routes/' + name.split('/').pop();
        if (/middleware/i.test(name)) return 'src/middleware/' + name.split('/').pop();
        if (/model[s]?|schema/i.test(name)) return 'src/models/' + name.split('/').pop();
        if (/service[s]?/i.test(name)) return 'src/services/' + name.split('/').pop();
        if (/util|helper/i.test(name)) return 'src/utils/' + name.split('/').pop();
        if (/config/i.test(name)) return 'src/config/' + name.split('/').pop();
        if (/test|spec/i.test(name)) return 'tests/' + name.split('/').pop();
        if (/\.js$/.test(name) && !['index.js','server.js','app.js'].includes(name.split('/').pop())) return 'src/' + name.split('/').pop();
        return name;
      },
      missing: ['src/index.js','.env.example']
    },
    python: {
      label: 'Python',
      map: (name) => {
        if (/test[s]?|spec/i.test(name)) return 'tests/' + name.split('/').pop();
        if (/util|helper/i.test(name)) return 'utils/' + name.split('/').pop();
        if (/model[s]?/i.test(name)) return 'models/' + name.split('/').pop();
        if (/route[s]?|view[s]?/i.test(name)) return 'views/' + name.split('/').pop();
        if (/config/i.test(name)) return 'config/' + name.split('/').pop();
        return name;
      },
      missing: ['requirements.txt','setup.py','.env.example']
    },
    html: {
      label: 'Static HTML',
      map: (name) => {
        if (/\.css$/.test(name)) return 'css/' + name.split('/').pop();
        if (/\.js$/.test(name) && !/\.(min|bundle)\.js$/.test(name)) return 'js/' + name.split('/').pop();
        if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(name)) return 'assets/images/' + name.split('/').pop();
        if (/\.(woff|woff2|ttf|eot|otf)$/i.test(name)) return 'assets/fonts/' + name.split('/').pop();
        return name;
      },
      missing: []
    },
    generic: {
      label: 'General',
      map: (name) => name,
      missing: []
    }
  };

  /* ─────────────────────────────────────────
     4. AUTO-STRUCTURE
  ───────────────────────────────────────── */
  function autoStructure(fileMap) {
    const paths  = Object.keys(fileMap);
    const type   = detectProjectType(paths);
    const struct = STRUCTURES[type] || STRUCTURES.generic;
    const renames   = {};
    const newFiles  = {};
    const log       = [];

    paths.forEach(originalPath => {
      const parts    = originalPath.split('/');
      const fileName = parts[parts.length - 1];
      const cleanName = cleanFileName(fileName);
      let   newPath   = struct.map(cleanName);

      // If already in a good path, keep it relative
      if (cleanName !== fileName) {
        renames[originalPath] = newPath;
        log.push(`Renamed: ${fileName} → ${cleanName}`);
      } else if (newPath !== originalPath) {
        renames[originalPath] = newPath;
        log.push(`Moved: ${originalPath} → ${newPath}`);
      }
    });

    return { type, label: struct.label, renames, newFiles, log };
  }

  /* ─────────────────────────────────────────
     5. README GENERATOR
  ───────────────────────────────────────── */
  function generateReadme(projectName, fileMap) {
    const paths   = Object.keys(fileMap);
    const type    = detectProjectType(paths);
    const struct  = STRUCTURES[type] || STRUCTURES.generic;
    const year    = new Date().getFullYear();

    // Detect tech from filenames
    const techStack = [];
    const allPaths  = paths.join(' ').toLowerCase();
    if (allPaths.includes('.tsx') || allPaths.includes('.jsx')) techStack.push('React');
    if (allPaths.includes('next.config'))   techStack.push('Next.js');
    if (allPaths.includes('vite.config'))   techStack.push('Vite');
    if (allPaths.includes('tailwind'))      techStack.push('Tailwind CSS');
    if (allPaths.includes('.ts') || allPaths.includes('.tsx')) techStack.push('TypeScript');
    if (allPaths.includes('express'))       techStack.push('Express.js');
    if (allPaths.includes('.py'))           techStack.push('Python');
    if (allPaths.includes('django'))        techStack.push('Django');
    if (allPaths.includes('flask'))         techStack.push('Flask');
    if (allPaths.includes('.vue'))          techStack.push('Vue.js');
    if (allPaths.includes('.svelte'))       techStack.push('Svelte');
    if (allPaths.includes('.go'))           techStack.push('Go');
    if (allPaths.includes('.rs'))           techStack.push('Rust');
    if (!techStack.length)                  techStack.push(struct.label);

    // Build file tree display
    const topFiles = paths.slice(0, 20).map(p => `│   ├── ${p}`).join('\n');

    const installSection = {
      nextjs: '```bash\nnpm install\nnpm run dev\n```',
      react:  '```bash\nnpm install\nnpm start\n```',
      vite:   '```bash\nnpm install\nnpm run dev\n```',
      nodejs: '```bash\nnpm install\nnode src/index.js\n```',
      python: '```bash\npip install -r requirements.txt\npython main.py\n```',
      html:   'Open `index.html` in your browser, or use:\n```bash\nnpx serve .\n```',
      generic:'Follow project-specific setup instructions below.'
    }[type] || 'See setup instructions below.';

    return `# ${projectName}

> A ${struct.label} project — organized and GitHub-ready by **ForgeHub AI**.

## 📋 Overview

${projectName} is a ${struct.label} application. This repository was structured and documented using ForgeHub AI.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (or relevant runtime for your stack)
- Git

### Installation & Running

${installSection}

## 🏗️ Project Structure

\`\`\`
${projectName}/
│
${topFiles}
│
└── README.md
\`\`\`

## 🛠️ Tech Stack

${techStack.map(t => `- **${t}**`).join('\n')}

## ✨ Features

- Core application functionality
- Clean, organized project structure
- Ready for GitHub deployment

## 📖 Usage

1. Clone the repository
2. Install dependencies
3. Configure environment variables (see \`.env.example\`)
4. Run the development server

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**${projectName}** — Built and maintained with ❤️

---

*Documentation generated by [ForgeHub AI](https://github.com) — Tukaram Hankare*
`;
  }

  /* ─────────────────────────────────────────
     6. GITIGNORE TEMPLATES
  ───────────────────────────────────────── */
  const GITIGNORE_TEMPLATES = {
    nextjs: `# Next.js
.next/
out/
build/
dist/

# Dependencies
node_modules/
.pnp
.pnp.js

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Misc
.DS_Store
*.pem
.vercel
.turbo
*.tsbuildinfo
next-env.d.ts`,

    react: `# React / Create React App
/build
/node_modules
/.pnp
.pnp.js

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Misc
.DS_Store
.env.local
coverage/
*.tsbuildinfo`,

    vite: `# Vite
dist/
dist-ssr/
node_modules/
*.local

# Environment
.env
.env.local
.env.*.local

# Logs
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
lerna-debug.log*

# Misc
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`,

    nodejs: `# Node.js
node_modules/
dist/
build/
.npm

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage
coverage/
.nyc_output/

# Misc
.DS_Store
.node_repl_history`,

    python: `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# Virtual environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/
.python-version

# IDEs
.idea/
.vscode/
*.swp
*.swo

# Misc
.DS_Store
*.sqlite3
*.db`,

    golang: `# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out

# Vendor
vendor/

# Environment
.env
.env.local

# Misc
.DS_Store`,

    rust: `# Rust
target/
Cargo.lock
*.rs.bk
*.pdb

# Environment
.env

# Misc
.DS_Store`,

    php: `# PHP
/vendor/
composer.lock
*.cache
.env
.env.local

# Misc
.DS_Store`,

    java: `# Java
*.class
*.jar
*.war
*.ear
*.zip
*.tar.gz
*.rar
target/
.mvn/
build/

# IDE
.idea/
*.iml
.eclipse/
.settings/
.classpath
.project

# Misc
.DS_Store`,

    html: `# Static site
.DS_Store
Thumbs.db
node_modules/
dist/
build/
.cache/

# Environment
.env

# Misc
*.log`,

    generic: `# General
.DS_Store
Thumbs.db
*.log
*.tmp
*.temp
.env
.env.local
node_modules/
dist/
build/
coverage/
.cache/
*.bak
*.orig
*.swp
*.swo
*~`,
  };

  function generateGitignore(fileMap) {
    const type = detectProjectType(Object.keys(fileMap));
    return GITIGNORE_TEMPLATES[type] || GITIGNORE_TEMPLATES.generic;
  }

  /* ─────────────────────────────────────────
     7. LICENSE (MIT)
  ───────────────────────────────────────── */
  function generateLicense(projectName) {
    const year = new Date().getFullYear();
    return `MIT License

Copyright (c) ${year} ${projectName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  }

  /* ─────────────────────────────────────────
     8. CONTRIBUTING.md
  ───────────────────────────────────────── */
  function generateContributing(projectName) {
    return `# Contributing to ${projectName}

Thank you for considering contributing to ${projectName}! 🎉

## 🚀 Getting Started

1. **Fork** the repository
2. **Clone** your fork: \`git clone https://github.com/your-username/${projectName}.git\`
3. **Create a branch**: \`git checkout -b feature/your-feature-name\`
4. **Make changes** and commit: \`git commit -m "feat: add your feature"\`
5. **Push**: \`git push origin feature/your-feature-name\`
6. **Open a Pull Request**

## 📝 Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat:\` New feature
- \`fix:\` Bug fix
- \`docs:\` Documentation changes
- \`style:\` Formatting, no logic change
- \`refactor:\` Code refactoring
- \`test:\` Adding or updating tests
- \`chore:\` Build process or auxiliary tool changes

## 🐛 Reporting Bugs

1. Check existing [Issues](https://github.com/your-username/${projectName}/issues)
2. Open a new issue with: description, steps to reproduce, expected vs actual behavior

## 💡 Feature Requests

Open an issue with the label \`enhancement\` and describe your idea.

## 📄 Code Style

- Follow the existing code style
- Add comments for complex logic
- Write meaningful variable and function names
- Keep functions small and focused

## ✅ Pull Request Checklist

- [ ] Code follows project style
- [ ] Tests pass (if applicable)
- [ ] Documentation updated
- [ ] Commit messages follow convention

---

*By contributing, you agree your contributions will be licensed under the MIT License.*
`;
  }

  /* ─────────────────────────────────────────
     9. GAP DETECTION + FILLER
  ───────────────────────────────────────── */
  function detectAndFillGaps(fileMap, projectName) {
    const paths  = Object.keys(fileMap);
    const type   = detectProjectType(paths);
    const struct = STRUCTURES[type] || STRUCTURES.generic;
    const all    = paths.map(p => p.toLowerCase());
    const gaps   = [];
    const filled = {};

    // Check for universal missing files
    if (!all.some(p => p.includes('readme'))) {
      gaps.push('Missing README.md');
      filled['README.md'] = generateReadme(projectName, fileMap);
    }
    if (!all.some(p => p.includes('.gitignore'))) {
      gaps.push('Missing .gitignore');
      filled['.gitignore'] = generateGitignore(fileMap);
    }
    if (!all.some(p => p.includes('license'))) {
      gaps.push('Missing LICENSE');
      filled['LICENSE'] = generateLicense(projectName);
    }
    if (!all.some(p => p.includes('contributing'))) {
      gaps.push('Missing CONTRIBUTING.md');
      filled['CONTRIBUTING.md'] = generateContributing(projectName);
    }

    // Type-specific gaps
    if (['react','nextjs','vite','nodejs'].includes(type) && !all.some(p => p.includes('package.json'))) {
      gaps.push('Missing package.json');
      filled['package.json'] = generatePackageJson(projectName, type);
    }
    if (!all.some(p => p.includes('.env.example')) && ['react','nextjs','vite','nodejs','python'].includes(type)) {
      gaps.push('Missing .env.example');
      filled['.env.example'] = generateEnvExample(type);
    }
    if (type === 'nodejs' && !all.some(p => ['index.js','server.js','app.js','main.js'].some(n => p.endsWith(n)))) {
      gaps.push('Missing entry point (index.js)');
      filled['src/index.js'] = `'use strict';\n\nconst express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from ${projectName}!', status: 'ok' });\n});\n\napp.listen(PORT, () => {\n  console.log(\`🚀 Server running on port \${PORT}\`);\n});\n\nmodule.exports = app;\n`;
    }
    if (type === 'python' && !all.some(p => p.includes('requirements.txt'))) {
      gaps.push('Missing requirements.txt');
      filled['requirements.txt'] = '# Add your Python dependencies here\n# Example:\n# flask==3.0.0\n# requests==2.31.0\n';
    }

    return { type, gaps, filled };
  }

  /* ─────────────────────────────────────────
     10. FILE GENERATORS (templates)
  ───────────────────────────────────────── */
  function generatePackageJson(name, type) {
    const scripts = {
      nextjs: '{"dev":"next dev","build":"next build","start":"next start","lint":"next lint"}',
      react:  '{"start":"react-scripts start","build":"react-scripts build","test":"react-scripts test"}',
      vite:   '{"dev":"vite","build":"vite build","preview":"vite preview"}',
      nodejs: '{"start":"node src/index.js","dev":"nodemon src/index.js","test":"jest"}',
    }[type] || '{"start":"node index.js"}';

    return `{
  "name": "${name}",
  "version": "1.0.0",
  "description": "A ${(STRUCTURES[type]||STRUCTURES.generic).label} project",
  "main": "src/index.js",
  "scripts": ${scripts},
  "keywords": [],
  "author": "",
  "license": "MIT"
}
`;
  }

  function generateEnvExample(type) {
    const base = `# Environment Variables
# Copy this file to .env and fill in values

NODE_ENV=development
PORT=3000
`;
    const extras = {
      nextjs:  `NEXT_PUBLIC_API_URL=http://localhost:3000\nNEXTAUTH_SECRET=your-secret-here\n`,
      react:   `REACT_APP_API_URL=http://localhost:3000\n`,
      nodejs:  `DATABASE_URL=mongodb://localhost:27017/mydb\nJWT_SECRET=your-jwt-secret\n`,
      python:  `DATABASE_URL=sqlite:///db.sqlite3\nSECRET_KEY=your-secret-key\nDEBUG=True\n`,
    };
    return base + (extras[type] || '');
  }

  /* ─────────────────────────────────────────
     11. GENERATE FILE FROM DESCRIPTION
  ───────────────────────────────────────── */
  function generateFileFromPrompt(prompt, fileMap) {
    const p    = prompt.toLowerCase();
    const type = detectProjectType(Object.keys(fileMap));
    const isReactish = ['react','nextjs','vite'].includes(type);

    // ── Login Form ──
    if (p.includes('login') && (p.includes('form') || p.includes('page'))) {
      if (isReactish) return { path: 'src/components/LoginForm.jsx', content: `import { useState } from 'react';\n\nexport default function LoginForm({ onSubmit }) {\n  const [form, setForm] = useState({ email: '', password: '' });\n  const [error, setError] = useState('');\n  const [loading, setLoading] = useState(false);\n\n  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));\n\n  const handleSubmit = async e => {\n    e.preventDefault();\n    setError('');\n    setLoading(true);\n    try {\n      await onSubmit?.(form);\n    } catch (err) {\n      setError(err.message || 'Login failed');\n    } finally {\n      setLoading(false);\n    }\n  };\n\n  return (\n    <form onSubmit={handleSubmit} className="login-form">\n      <h2>Sign In</h2>\n      {error && <p className="error">{error}</p>}\n      <input name="email"    type="email"    value={form.email}    onChange={handleChange} placeholder="Email"    required />\n      <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Password" required />\n      <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>\n    </form>\n  );\n}\n` };
      return { path: 'login.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <title>Login</title>\n  <style>\n    body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}\n    form{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,.1);width:320px}\n    h2{margin:0 0 20px;font-size:22px}\n    input{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box}\n    button{width:100%;padding:12px;background:#0094ff;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}\n    button:hover{background:#007de0}\n    .err{color:red;font-size:12px;margin-bottom:10px}\n  </style>\n</head>\n<body>\n  <form id="loginForm">\n    <h2>Sign In</h2>\n    <p class="err" id="err" style="display:none"></p>\n    <input type="email"    name="email"    placeholder="Email"    required/>\n    <input type="password" name="password" placeholder="Password" required/>\n    <button type="submit">Sign In</button>\n  </form>\n  <script>\n    loginForm.addEventListener('submit', e => {\n      e.preventDefault();\n      // TODO: handle login\n      alert('Login submitted!');\n    });\n  </script>\n</body>\n</html>\n` };
    }

    // ── Navbar / Header ──
    if (p.includes('navbar') || p.includes('nav') || p.includes('header')) {
      if (isReactish) return { path: 'src/components/Navbar.jsx', content: `import { useState } from 'react';\n\nconst LINKS = [\n  { href: '/', label: 'Home' },\n  { href: '/about', label: 'About' },\n  { href: '/contact', label: 'Contact' },\n];\n\nexport default function Navbar({ brand = 'MyApp', links = LINKS }) {\n  const [open, setOpen] = useState(false);\n  return (\n    <nav className="navbar">\n      <a href="/" className="brand">{brand}</a>\n      <button className="hamburger" onClick={() => setOpen(o => !o)} aria-label="Menu">\n        {open ? '✕' : '☰'}\n      </button>\n      <ul className={open ? 'nav-links open' : 'nav-links'}>\n        {links.map(l => (\n          <li key={l.href}><a href={l.href}>{l.label}</a></li>\n        ))}\n      </ul>\n    </nav>\n  );\n}\n` };
      return { path: 'components/navbar.html', content: `<nav class="navbar">\n  <a href="/" class="brand">MyApp</a>\n  <button class="hamburger" onclick="this.nextElementSibling.classList.toggle('open')">☰</button>\n  <ul class="nav-links">\n    <li><a href="/">Home</a></li>\n    <li><a href="/about">About</a></li>\n    <li><a href="/contact">Contact</a></li>\n  </ul>\n</nav>\n\n<style>\n.navbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:#0d1117;color:#fff}\n.brand{color:#00d4ff;text-decoration:none;font-weight:700;font-size:18px}\n.nav-links{display:flex;gap:20px;list-style:none;margin:0;padding:0}\n.nav-links a{color:#cdd5e0;text-decoration:none;font-size:14px;transition:color .2s}\n.nav-links a:hover{color:#00d4ff}\n.hamburger{display:none;background:none;border:none;color:#fff;font-size:20px;cursor:pointer}\n@media(max-width:600px){.hamburger{display:block}.nav-links{display:none;flex-direction:column;position:absolute;top:50px;left:0;right:0;background:#0d1117;padding:12px}.nav-links.open{display:flex}}\n</style>\n` };
    }

    // ── API Config / Fetch ──
    if (p.includes('api') && (p.includes('config') || p.includes('client') || p.includes('fetch'))) {
      if (type === 'python') return { path: 'config/api.py', content: `import os\nimport requests\nfrom typing import Any, Optional\n\nBASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3000/api')\nAPI_KEY  = os.getenv('API_KEY', '')\n\ndef get_headers():\n    return {\n        'Content-Type': 'application/json',\n        'Authorization': f'Bearer {API_KEY}' if API_KEY else '',\n    }\n\ndef api_get(endpoint: str) -> Any:\n    r = requests.get(f'{BASE_URL}{endpoint}', headers=get_headers())\n    r.raise_for_status()\n    return r.json()\n\ndef api_post(endpoint: str, data: dict) -> Any:\n    r = requests.post(f'{BASE_URL}{endpoint}', json=data, headers=get_headers())\n    r.raise_for_status()\n    return r.json()\n` };
      return { path: 'src/lib/api.js', content: `const BASE_URL = import.meta?.env?.VITE_API_URL || process.env?.REACT_APP_API_URL || '/api';\n\nconst defaultHeaders = () => ({\n  'Content-Type': 'application/json',\n  ...(localStorage.getItem('token') ? { Authorization: \`Bearer \${localStorage.getItem('token')}\` } : {}),\n});\n\nasync function request(method, path, body) {\n  const res = await fetch(\`\${BASE_URL}\${path}\`, {\n    method,\n    headers: defaultHeaders(),\n    body: body ? JSON.stringify(body) : undefined,\n  });\n  if (!res.ok) {\n    const err = await res.json().catch(() => ({ message: res.statusText }));\n    throw new Error(err.message || \`Request failed: \${res.status}\`);\n  }\n  return res.json();\n}\n\nexport const api = {\n  get:    (path)       => request('GET',    path),\n  post:   (path, body) => request('POST',   path, body),\n  put:    (path, body) => request('PUT',    path, body),\n  patch:  (path, body) => request('PATCH',  path, body),\n  delete: (path)       => request('DELETE', path),\n};\n\nexport default api;\n` };
    }

    // ── Database / Schema ──
    if (p.includes('database') || p.includes('schema') || p.includes('model')) {
      if (type === 'nodejs') return { path: 'src/models/User.js', content: `const mongoose = require('mongoose');\n\nconst userSchema = new mongoose.Schema({\n  name:     { type: String, required: true, trim: true },\n  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },\n  password: { type: String, required: true, minlength: 8 },\n  role:     { type: String, enum: ['user', 'admin'], default: 'user' },\n  avatar:   { type: String, default: null },\n  isActive: { type: Boolean, default: true },\n}, { timestamps: true });\n\nuserSchema.index({ email: 1 });\n\nuserSchema.methods.toJSON = function() {\n  const obj = this.toObject();\n  delete obj.password;\n  return obj;\n};\n\nmodule.exports = mongoose.model('User', userSchema);\n` };
      if (type === 'python') return { path: 'models/user.py', content: `from datetime import datetime\nfrom dataclasses import dataclass, field\nfrom typing import Optional\n\n@dataclass\nclass User:\n    id: Optional[int] = None\n    name: str = ''\n    email: str = ''\n    password_hash: str = ''\n    role: str = 'user'\n    is_active: bool = True\n    created_at: datetime = field(default_factory=datetime.now)\n    updated_at: datetime = field(default_factory=datetime.now)\n\n    def to_dict(self):\n        return {\n            'id': self.id,\n            'name': self.name,\n            'email': self.email,\n            'role': self.role,\n            'is_active': self.is_active,\n            'created_at': self.created_at.isoformat(),\n        }\n` };
    }

    // ── Button Component ──
    if (p.includes('button') || p.includes('btn')) {
      if (isReactish) return { path: 'src/components/Button.jsx', content: `export default function Button({\n  children, onClick, variant = 'primary', size = 'md',\n  disabled = false, loading = false, className = ''\n}) {\n  const base = 'btn';\n  const vars = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' };\n  const sizes = { sm: 'btn-sm', md: '', lg: 'btn-lg' };\n  const cls = [base, vars[variant] || vars.primary, sizes[size], className].filter(Boolean).join(' ');\n\n  return (\n    <button className={cls} onClick={onClick} disabled={disabled || loading} type="button">\n      {loading ? <span className="btn-spinner" /> : null}\n      {children}\n    </button>\n  );\n}\n` };
    }

    // ── 404 / Error page ──
    if (p.includes('404') || p.includes('not found') || p.includes('error page')) {
      if (isReactish) return { path: 'src/pages/NotFound.jsx', content: `export default function NotFound() {\n  return (\n    <div style={{ textAlign: 'center', padding: '80px 20px' }}>\n      <h1 style={{ fontSize: '96px', fontWeight: 800, margin: 0, opacity: .15 }}>404</h1>\n      <h2 style={{ marginTop: 0 }}>Page Not Found</h2>\n      <p style={{ color: '#666' }}>The page you're looking for doesn't exist.</p>\n      <a href="/" style={{ color: '#0094ff', fontWeight: 600 }}>← Back to Home</a>\n    </div>\n  );\n}\n` };
      return { path: '404.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"/><title>404 – Page Not Found</title>\n<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d1117;color:#cdd5e0}div{text-align:center}.big{font-size:120px;font-weight:800;opacity:.1;line-height:1}a{color:#00d4ff;text-decoration:none;font-weight:600}</style>\n</head>\n<body><div>\n  <div class="big">404</div>\n  <h2>Page Not Found</h2>\n  <p>The page you're looking for doesn't exist.</p>\n  <a href="/">← Back to Home</a>\n</div></body>\n</html>\n` };
    }

    // ── Utility / helpers ──
    if (p.includes('util') || p.includes('helper') || p.includes('format')) {
      const ext  = isReactish ? 'js' : (type === 'python' ? 'py' : 'js');
      const path = isReactish ? 'src/utils/helpers.js' : `utils/helpers.${ext}`;
      if (ext === 'py') return { path, content: `"""Utility functions for the project."""\nfrom datetime import datetime\nimport re\n\ndef format_date(dt: datetime, fmt: str = '%Y-%m-%d') -> str:\n    """Format a datetime object as string."""\n    return dt.strftime(fmt)\n\ndef slugify(text: str) -> str:\n    """Convert text to URL-safe slug."""\n    text = text.lower().strip()\n    text = re.sub(r'[^\\w\\s-]', '', text)\n    return re.sub(r'[\\s_-]+', '-', text)\n\ndef truncate(text: str, length: int = 100, suffix: str = '…') -> str:\n    """Truncate text to given length."""\n    return text if len(text) <= length else text[:length].rstrip() + suffix\n\ndef is_email(email: str) -> bool:\n    """Basic email validation."""\n    return bool(re.match(r'^[\\w.+-]+@[\\w-]+\\.[\\w.]+$', email))\n` };
      return { path, content: `/**\n * Utility / helper functions\n * Auto-generated by ForgeHub AI\n */\n\nexport const formatDate = (date, locale = 'en-US', options = {}) =>\n  new Date(date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', ...options });\n\nexport const slugify = str =>\n  str.toLowerCase().trim().replace(/[^\\w\\s-]/g, '').replace(/[\\s_-]+/g, '-').replace(/^-+|-+$/g, '');\n\nexport const truncate = (str, n = 100, suffix = '…') =>\n  str.length > n ? str.slice(0, n).trimEnd() + suffix : str;\n\nexport const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);\n\nexport const debounce = (fn, ms = 300) => {\n  let t;\n  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };\n};\n\nexport const isEmail = email => /^[\\w.+-]+@[\\w-]+\\.[\\w.]+$/.test(email);\n\nexport const sleep = ms => new Promise(r => setTimeout(r, ms));\n\nexport const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));\n\nexport const clamp = (n, min, max) => Math.min(Math.max(n, min), max);\n` };
    }

    // ── Dockerfile ──
    if (p.includes('docker') || p.includes('container')) {
      const dockerfile = {
        nodejs:  `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "src/index.js"]\n`,
        python:  `FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["python", "main.py"]\n`,
        react:   `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/build /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n`,
        generic: `FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install 2>/dev/null || true\nEXPOSE 3000\nCMD ["node", "index.js"]\n`,
      };
      const type2 = detectProjectType(Object.keys(fileMap));
      return { path: 'Dockerfile', content: dockerfile[type2] || dockerfile.generic };
    }

    // ── GitHub Actions CI ──
    if (p.includes('ci') || p.includes('github action') || p.includes('workflow')) {
      return { path: '.github/workflows/ci.yml', content: `name: CI\n\non:\n  push:\n    branches: [main, master, develop]\n  pull_request:\n    branches: [main, master]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n\n    steps:\n      - uses: actions/checkout@v4\n\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n          cache: 'npm'\n\n      - name: Install dependencies\n        run: npm ci\n\n      - name: Run lint\n        run: npm run lint --if-present\n\n      - name: Run tests\n        run: npm test --if-present\n\n      - name: Build\n        run: npm run build --if-present\n` };
    }

    // ── Footer ──
    if (p.includes('footer')) {
      if (isReactish) return { path: 'src/components/Footer.jsx', content: `export default function Footer({ brand = 'MyApp' }) {\n  const year = new Date().getFullYear();\n  return (\n    <footer style={{ padding: '24px', textAlign: 'center', borderTop: '1px solid #eee', color: '#666', fontSize: 13 }}>\n      <p>© {year} {brand}. All rights reserved.</p>\n      <nav style={{ marginTop: 8 }}>\n        <a href="/privacy"  style={{ margin: '0 12px', color: '#666' }}>Privacy</a>\n        <a href="/terms"    style={{ margin: '0 12px', color: '#666' }}>Terms</a>\n        <a href="/contact"  style={{ margin: '0 12px', color: '#666' }}>Contact</a>\n      </nav>\n    </footer>\n  );\n}\n` };
    }

    // ── Default fallback ──
    const ext  = isReactish ? 'jsx' : type === 'python' ? 'py' : 'js';
    const safe = prompt.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '-').slice(0, 40) || 'new-file';
    const dir  = isReactish ? 'src/components/' : type === 'python' ? '' : 'src/';
    const name = safe.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return {
      path: `${dir}${name}.${ext}`,
      content: ext === 'py'
        ? `"""${prompt}\n\nAuto-generated by ForgeHub AI\n"""\n\n\ndef main():\n    """Main function."""\n    pass\n\n\nif __name__ == '__main__':\n    main()\n`
        : ext === 'jsx'
        ? `/**\n * ${prompt}\n * Auto-generated by ForgeHub AI\n */\n\nexport default function ${name}() {\n  return (\n    <div className="${safe.toLowerCase()}">\n      <h2>${prompt}</h2>\n      {/* TODO: implement component */}\n    </div>\n  );\n}\n`
        : `/**\n * ${prompt}\n * Auto-generated by ForgeHub AI\n */\n\n// TODO: implement ${prompt}\n\nexport function main() {\n  console.log('${name} initialized');\n}\n\nmain();\n`
    };
  }

  /* ─────────────────────────────────────────
     12. AI ENHANCE (formatter + linter)
  ───────────────────────────────────────── */
  function enhanceFile(path, content) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    let out = content;

    // Universal: normalise line endings, trim trailing whitespace
    out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    out = out.split('\n').map(l => l.trimEnd()).join('\n');
    // Remove multiple blank lines
    out = out.replace(/\n{3,}/g, '\n\n');

    if (['js','jsx','ts','tsx','mjs','cjs'].includes(ext)) {
      // Add 'use strict' if missing in .js
      if (ext === 'js' && !out.includes("'use strict'") && !out.includes('"use strict"') && !out.includes('import ') && !out.includes('export ')) {
        out = "'use strict';\n\n" + out;
      }
      // Remove console.log (warn, but don't remove console.error)
      out = out.replace(/^\s*console\.log\([^)]*\);?\s*\n/gm, '');
      // var → let/const (simple heuristic)
      out = out.replace(/\bvar\s+([a-zA-Z_$])/g, 'let $1');
    }

    if (['html'].includes(ext)) {
      // Ensure lang attribute on <html>
      if (out.includes('<html>')) out = out.replace('<html>', '<html lang="en">');
      // Ensure viewport meta
      if (!out.includes('viewport') && out.includes('<head>')) {
        out = out.replace('</head>', '  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n</head>');
      }
    }

    if (['json'].includes(ext)) {
      try {
        const parsed = JSON.parse(out);
        out = JSON.stringify(parsed, null, 2);
      } catch { /* leave as-is */ }
    }

    return out;
  }

  /* ─────────────────────────────────────────
     13. AI REFACTOR
  ───────────────────────────────────────── */
  function refactorFile(path, content) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    let out = enhanceFile(path, content); // start with enhance

    if (['js','jsx','ts','tsx'].includes(ext)) {
      // const for never-reassigned lets (simple pattern: `let x = ...;` not followed by `x =`)
      const lines = out.split('\n');
      const constifiable = new Set();
      lines.forEach((line, i) => {
        const m = line.match(/^\s*let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
        if (m) {
          const varName = m[1];
          const rest = lines.slice(i + 1).join('\n');
          const reassigned = new RegExp(`\\b${varName}\\s*=(?!=)`).test(rest);
          if (!reassigned) constifiable.add(varName);
        }
      });
      constifiable.forEach(name => {
        out = out.replace(new RegExp(`\\blet\\s+(${name})\\s*=`), `const $1 =`);
      });

      // Add JSDoc-style comment to exported functions if missing
      out = out.replace(/(^export (default )?function\s+\w+)/gm, (match) => {
        const prevLine = out.slice(0, out.indexOf(match)).split('\n').slice(-2).join('\n');
        if (prevLine.includes('*/') || prevLine.includes('//')) return match;
        return `/** Auto-documented by ForgeHub AI */\n${match}`;
      });
    }

    return out;
  }

  /* ─────────────────────────────────────────
     14. CHAT INTENT PARSER + RESPONDER
  ───────────────────────────────────────── */
  function chatRespond(userMsg, fileMap, projectName) {
    const m   = userMsg.toLowerCase();
    const paths = Object.keys(fileMap);
    const type  = detectProjectType(paths);
    const struct = STRUCTURES[type] || STRUCTURES.generic;
    const count  = paths.length;

    // Structure questions
    if (m.includes('how many') && m.includes('file')) return `Your project has <strong>${count} file${count===1?'':'s'}</strong> across <strong>${countFolders(paths)} folder${countFolders(paths)===1?'':'s'}</strong>.`;
    if (m.includes('what type') || m.includes('project type') || m.includes('what kind')) return `I detected this as a <strong>${struct.label}</strong> project based on your file types and structure.`;
    if (m.includes('what') && m.includes('missing')) {
      const { gaps } = detectAndFillGaps(fileMap, projectName);
      return gaps.length ? `Missing files I detected:\n<ul>${gaps.map(g=>`<li>${g}</li>`).join('')}</ul>\nUse <em>Fill Project Gaps</em> to auto-generate them.` : `✅ No critical files are missing! Your project looks complete.`;
    }
    if (m.includes('readme') || m.includes('documentation')) return `Use the <em>Generate README</em> button in the AI Tools panel — it will create a full README.md with your project name, tech stack, installation instructions, and structure.`;
    if (m.includes('gitignore')) return `Click <em>.gitignore + LICENSE</em> in AI Tools — I'll generate a ${struct.label}-specific .gitignore with all the right ignored files for your stack.`;
    if (m.includes('structure') || m.includes('organise') || m.includes('organize')) return `Click <em>Auto-Structure Project</em> — I'll apply ${struct.label} best-practice folder layout, rename messy files, and move everything into the right folders.`;
    if (m.includes('zip') || m.includes('export') || m.includes('download')) return `Hit <strong>Export ZIP</strong> in the top bar. All your files will be packaged into a ready-to-push ZIP. Extract it and run <code>git init && git add . && git commit -m "Initial commit"</code> to push to GitHub.`;
    if (m.includes('github') || m.includes('push') || m.includes('deploy')) return `For GitHub:\n<pre>git init\ngit add .\ngit commit -m "Initial commit"\ngit remote add origin &lt;your-repo-url&gt;\ngit push -u origin main</pre>\nOr use <strong>Make GitHub Ready</strong> to run the full pipeline first!`;
    if (m.includes('list') && m.includes('file')) return count ? `Files in your project:\n<pre>${paths.slice(0,30).join('\n')}${paths.length>30?'\n…and '+(paths.length-30)+' more':''}</pre>` : 'No files uploaded yet.';
    if (m.includes('rename') || m.includes('clean') || m.includes('messy')) return `Run <em>Auto-Structure</em> — it automatically strips messy suffixes like "final", "copy", "BACKUP", "v2" from file names and renames everything to clean kebab-case.`;
    if (m.includes('help') || m.includes('what can') || m.includes('feature')) return `I can:\n<ul><li>⚙️ <strong>Auto-Structure</strong> — detect project type + reorganize files</li><li>📝 <strong>Generate README</strong> — full documentation</li><li>🛡️ <strong>.gitignore + LICENSE</strong> — MIT + type-specific ignores</li><li>🔍 <strong>Fill Gaps</strong> — detect + generate missing files</li><li>✨ <strong>Generate File</strong> — describe any file in plain English</li><li>🔄 <strong>Refactor</strong> — right-click any file → AI Refactor</li><li>📦 <strong>Export ZIP</strong> — GitHub-ready package</li></ul>`;

    // Fallback — summarise project
    return count === 0
      ? `No files uploaded yet. Drop your project files into the explorer or use the upload zone!`
      : `Your <strong>${struct.label}</strong> project has ${count} file${count===1?'':'s'}. Try <em>Auto-Structure</em> to organize it, or ask me anything specific about your files.`;
  }

  function countFolders(paths) {
    const folders = new Set();
    paths.forEach(p => {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
    });
    return folders.size;
  }

  /* ─────────────────────────────────────────
     15. INSIGHTS BUILDER
  ───────────────────────────────────────── */
  function buildInsights(fileMap, projectName) {
    const paths = Object.keys(fileMap);
    if (!paths.length) return null;

    const type   = detectProjectType(paths);
    const struct = STRUCTURES[type] || STRUCTURES.generic;
    const all    = paths.map(p => p.toLowerCase());

    // Extension count
    const extCount = {};
    paths.forEach(p => {
      const e = (p.split('.').pop() || 'none').toLowerCase();
      extCount[e] = (extCount[e] || 0) + 1;
    });

    // Folder count
    const folders = new Set();
    paths.forEach(p => {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
    });

    // Checklist
    const checks = [
      { label: 'README.md',       ok: all.some(p => p.includes('readme')) },
      { label: '.gitignore',      ok: all.some(p => p.includes('.gitignore')) },
      { label: 'LICENSE',         ok: all.some(p => p.includes('license')) },
      { label: 'CONTRIBUTING.md', ok: all.some(p => p.includes('contributing')) },
      { label: '.env.example',    ok: all.some(p => p.includes('.env.example')) },
    ];
    const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);

    return { type, label: struct.label, paths, extCount, folderCount: folders.size, checks, score };
  }

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  return {
    detectProjectType,
    autoStructure,
    generateReadme,
    generateGitignore,
    generateLicense,
    generateContributing,
    detectAndFillGaps,
    generateFileFromPrompt,
    generatePackageJson,
    generateEnvExample,
    enhanceFile,
    refactorFile,
    chatRespond,
    buildInsights,
    cleanFileName,
  };

})();
