'use client';

type ToolName = 'reveal' | 'hide' | 'box' | 'select' | 'ping' | 'measure' | 'camera';

const BRUSH_SIZES = [
  { radius: 15, dotSize: 8, key: '1' },
  { radius: 36, dotSize: 13, key: '2' },
  { radius: 70, dotSize: 19, key: '3' },
  { radius: 130, dotSize: 26, key: '4' },
];

interface ToolbarProps {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  brushRadius: number;
  onBrushChange: (radius: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onResetFog: () => void;
  onGridRightClick?: (e: React.MouseEvent) => void;
  snapToGrid?: boolean;
  onSnapToGridToggle?: () => void;
}

export default function Toolbar({
  activeTool,
  onToolChange,
  brushRadius,
  onBrushChange,
  showGrid,
  onToggleGrid,
  onResetFog,
  onGridRightClick,
}: ToolbarProps) {
  return (
    <div
      className="flex w-[62px] flex-shrink-0 flex-col items-center gap-px py-1.5"
      style={{
        background: '#100f18',
        borderRight: '1px solid rgba(200,150,62,.2)',
      }}
    >
      {/* Fog group */}
      <ToolGroup label="Fog">
        <ToolBtn
          icon={<EyeIcon />}
          label="Reveal"
          kbd="R"
          active={activeTool === 'reveal'}
          onClick={() => onToolChange('reveal')}
        />
        <ToolBtn
          icon={<EyeOffIcon />}
          label="Hide"
          kbd="H"
          active={activeTool === 'hide'}
          onClick={() => onToolChange('hide')}
        />
        <ToolBtn
          icon={<ResetIcon />}
          label="Reset"
          active={false}
          onClick={onResetFog}
        />
      </ToolGroup>

      {/* Brush size group */}
      <ToolGroup label="Size">
        <div className="flex flex-col items-center gap-1">
          {BRUSH_SIZES.map((b) => (
            <div
              key={b.radius}
              className="flex items-center justify-center cursor-pointer"
              onClick={() => onBrushChange(b.radius)}
              title={`Brush size ${b.key} (Key: ${b.key})`}
            >
              <div
                className="flex-shrink-0 rounded-full transition-all"
                style={{
                  width: b.dotSize,
                  height: b.dotSize,
                  background: brushRadius === b.radius ? '#c8963e' : '#d4c4a0',
                  opacity: brushRadius === b.radius ? 1 : 0.3,
                  border: brushRadius === b.radius ? '1.5px solid #c8963e' : '1.5px solid transparent',
                }}
              />
            </div>
          ))}
        </div>
      </ToolGroup>

      {/* Boxes group */}
      <ToolGroup label="Boxes">
        <ToolBtn
          icon={<BoxIcon />}
          label="Draw"
          kbd="B"
          active={activeTool === 'box'}
          onClick={() => onToolChange('box')}
        />
        <ToolBtn
          icon={<SelectIcon />}
          label="Select"
          kbd="S"
          active={activeTool === 'select'}
          onClick={() => onToolChange('select')}
        />
      </ToolGroup>

      {/* Tools group */}
      <ToolGroup label="Tools">
        <ToolBtn
          icon={<PingIcon />}
          label="Ping"
          kbd="P"
          active={activeTool === 'ping'}
          onClick={() => onToolChange('ping')}
        />
      </ToolGroup>

      {/* View group */}
      <ToolGroup label="View">
        <ToolBtn
          icon={<CameraIcon />}
          label="Camera"
          kbd="C"
          active={activeTool === 'camera'}
          onClick={() => onToolChange('camera')}
        />
        <ToolBtn
          icon={<RulerIcon />}
          label="Ruler"
          kbd="M"
          active={activeTool === 'measure'}
          onClick={() => onToolChange('measure')}
        />
        <ToolBtn
          icon={<GridIcon />}
          label="Grid"
          kbd="G"
          active={showGrid}
          onClick={onToggleGrid}
          onContextMenu={onGridRightClick ? (e) => { e.preventDefault(); onGridRightClick(e); } : undefined}
        />
      </ToolGroup>
    </div>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex w-full flex-col items-center gap-0.5 py-1.5"
      style={{ borderBottom: '1px solid rgba(200,150,62,.2)' }}
    >
      <div
        className="text-[.5rem] font-semibold uppercase tracking-[.1em]"
        style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ToolBtn({
  icon,
  label,
  kbd,
  active,
  onClick,
  onContextMenu,
}: {
  icon: React.ReactNode;
  label: string;
  kbd?: string;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className="relative flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-px rounded transition-all"
      style={{
        border: active ? '1px solid #c8963e' : '1px solid transparent',
        background: active ? 'rgba(200,150,62,.15)' : 'transparent',
        color: active ? '#c8963e' : '#d4c4a0',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={kbd ? `${label} (${kbd})` : label}
    >
      {icon}
      <span
        className="text-[.5rem] tracking-[.04em]"
        style={{ fontFamily: "'Cinzel',serif", opacity: 0.8 }}
      >
        {label}
      </span>
    </button>
  );
}

/* ── SVG Icons ── */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  className: 'w-5 h-5',
};

function EyeIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...svgProps}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 3l7 19 3-7 7-3L3 3z" />
    </svg>
  );
}

function PingIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg {...svgProps}>
      <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...svgProps}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="6" y="8" width="12" height="8" rx="1" strokeDasharray="2 2" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
