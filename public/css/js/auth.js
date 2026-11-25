// auth.js - sign up & sign in forms.
const errorBox = document.getElementById('error');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function clearError() {
  errorBox.classList.add('hidden');
}

async function submitForm(form, path, body) {
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try {
    await api(path, { method: 'POST', body });
    window.location.href = '/app';
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- Sign up ----------
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  const pw = document.getElementById('password');
  const bar = document.getElementById('strength-bar');

  // Simple strength meter: length + variety of character types.
  pw.addEventListener('input', () => {
    const v = pw.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const colors = ['#b4443a', '#b4443a', '#c9744f', '#c9a14f', '#3f6b55', '#3f6b55'];
    bar.style.width = `${(score / 5) * 100}%`;
    bar.style.background = colors[score];
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    const username = signupForm.username.value.trim();
    const email = signupForm.email.value.trim();
    const password = signupForm.password.value;
    const confirm = signupForm.confirm.value;

    // Client-side checks give instant feedback; the server checks everything again.
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return showError('Username must be 3–30 letters, numbers, or underscores.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Please enter a valid email address.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return showError('Password must be at least 8 characters and include a letter and a number.');
    if (password !== confirm) return showError('Passwords do not match.');

    submitForm(signupForm, '/api/auth/signup', { username, email, password });
  });
}

// ---------- Sign in ----------
const signinForm = document.getElementById('signin-form');
if (signinForm) {
  signinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();
    const identifier = signinForm.identifier.value.trim();
    const password = signinForm.password.value;
    if (!identifier || !password) return showError('Please enter your username/email and password.');
    submitForm(signinForm, '/api/auth/signin', { identifier, password });
  });
}
