import { useState } from 'react';

export default function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="section-label"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          background: 'none', border: 'none', padding: 0, font: 'inherit', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
        {title}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}
