'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import type { Box, MapObject } from '@/types';

const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e',
  trigger: '#a080e0',
  hazard: '#e05c2a',
  note: '#5aba6a',
  hidden: '#555',
};

// ── Soundboard types ──
export type SoundSlotType = 'ambient' | 'effect';

export interface SoundSlot {
  id: string;
  name: string;
  fileUrl: string;
  type: SoundSlotType;
  volume: number; // 0-1
}

// ── Environment types ──
export type ParticleEffect = 'none' | 'rain' | 'snow' | 'embers' | 'mist';

export interface EnvironmentSettings {
  particleEffect: ParticleEffect;
  particleIntensity: number; // 0-100
  showOnGM: boolean;
}

interface RightPanelProps {
  boxes: Box[];
  objects: MapObject[];
  selectedBoxId: string | null;
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onBoxClick: (box: Box) => void;
  onRevealAll: () => void;
  onClearBoxes: () => void;
  onMapUpload: (file: File) => void;
  onObjectAdd: (file: File) => void;
  onObjectUpdate: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete: (id: string) => void;
  onObjectReorder: (id: string, direction: 'up' | 'down') => void;
  onLibraryOpen?: () => void;
  slug: string;
  onWsSend: (type: string, payload?: unknown) => void;
}

type SectionId = 'objects' | 'metaboxes' | 'environment' | 'soundboard';

const COLLAPSED_KEY = (slug: string) => `veilmap-panel-collapsed-${slug}`;

function useCollapsedSections(slug: string) {
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY(slug));
      if (stored) return JSON.parse(stored) as Record<SectionId, boolean>;
    } catch { /* ignore */ }
    return { objects: false, metaboxes: false, environment: true, soundboard: true };
  });

  const toggle = useCallback((id: SectionId) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(COLLAPSED_KEY(slug), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [slug]);

  return { collapsed, toggle };
}

// Ambient audio refs (module-level to persist across renders)
const ambientAudio: { el: HTMLAudioElement | null; slotId: string | null } = { el: null, slotId: null };
const effectAudioSet = new Set<HTMLAudioElement>();

const PARTICLE_OPTIONS: { value: ParticleEffect; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: '○' },
  { value: 'rain', label: 'Rain', icon: '🌧' },
  { value: 'snow', label: 'Snow', icon: '❄' },
  { value: 'embers', label: 'Embers', icon: '🔥' },
  { value: 'mist', label: 'Mist', icon: '🌫' },
];

export default function RightPanel({
  boxes,
  objects,
  selectedBoxId,
  selectedObjectId,
  onObjectSelect,
  onBoxClick,
  onRevealAll,
  onClearBoxes,
  onMapUpload,
  onObjectAdd,
  onObjectUpdate,
  onObjectDelete,
  onObjectReorder,
  onLibraryOpen,
  slug,
  onWsSend,
}: RightPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectInputRef = useRef<HTMLInputElement>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [objectMenuId, setObjectMenuId] = useState<string | null>(null);
  const [objectMenuPos, setObjectMenuPos] = useState<{ x: number; y: number } | null>(null);

  const { collapsed, toggle } = useCollapsedSections(slug);

  // ── Environment state ──
  const [env, setEnv] = useState<EnvironmentSettings>({
    particleEffect: 'none',
    particleIntensity: 50,
    showOnGM: false,
  });

  // ── Soundboard state ──
  const TOTAL_SLOTS = 12;
  const [slots, setSlots] = useState<(SoundSlot | null)[]>(() => Array(TOTAL_SLOTS).fill(null));
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [playingAmbientId, setPlayingAmbientId] = useState<string | null>(null);
  const [playingEffects, setPlayingEffects] = useState<Set<string>>(new Set());
  const [editingSlot, setEditingSlot] = useState<{ index: number; slot: SoundSlot | null } | null>(null);
  const [slotEditForm, setSlotEditForm] = useState<{ name: string; type: SoundSlotType; fileUrl: string }>({ name: '', type: 'ambient', fileUrl: '' });
  const audioUploadRef = useRef<HTMLInputElement>(null);
  const [audioUploadLoading, setAudioUploadLoading] = useState(false);

  // Load soundboard slots on mount
  useEffect(() => {
    fetch(`/api/sessions/${slug}/soundboard`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.slots) {
          const arr: (SoundSlot | null)[] = Array(TOTAL_SLOTS).fill(null);
          for (const s of data.slots as Array<{ id: string; name: string; file_url: string; type: string; volume: number; slot_index: number }>) {
            if (s.slot_index >= 0 && s.slot_index < TOTAL_SLOTS) {
              arr[s.slot_index] = { id: s.id, name: s.name, fileUrl: s.file_url, type: s.type as SoundSlotType, volume: s.volume };
            }
          }
          setSlots(arr);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Broadcast environment changes via WebSocket
  const applyEnv = useCallback((next: EnvironmentSettings) => {
    setEnv(next);
    onWsSend('session:settings', { environment: next });
  }, [onWsSend]);

  const handleMapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onMapUpload(f);
    },
    [onMapUpload],
  );

  const handleObjectFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        onObjectAdd(files[i]);
      }
      e.target.value = '';
    },
    [onObjectAdd],
  );

  const handleObjectDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) onObjectAdd(files[i]);
      }
    },
    [onObjectAdd],
  );

  const startEditName = (obj: MapObject) => {
    setEditingNameId(obj.id);
    setEditNameValue(obj.name);
  };

  const commitEditName = () => {
    if (editingNameId && editNameValue.trim()) {
      onObjectUpdate(editingNameId, { name: editNameValue.trim() });
    }
    setEditingNameId(null);
  };

  const openObjectMenu = (e: React.MouseEvent, objId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setObjectMenuId(objId);
    setObjectMenuPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!objectMenuId) return;
    const close = () => { setObjectMenuId(null); setObjectMenuPos(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [objectMenuId]);

  const sortedObjects = [...objects].sort((a, b) => b.zIndex - a.zIndex);

  // ── Soundboard: stop ambient (with optional fade) ──
  const stopAmbient = useCallback((fade: boolean = true) => {
    if (!ambientAudio.el) return;
    const audio = ambientAudio.el;
    ambientAudio.el = null;
    ambientAudio.slotId = null;
    setPlayingAmbientId(null);
    if (fade) {
      const startVol = audio.volume;
      const steps = 20;
      let step = 0;
      const interval = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          audio.pause();
          audio.currentTime = 0;
          clearInterval(interval);
        }
      }, 50);
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const playAmbient = useCallback((slot: SoundSlot, vol: number) => {
    stopAmbient(true);
    const audio = new Audio(slot.fileUrl);
    audio.loop = true;
    audio.volume = Math.min(1, slot.volume * vol);
    audio.play().catch(() => {});
    ambientAudio.el = audio;
    ambientAudio.slotId = slot.id;
    setPlayingAmbientId(slot.id);
    onWsSend('audio:play', { url: slot.fileUrl, volume: slot.volume * vol, loop: true });
  }, [stopAmbient, onWsSend]);

  const playEffect = useCallback((slot: SoundSlot, vol: number) => {
    const audio = new Audio(slot.fileUrl);
    audio.volume = Math.min(1, slot.volume * vol);
    effectAudioSet.add(audio);
    audio.play().catch(() => {});
    setPlayingEffects(prev => new Set(prev).add(slot.id));
    audio.onended = () => {
      effectAudioSet.delete(audio);
      setPlayingEffects(prev => { const s = new Set(prev); s.delete(slot.id); return s; });
    };
    onWsSend('audio:play', { url: slot.fileUrl, volume: slot.volume * vol, loop: false });
  }, [onWsSend]);

  const stopEffect = useCallback((slot: SoundSlot) => {
    for (const a of effectAudioSet) {
      const aUrl = new URL(a.src).pathname;
      if (aUrl === slot.fileUrl || a.src === window.location.origin + slot.fileUrl) {
        a.pause();
        a.currentTime = 0;
        effectAudioSet.delete(a);
        break;
      }
    }
    setPlayingEffects(prev => { const s = new Set(prev); s.delete(slot.id); return s; });
  }, []);

  const handleSlotClick = useCallback((slot: SoundSlot) => {
    if (slot.type === 'ambient') {
      if (playingAmbientId === slot.id) {
        stopAmbient(true);
      } else {
        playAmbient(slot, masterVolume);
      }
    } else {
      if (playingEffects.has(slot.id)) {
        stopEffect(slot);
      } else {
        playEffect(slot, masterVolume);
      }
    }
  }, [playingAmbientId, playingEffects, masterVolume, playAmbient, stopAmbient, playEffect, stopEffect]);

  // Update ambient volume when masterVolume changes
  useEffect(() => {
    if (ambientAudio.el) {
      const slot = slots.find(s => s?.id === ambientAudio.slotId);
      if (slot) ambientAudio.el.volume = Math.min(1, slot.volume * masterVolume);
    }
  }, [masterVolume, slots]);

  const openSlotEdit = (index: number) => {
    const slot = slots[index];
    setEditingSlot({ index, slot });
    setSlotEditForm(slot
      ? { name: slot.name, type: slot.type, fileUrl: slot.fileUrl }
      : { name: '', type: index < 6 ? 'ambient' : 'effect', fileUrl: '' }
    );
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUploadLoading(true);
    const fd = new FormData();
    fd.append('audio', file);
    try {
      const res = await fetch(`/api/sessions/${slug}/upload-audio`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json() as { url: string };
        setSlotEditForm(prev => ({ ...prev, fileUrl: data.url }));
      }
    } catch { /* ignore */ } finally {
      setAudioUploadLoading(false);
      if (audioUploadRef.current) audioUploadRef.current.value = '';
    }
  };

  const saveSlot = async () => {
    if (!editingSlot) return;
    const { index } = editingSlot;
    if (!slotEditForm.name.trim() || !slotEditForm.fileUrl) {
      setEditingSlot(null);
      return;
    }
    const slotData = {
      name: slotEditForm.name.trim(),
      type: slotEditForm.type,
      fileUrl: slotEditForm.fileUrl,
      volume: editingSlot.slot?.volume ?? 0.8,
      slotIndex: index,
    };
    try {
      const res = await fetch(`/api/sessions/${slug}/soundboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotData),
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        setSlots(prev => {
          const next = [...prev];
          next[index] = { id: data.id, name: slotData.name, fileUrl: slotData.fileUrl, type: slotData.type as SoundSlotType, volume: slotData.volume };
          return next;
        });
      }
    } catch { /* ignore */ }
    setEditingSlot(null);
  };

  const deleteSlot = async (index: number) => {
    const slot = slots[index];
    if (!slot) return;
    if (slot.type === 'ambient' && playingAmbientId === slot.id) stopAmbient(false);
    if (slot.type === 'effect' && playingEffects.has(slot.id)) stopEffect(slot);
    try {
      await fetch(`/api/sessions/${slug}/soundboard/${slot.id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setSlots(prev => { const next = [...prev]; next[index] = null; return next; });
    setEditingSlot(null);
  };

  const updateSlotVolume = (index: number, delta: number) => {
    setSlots(prev => {
      const next = [...prev];
      const slot = next[index];
      if (!slot) return prev;
      const newVol = Math.max(0, Math.min(1, slot.volume + delta));
      next[index] = { ...slot, volume: newVol };
      if (slot.type === 'ambient' && ambientAudio.el && ambientAudio.slotId === slot.id) {
        ambientAudio.el.volume = Math.min(1, newVol * masterVolume);
      }
      fetch(`/api/sessions/${slug}/soundboard/${slot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: newVol }),
      }).catch(() => {});
      return next;
    });
  };

  // Alt+S toggles soundboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 's') toggle('soundboard');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const ambientIndices = [0, 1, 2, 3, 4, 5];
  const effectIndices = [6, 7, 8, 9, 10, 11];

  return (
    <div
      className="flex w-[190px] flex-shrink-0 flex-col overflow-y-auto"
      style={{ background: '#100f18', borderLeft: '1px solid rgba(200,150,62,.2)' }}
    >
      {/* Objects section */}
      <CollapsibleSection
        id="objects"
        title="Objects"
        badge={objects.length}
        collapsed={collapsed.objects}
        onToggle={() => toggle('objects')}
        grow
      >
        <input ref={objectInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleObjectFileChange} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleMapChange} />
        <div className="flex items-center gap-1 mb-1.5">
          <span className="cursor-pointer text-[.58rem]" style={{ color: '#c8963e' }} onClick={() => objectInputRef.current?.click()} title="Upload file directly">📤</span>
          {onLibraryOpen && (
            <span className="cursor-pointer text-[.58rem] ml-auto" style={{ color: '#c8963e' }} onClick={onLibraryOpen}>+ Add</span>
          )}
        </div>
        {sortedObjects.length === 0 ? (
          <div
            className="cursor-pointer rounded border border-dashed p-2 text-center transition-all hover:border-[#c8963e] hover:bg-[rgba(200,150,62,.04)]"
            style={{ borderColor: 'rgba(200,150,62,.2)' }}
            onClick={() => objectInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleObjectDrop}
          >
            <div className="mb-0.5 text-base">🖼️</div>
            <div className="text-[.62rem] tracking-[.04em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>DROP IMAGES / GIFS</div>
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={handleObjectDrop}>
            {sortedObjects.map((obj) => (
              <div
                key={obj.id}
                className="mb-0.5 flex cursor-pointer items-center gap-1.5 rounded border px-1 py-0.5 text-[.72rem] transition-all hover:bg-[rgba(200,150,62,.05)]"
                style={{ borderColor: selectedObjectId === obj.id ? '#c8963e' : 'transparent', background: selectedObjectId === obj.id ? 'rgba(200,150,62,.07)' : 'transparent', opacity: obj.visible ? 1 : 0.4 }}
                onClick={() => onObjectSelect(selectedObjectId === obj.id ? null : obj.id)}
                onContextMenu={(e) => openObjectMenu(e, obj.id)}
              >
                <div className="h-[22px] w-[22px] flex-shrink-0 overflow-hidden rounded" style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(200,150,62,.15)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={obj.src} alt={obj.name} className="h-full w-full object-cover" />
                </div>
                {editingNameId === obj.id ? (
                  <input className="min-w-0 flex-1 bg-transparent text-[.6rem] outline-none" style={{ color: '#d4c4a0', borderBottom: '1px solid #c8963e' }} value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} onBlur={commitEditName} onKeyDown={(e) => { if (e.key === 'Enter') commitEditName(); if (e.key === 'Escape') setEditingNameId(null); }} autoFocus />
                ) : (
                  <span className="min-w-0 flex-1 cursor-text overflow-hidden text-ellipsis whitespace-nowrap text-[.68rem]" onDoubleClick={() => startEditName(obj)}>{obj.name}</span>
                )}
                {obj.locked && <span title="Locked" style={{ fontSize: '.6rem', opacity: 0.5 }}>🔒</span>}
                <MiniBtn title={obj.playerVisible === false ? 'Show on Player' : 'Hide on Player'} onClick={() => onObjectUpdate(obj.id, { playerVisible: !obj.playerVisible })}>
                  <span style={{ opacity: obj.playerVisible === false ? 0.3 : 1 }}>📺</span>
                </MiniBtn>
                <MiniBtn title={obj.visible ? 'Hide (GM)' : 'Show (GM)'} onClick={() => onObjectUpdate(obj.id, { visible: !obj.visible })}>
                  {obj.visible ? '👁' : '—'}
                </MiniBtn>
              </div>
            ))}
            <div className="mt-1 cursor-pointer rounded border border-dashed p-1 text-center text-[.58rem] transition-all hover:border-[#c8963e]" style={{ borderColor: 'rgba(200,150,62,.15)', color: 'rgba(212,196,160,.3)' }} onClick={() => objectInputRef.current?.click()}>
              + Add more
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Meta Boxes section */}
      <CollapsibleSection id="metaboxes" title="Meta Boxes" badge={boxes.length} collapsed={collapsed.metaboxes} onToggle={() => toggle('metaboxes')}>
        <div className="max-h-[120px] overflow-y-auto">
          {boxes.map((b) => (
            <div
              key={b.id}
              className="mb-0.5 flex cursor-pointer items-center gap-1 rounded border px-1.5 py-1 text-[.72rem] transition-all hover:bg-[rgba(200,150,62,.05)]"
              style={{ borderColor: selectedBoxId === b.id ? '#c8963e' : 'transparent', background: selectedBoxId === b.id ? 'rgba(200,150,62,.07)' : 'transparent', opacity: b.revealed ? 0.45 : 1 }}
              onClick={() => onBoxClick(b)}
            >
              <div className="h-[7px] w-[7px] flex-shrink-0 rounded-sm" style={{ background: b.color || TYPE_COLORS[b.type] || '#c8963e' }} />
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[.75rem]">{b.name}</span>
              <span className="text-[.55rem]" style={{ fontFamily: "'Cinzel',serif", color: b.revealed ? 'rgba(200,150,62,.5)' : 'rgba(212,196,160,.4)' }}>
                {b.revealed ? '✓' : b.type.slice(0, 4)}
              </span>
            </div>
          ))}
        </div>
        <SmallBtn onClick={onRevealAll}>✦ Reveal All</SmallBtn>
        <SmallBtn red onClick={onClearBoxes}>✕ Clear Boxes</SmallBtn>
      </CollapsibleSection>

      {/* Environment section */}
      <CollapsibleSection id="environment" title="Environment" collapsed={collapsed.environment} onToggle={() => toggle('environment')}>
        <div className="mb-2">
          <div className="mb-1 text-[.52rem] uppercase tracking-[.08em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Particles</div>
          <div className="grid grid-cols-5 gap-0.5">
            {PARTICLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                title={opt.label}
                className="flex flex-col items-center rounded py-1 text-[.7rem] transition-all"
                style={{
                  border: env.particleEffect === opt.value ? '1px solid #c8963e' : '1px solid rgba(200,150,62,.15)',
                  background: env.particleEffect === opt.value ? 'rgba(200,150,62,.15)' : 'transparent',
                  color: env.particleEffect === opt.value ? '#c8963e' : 'rgba(212,196,160,.5)',
                  cursor: 'pointer',
                }}
                onClick={() => applyEnv({ ...env, particleEffect: opt.value })}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>
        {env.particleEffect !== 'none' && (
          <>
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[.52rem] uppercase tracking-[.08em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Intensity</span>
                <span className="text-[.56rem]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>
                  {env.particleIntensity <= 33 ? 'Subtle' : env.particleIntensity <= 66 ? 'Medium' : 'Heavy'}
                </span>
              </div>
              <input
                type="range" min={1} max={100} value={env.particleIntensity}
                onChange={(e) => applyEnv({ ...env, particleIntensity: parseInt(e.target.value) })}
                className="h-[3px] w-full appearance-none rounded outline-none"
                style={{ background: 'rgba(200,150,62,.2)' }}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <div className="relative h-[14px] w-[26px] rounded-full transition-colors" style={{ background: env.showOnGM ? '#c8963e' : 'rgba(200,150,62,.2)' }}>
                <div className="absolute top-[2px] h-[10px] w-[10px] rounded-full transition-all" style={{ background: '#fff', left: env.showOnGM ? '14px' : '2px' }} />
              </div>
              <input type="checkbox" className="hidden" checked={env.showOnGM} onChange={(e) => applyEnv({ ...env, showOnGM: e.target.checked })} />
              <span className="text-[.58rem]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.5)' }}>Show on GM view</span>
            </label>
          </>
        )}
      </CollapsibleSection>

      {/* Soundboard section */}
      <CollapsibleSection
        id="soundboard"
        title="Soundboard"
        badge={slots.filter(Boolean).length || undefined}
        collapsed={collapsed.soundboard}
        onToggle={() => toggle('soundboard')}
        titleExtra={<span style={{ fontSize: '.44rem', marginLeft: 3, opacity: 0.4 }}>(Alt+S)</span>}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="shrink-0 text-[.52rem] uppercase tracking-[.06em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Master</span>
          <input
            type="range" min={0} max={100} value={Math.round(masterVolume * 100)}
            onChange={(e) => setMasterVolume(parseInt(e.target.value) / 100)}
            className="h-[3px] flex-1 appearance-none rounded outline-none"
            style={{ background: 'rgba(200,150,62,.2)' }}
          />
          <span className="w-6 text-right text-[.52rem]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>{Math.round(masterVolume * 100)}%</span>
        </div>

        <div className="mb-1.5">
          <div className="mb-1 text-[.5rem] uppercase tracking-[.09em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.3)' }}>Ambient</div>
          <div className="flex flex-col gap-0.5">
            {ambientIndices.map(i => (
              <SoundSlotRow
                key={i}
                slot={slots[i]}
                playing={!!slots[i] && playingAmbientId === slots[i]!.id}
                onPlay={() => { if (slots[i]) handleSlotClick(slots[i]!); }}
                onEdit={() => openSlotEdit(i)}
                onVolumeScroll={(delta) => updateSlotVolume(i, delta)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[.5rem] uppercase tracking-[.09em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.3)' }}>Effects</div>
          <div className="flex flex-col gap-0.5">
            {effectIndices.map(i => (
              <SoundSlotRow
                key={i}
                slot={slots[i]}
                playing={!!slots[i] && playingEffects.has(slots[i]!.id)}
                onPlay={() => { if (slots[i]) handleSlotClick(slots[i]!); }}
                onEdit={() => openSlotEdit(i)}
                onVolumeScroll={(delta) => updateSlotVolume(i, delta)}
              />
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Object context menu */}
      {objectMenuId && objectMenuPos && (
        <div className="fixed z-[900] rounded border shadow-lg py-1" style={{ left: objectMenuPos.x, top: objectMenuPos.y, background: '#100f18', borderColor: 'rgba(200,150,62,.3)', minWidth: 160 }}>
          {(() => {
            const obj = objects.find(o => o.id === objectMenuId);
            if (!obj) return null;
            return (
              <>
                <CtxItem onClick={() => { startEditName(obj); setObjectMenuId(null); }}>✏️ Rename</CtxItem>
                <CtxItem onClick={() => { onObjectUpdate(obj.id, { visible: !obj.visible }); setObjectMenuId(null); }}>{obj.visible ? '👁 Hide (GM)' : '👁 Show (GM)'}</CtxItem>
                <CtxItem onClick={() => { onObjectUpdate(obj.id, { playerVisible: !obj.playerVisible }); setObjectMenuId(null); }}>{obj.playerVisible === false ? '📺 Show on Player' : '📺 Hide on Player'}</CtxItem>
                <CtxItem onClick={() => { onObjectUpdate(obj.id, { locked: !obj.locked }); setObjectMenuId(null); }}>{obj.locked ? '🔓 Unlock' : '🔒 Lock'}</CtxItem>
                <CtxItem onClick={() => { onObjectReorder(obj.id, 'up'); setObjectMenuId(null); }}>▲ Move Up</CtxItem>
                <CtxItem onClick={() => { onObjectReorder(obj.id, 'down'); setObjectMenuId(null); }}>▼ Move Down</CtxItem>
                <div style={{ borderTop: '1px solid rgba(200,150,62,.15)', margin: '2px 0' }} />
                {obj.locked ? (
                  <div className="px-3 py-1.5 text-[.68rem]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(100,100,100,.5)', cursor: 'not-allowed' }}>✕ Delete (locked)</div>
                ) : (
                  <CtxItem danger onClick={() => { onObjectDelete(obj.id); setObjectMenuId(null); }}>✕ Delete</CtxItem>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Slot edit modal */}
      {editingSlot && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)' }} onClick={(e) => { if (e.target === e.currentTarget) setEditingSlot(null); }}>
          <div className="w-[300px] rounded-md p-4" style={{ background: '#0c0b13', border: '1px solid rgba(200,150,62,.4)', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div className="mb-3 text-[.7rem] tracking-[.1em]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>
              {editingSlot.slot ? '✎ Edit Slot' : '✎ Configure Slot'}
            </div>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="mb-1 block text-[.52rem] uppercase tracking-[.07em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Name</label>
                <input
                  type="text"
                  value={slotEditForm.name}
                  onChange={e => setSlotEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded border px-2 py-1 text-[.75rem] outline-none focus:border-[#c8963e]"
                  style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(200,150,62,.2)', color: '#d4c4a0', fontFamily: "'Crimson Pro',serif" }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[.52rem] uppercase tracking-[.07em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Type</label>
                <div className="flex gap-2">
                  {(['ambient', 'effect'] as const).map(t => (
                    <button key={t} className="flex-1 rounded border py-1 text-[.6rem] tracking-[.05em] transition-all" style={{ fontFamily: "'Cinzel',serif", cursor: 'pointer', borderColor: slotEditForm.type === t ? '#c8963e' : 'rgba(200,150,62,.2)', background: slotEditForm.type === t ? 'rgba(200,150,62,.15)' : 'transparent', color: slotEditForm.type === t ? '#c8963e' : 'rgba(212,196,160,.4)' }} onClick={() => setSlotEditForm(prev => ({ ...prev, type: t }))}>
                      {t === 'ambient' ? '≈ Ambient' : '▶ Effect'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[.52rem] uppercase tracking-[.07em]" style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}>Audio File</label>
                {slotEditForm.fileUrl && (
                  <div className="mb-1 truncate text-[.58rem]" style={{ color: 'rgba(212,196,160,.5)' }}>{slotEditForm.fileUrl.split('/').pop()}</div>
                )}
                <input ref={audioUploadRef} type="file" accept=".mp3,.ogg,.wav,audio/*" className="hidden" onChange={handleAudioUpload} />
                <button
                  className="w-full rounded border py-1 text-[.6rem] tracking-[.05em] transition-all hover:bg-[rgba(200,150,62,.15)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(200,150,62,.2)', color: '#c8963e', background: 'rgba(200,150,62,.07)', cursor: 'pointer' }}
                  onClick={() => audioUploadRef.current?.click()}
                  disabled={audioUploadLoading}
                >
                  {audioUploadLoading ? '⏳ Uploading…' : '📂 Choose File'}
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                {editingSlot.slot && (
                  <button className="flex-1 rounded border py-1 text-[.6rem] tracking-[.05em] transition-all hover:bg-[rgba(224,92,42,.15)]" style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(224,92,42,.3)', color: '#e05c2a', cursor: 'pointer', background: 'transparent' }} onClick={() => deleteSlot(editingSlot.index)}>
                    ✕ Remove
                  </button>
                )}
                <button
                  className="flex-1 rounded border py-1 text-[.6rem] tracking-[.05em] transition-all hover:bg-[rgba(200,150,62,.2)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: '#c8963e', color: '#c8963e', cursor: 'pointer', background: 'rgba(200,150,62,.1)' }}
                  onClick={saveSlot}
                  disabled={!slotEditForm.name.trim() || !slotEditForm.fileUrl}
                >
                  ✓ Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──

function CollapsibleSection({
  title, badge, collapsed, onToggle, grow, children, titleExtra,
}: {
  id: SectionId;
  title: string;
  badge?: number;
  collapsed: boolean;
  onToggle: () => void;
  grow?: boolean;
  children: React.ReactNode;
  titleExtra?: React.ReactNode;
}) {
  return (
    <div className={`flex-shrink-0 ${grow && !collapsed ? 'flex-1' : ''}`} style={{ borderBottom: '1px solid rgba(200,150,62,.2)' }}>
      <button className="w-full flex items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-[rgba(200,150,62,.04)]" onClick={onToggle} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <span className="h-[3px] w-[3px] flex-shrink-0 rounded-full" style={{ background: '#c8963e' }} />
        <span className="flex-1 text-[.65rem] font-semibold uppercase tracking-[.12em]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>
          {title}
          {titleExtra}
          {badge !== undefined && badge > 0 && (
            <span className="ml-1.5 rounded px-1 text-[.5rem]" style={{ background: 'rgba(200,150,62,.15)', color: 'rgba(212,196,160,.5)' }}>
              {badge}
            </span>
          )}
        </span>
        <span className="text-[.6rem] transition-transform duration-200" style={{ color: 'rgba(212,196,160,.4)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
      </button>
      {!collapsed && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

function SoundSlotRow({
  slot, playing, onPlay, onEdit, onVolumeScroll,
}: {
  slot: SoundSlot | null;
  playing: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onVolumeScroll: (delta: number) => void;
}) {
  if (!slot) {
    return (
      <div
        className="cursor-pointer rounded border border-dashed px-1 py-0.5 text-center text-[.52rem] transition-all hover:border-[#c8963e]"
        style={{ borderColor: 'rgba(200,150,62,.15)', color: 'rgba(212,196,160,.25)' }}
        onClick={onEdit}
      >
        + Add
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded border px-1 py-0.5" style={{ borderColor: playing ? 'rgba(200,150,62,.4)' : 'rgba(200,150,62,.1)', background: playing ? 'rgba(200,150,62,.06)' : 'transparent' }}>
      <button className="h-[18px] w-[18px] flex-shrink-0 cursor-pointer rounded text-[.6rem] transition-all hover:bg-[rgba(200,150,62,.2)]" style={{ border: 'none', background: 'transparent', color: playing ? '#c8963e' : 'rgba(212,196,160,.5)' }} onClick={onPlay} title={playing ? 'Stop' : 'Play'}>
        {playing ? '■' : '▶'}
      </button>
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[.6rem]" style={{ color: playing ? '#d4c4a0' : 'rgba(212,196,160,.6)' }}>{slot.name}</span>
      <div
        className="h-[14px] w-[14px] flex-shrink-0 cursor-ns-resize rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(rgba(200,150,62,.7) ${slot.volume * 360}deg, rgba(200,150,62,.15) 0deg)`, border: '1px solid rgba(200,150,62,.3)' }}
        title={`Volume: ${Math.round(slot.volume * 100)}%\nScroll to adjust`}
        onWheel={(e) => { e.preventDefault(); onVolumeScroll(e.deltaY < 0 ? 0.05 : -0.05); }}
      />
      <button className="h-[16px] w-[16px] flex-shrink-0 cursor-pointer rounded text-[.5rem] transition-all hover:bg-[rgba(200,150,62,.15)]" style={{ border: 'none', background: 'transparent', color: 'rgba(212,196,160,.4)' }} onClick={onEdit} title="Edit slot">
        ✎
      </button>
    </div>
  );
}

function CtxItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <div
      className="cursor-pointer px-3 py-1.5 text-[.68rem] transition-all hover:bg-[rgba(200,150,62,.1)]"
      style={{ fontFamily: "'Cinzel',serif", color: danger ? '#e05c2a' : '#d4c4a0' }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function MiniBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      className="flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded text-[.56rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
      style={{ color: '#d4c4a0' }}
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}

function SmallBtn({ children, red, onClick }: { children: React.ReactNode; red?: boolean; onClick: () => void }) {
  return (
    <button
      className="mt-1 w-full cursor-pointer rounded border p-1 text-[.64rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.18)]"
      style={{ fontFamily: "'Cinzel',serif", borderColor: red ? 'rgba(224,92,42,.3)' : 'rgba(200,150,62,.2)', color: red ? '#e05c2a' : '#c8963e', background: 'rgba(200,150,62,.07)' }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
