// One-time sign-in. The account is created in the Supabase dashboard; there is no sign-up.
export function renderLogin(root, sb) {
  root.innerHTML = `
    <div class="onb login">
      <div class="brand">تن‌آرا</div>
      <p class="muted">یک بار وارد شوید؛ بعد از آن روی این گوشی وارد می‌مانید.</p>
      <form class="stack" novalidate>
        <label class="field"><span>ایمیل</span><input name="email" type="email" autocomplete="username" dir="ltr"></label>
        <label class="field"><span>رمز</span><input name="password" type="password" autocomplete="current-password" dir="ltr"></label>
        <p class="err" hidden></p>
        <button class="btn primary block big">ورود</button>
      </form>
    </div>`;
  const form = root.querySelector('form');
  form.onsubmit = async e => {
    e.preventDefault();
    const F = form.elements;
    const btn = form.querySelector('button');
    const err = form.querySelector('.err');
    btn.disabled = true; err.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: F.email.value.trim(), password: F.password.value });
    btn.disabled = false;
    if (error) {
      err.textContent = /invalid/i.test(error.message) ? 'ایمیل یا رمز درست نیست.' : 'اتصال برقرار نشد. اینترنت را بررسی کنید.';
      err.hidden = false;
    }
  };
}
