const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname;
const backendDir = path.join(rootDir, '..', 'backend');
const frontendDir = path.join(rootDir, '..', 'frontend');

console.log('====================================');
console.log('  Ecommerce Image Gen - Dev Mode');
console.log('====================================');
console.log('');

// Check .env
const envPath = path.join(backendDir, '.env');
if (!fs.existsSync(envPath)) {
  console.log('Warning: backend\\.env not found');
  console.log('Please configure OpenAI API Key first');
  console.log('');
}

console.log('Starting services...');
console.log('');

// Start backend
const backend = spawn('npm', ['run', 'dev'], {
  cwd: backendDir,
  shell: true,
  stdio: 'inherit'
});

// Wait 3 seconds, then start frontend
setTimeout(() => {
  console.log('');
  console.log('Starting frontend...');
  console.log('');
  
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: frontendDir,
    shell: true,
    stdio: 'inherit'
  });

  console.log('');
  console.log('====================================');
  console.log('  Services Starting...');
  console.log('====================================');
  console.log('');
  console.log('Frontend: http://localhost:5173');
  console.log('Backend:  http://localhost:3001');
  console.log('Health:   http://localhost:3001/api/health');
  console.log('');
  console.log('Press Ctrl+C to stop all services');
  console.log('====================================');
  console.log('');
}, 3000);
