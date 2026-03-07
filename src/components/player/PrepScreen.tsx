'use client';

import React from 'react';

const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'.split('');

export default function PrepScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[950] flex flex-col items-center justify-center" style={{ background: 'var(--prep)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="absolute" style={{
            fontFamily: 'Cinzel, serif', color: 'rgba(150,80,220,.06)',
            fontSize: `${1.5 + Math.random() * 3}rem`,
            left: `${Math.random() * 100}%`,
            animation: `runedrift ${8 + Math.random() * 12}s linear infinite`,
            animationDelay: `-${Math.random() * 12}s`,
          }}>
            {runes[Math.floor(Math.random() * runes.length)]}
          </div>
        ))}
      </div>
      <div className="mb-5" style={{
        fontFamily: 'Cinzel, serif', fontSize: '3.5rem', fontWeight: 900,
        color: 'rgba(200,150,62,.18)', letterSpacing: '.2em', textTransform: 'uppercase',
        animation: 'prepfade 3s ease-in-out infinite alternate',
      }}>VeilMap</div>
      <div className="mb-16" style={{
        fontFamily: 'Cinzel, serif', fontSize: '.8rem', color: 'rgba(150,80,220,.5)',
        letterSpacing: '.3em', textTransform: 'uppercase',
      }}>{message || 'Preparing next scene…'}</div>
      <div className="w-10 h-10 rounded-full" style={{
        border: '2px solid rgba(150,80,220,.15)', borderTopColor: 'rgba(150,80,220,.5)',
        animation: 'spin 1.4s linear infinite',
      }} />
      <style jsx>{`
        @keyframes runedrift {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-20vh) rotate(360deg); opacity: 0; }
        }
        @keyframes prepfade { 0% { opacity: 0.5; } 100% { opacity: 0.9; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
