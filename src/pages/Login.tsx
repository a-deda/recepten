import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Magic link (§9). Eén gebruiker, maar wel echte auth: de intake-endpoint
 * staat publiek en RLS is het enige dat de bak dichthoudt.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'leeg' | 'bezig' | 'verstuurd' | 'fout'>('leeg');
  const [melding, setMelding] = useState('');

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setStatus('bezig');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setStatus('fout');
      setMelding(error.message);
      return;
    }
    setStatus('verstuurd');
  }

  return (
    <main className="login">
      <h1 className="display login__titel">Receptenbak</h1>

      {status === 'verstuurd' ? (
        <p className="login__melding">
          Er staat een inloglink in je mail. Open hem op dit apparaat.
        </p>
      ) : (
        <form onSubmit={verstuur} className="login__form">
          <label htmlFor="email">E-mailadres</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jij@voorbeeld.nl"
          />
          <button type="submit" className="knop knop--primair" disabled={status === 'bezig'}>
            {status === 'bezig' ? 'Bezig…' : 'Stuur inloglink'}
          </button>
          {status === 'fout' && <p className="fout">{melding}</p>}
        </form>
      )}
    </main>
  );
}
