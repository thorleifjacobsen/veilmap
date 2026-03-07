'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }
      router.push('/login');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm p-8 rounded-lg" style={{ background: 'var(--panel2)', border: '1px solid var(--border)' }}>
        <h1 className="text-center mb-8" style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '.1em', textShadow: '0 0 20px rgba(200,150,62,.3)' }}>
          Veil<span style={{ color: 'var(--ember)' }}>Map</span>
        </h1>
        <h2 className="text-center mb-6" style={{ fontFamily: 'Cinzel, serif', fontSize: '.75rem', color: 'var(--dim)', letterSpacing: '.15em', textTransform: 'uppercase' }}>Create Account</h2>
        {error && (
          <div className="mb-4 p-2 rounded text-center text-sm" style={{ background: 'rgba(224,92,42,.1)', border: '1px solid rgba(224,92,42,.3)', color: 'var(--ember)' }}>{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1" style={{ fontFamily: 'Cinzel, serif', fontSize: '.56rem', color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-3 py-2 rounded outline-none" style={{ background: 'rgba(0,0,0,.45)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.85rem' }} />
          </div>
          <div>
            <label className="block mb-1" style={{ fontFamily: 'Cinzel, serif', fontSize: '.56rem', color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-3 py-2 rounded outline-none" style={{ background: 'rgba(0,0,0,.45)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.85rem' }} />
          </div>
          <div>
            <label className="block mb-1" style={{ fontFamily: 'Cinzel, serif', fontSize: '.56rem', color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-3 py-2 rounded outline-none" style={{ background: 'rgba(0,0,0,.45)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.85rem' }} />
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded cursor-pointer transition-all"
            style={{ fontFamily: 'Cinzel, serif', fontSize: '.65rem', letterSpacing: '.1em', background: 'rgba(200,150,62,.12)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>
            {loading ? 'Creating account…' : 'JOIN THE QUEST'}
          </button>
        </form>
        <p className="mt-6 text-center" style={{ fontSize: '.8rem', color: 'var(--dim)' }}>
          Already have an account?{' '}<a href="/login" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
