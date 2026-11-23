import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function AuthPage() {
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch {
      /* error is surfaced from the store */
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = async (): Promise<void> => {
    clearError();
    setMode('login');
    setEmail('demo@roomcraft.nl');
    setPassword('Roomcraft123!');
    setSubmitting(true);
    try {
      await login('demo@roomcraft.nl', 'Roomcraft123!');
    } catch {
      /* handled */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-content">
          <div className="brand" style={{ fontSize: 22 }}>
            <span className="brand-mark" style={{ width: 32, height: 32, fontSize: 17 }}>
              R
            </span>
            <span>
              RoomCraft
              <small style={{ fontSize: 11 }}>NL</small>
            </span>
          </div>
          <h1>Zie je kamer voordat je hem koopt.</h1>
          <p>
            Teken je plattegrond op ware grootte, richt hem in met realistische meubels en loop rond in
            3D. Alles blijft synchroon en je budget is altijd zichtbaar.
          </p>

          <div className="hero-features">
            <div className="hero-feature">
              <strong>2D en 3D synchroon</strong>
              <span>Eén bron van waarheid voor muren, deuren, ramen en meubels.</span>
            </div>
            <div className="hero-feature">
              <strong>Ware afmetingen</strong>
              <span>Elke wand, deur en kast in centimeters, met botsingscontrole.</span>
            </div>
            <div className="hero-feature">
              <strong>Budgetbewaking</strong>
              <span>Bestellijst per categorie en directe waarschuwing bij overschrijding.</span>
            </div>
            <div className="hero-feature">
              <strong>AI-indeling</strong>
              <span>Voorstellen op maat — jij keurt elke wijziging goed.</span>
            </div>
          </div>
        </div>
        <p className="tiny" style={{ color: 'var(--muted-2)', position: 'relative', zIndex: 2 }}>
          RoomCraft NL · demo-omgeving · producten uit de gelabelde democatalogus
        </p>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          <div>
            <h2>{mode === 'login' ? 'Welkom terug' : 'Maak je account'}</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              {mode === 'login'
                ? 'Log in om verder te werken aan je interieurprojecten.'
                : 'Eén account voor al je plattegronden, versies en budgetten.'}
            </p>
          </div>

          <form className="stack" onSubmit={(event) => void submit(event)}>
            {mode === 'register' ? (
              <label className="field">
                <span className="field-label">Naam</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  minLength={2}
                  required
                />
              </label>
            ) : null}
            <label className="field">
              <span className="field-label">E-mailadres</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Wachtwoord</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </label>

            {error ? <div className="form-error">{error}</div> : null}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting} style={{ height: 40 }}>
              {submitting ? 'Bezig…' : mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? 'Nog geen account?' : 'Al een account?'}{' '}
            <button
              type="button"
              onClick={() => {
                clearError();
                setMode(mode === 'login' ? 'register' : 'login');
              }}
            >
              {mode === 'login' ? 'Registreren' : 'Inloggen'}
            </button>
          </div>

          <div className="demo-hint">
            <strong style={{ color: 'var(--text)' }}>Snel bekijken?</strong>
            <div style={{ margin: '4px 0 8px' }}>
              Demo-account: <code>demo@roomcraft.nl</code> / <code>Roomcraft123!</code>
            </div>
            <button type="button" className="btn btn-sm btn-block" onClick={() => void useDemo()} disabled={submitting}>
              Inloggen met demo-account
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
