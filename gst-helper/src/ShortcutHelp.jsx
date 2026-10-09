import { useEffect, useRef } from 'react';

const shortcuts = [
  ['Ctrl + N / Alt + N', 'Add a new client'],
  ['Alt + D', 'Open dashboard'], ['Alt + C', 'Open client list'],
  ['Alt + F', 'Focus client search'], ['Alt + S', 'Save the client form'],
  ['Alt + G', 'Generate JSON in the client screen'], ['Alt + J', 'Download generated JSON'],
  ['F1', 'Open keyboard help'], ['Esc', 'Close help or the client form; otherwise go back outside form fields'],
  ['Backspace', 'Go back outside form fields'],
  ['↑ ↓ ← →', 'Move between table cells, or upload and action controls'],
  ['Enter', 'Open the selected client, upload a file, or activate a button'],
  ['Space', 'Activate a focused upload control or button'],
  ['Home / End', 'First or last cell in the current table row'],
  ['Ctrl + Home / End', 'First or last table cell'],
  ['Tab / Shift + Tab', 'Move forward or backward between controls'],
];

export default function ShortcutHelp({ onNavigate }) {
  const dialog = useRef(null);
  useEffect(() => {
    const handle = event => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (dialog.current?.open) return;
      const key = event.key.toLowerCase();
      const newClient = (event.ctrlKey || event.metaKey || event.altKey) && !event.shiftKey && key === 'n';
      if (newClient) { event.preventDefault(); onNavigate({ screen: 'clients', newClient: true }); return; }
      if (event.key === 'F1') { event.preventDefault(); dialog.current.showModal(); return; }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (key === 'd' || key === 'c') {
        event.preventDefault(); onNavigate({ screen: key === 'd' ? 'dashboard' : 'clients' });
      } else if (key === 'f') {
        const search = document.querySelector('.client-search input');
        if (search) { event.preventDefault(); search.focus(); }
      } else if (key === 's') {
        const form = document.querySelector('.client-form');
        if (form) { event.preventDefault(); form.requestSubmit(); }
      } else if (key === 'g' || key === 'j') {
        const button = document.querySelector(`[data-shortcut="${key}"]`);
        if (button) { event.preventDefault(); if (!button.disabled) button.click(); }
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [onNavigate]);
  return <>
    <aside className="help-bar" aria-label="Keyboard shortcuts">
      <span><kbd>↑ ↓</kbd> Navigate <span className="help-extra">· <kbd>Enter</kbd> Open · <kbd>Alt N</kbd> New client</span></span>
      <button onClick={() => dialog.current.showModal()}>Keyboard help <kbd>F1</kbd></button>
    </aside>
    <dialog className="shortcut-dialog" ref={dialog} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.current.close(); }
    }}>
      <div className="client-toolbar"><h2>Keyboard shortcuts</h2><button className="btn btn-secondary" autoFocus onClick={() => dialog.current.close()}>Close</button></div>
      <p className="client-storage-note">Ctrl+N may be reserved by Chrome. Use Alt+N if Chrome opens a new window.</p>
      <dl>{shortcuts.map(([keys, description]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl>
    </dialog>
  </>;
}
