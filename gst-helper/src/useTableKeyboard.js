import { useEffect } from 'react';

// Keep native inputs/buttons usable while providing a single Tab stop per table.
export default function useTableKeyboard() {
  useEffect(() => {
    const root = document.getElementById('root');
    const cellSelector = '.data-table th, .data-table td';
    const initializedScreens = new WeakSet();
    const workflowControls = main => [...main.querySelectorAll(
      '.upload-box[aria-disabled="false"], .actions-row button:not(:disabled), .ref-row button:not(:disabled)'
    )].filter(control => control.getClientRects().length > 0);
    const defaultControl = main => main.dataset.keyboardScreen === 'dashboard'
      ? main.querySelector('.data-table tbody .client-row td')
      : workflowControls(main)[0];
    const focusDefault = () => {
      const main = root.querySelector('[data-keyboard-screen]');
      if (!main) return;
      const target = defaultControl(main);
      if (!target) return;
      const active = document.activeElement;
      if (!initializedScreens.has(main) || active === document.body) {
        // Wait for saved uploads/rows to load, and avoid interrupting form entry.
        if (active?.matches('input, select, textarea') || active?.isContentEditable) return;
        initializedScreens.add(main);
        target.focus({ preventScroll: true });
      }
    };
    const initialize = () => {
      root.querySelectorAll('.data-table').forEach(table => {
        const cells = [...table.querySelectorAll('th, td')];
        let active = cells.find(cell => cell.tabIndex === 0);
        if (!active) active = table.querySelector('tbody td') || cells[0];
        cells.forEach(cell => {
          const desired = cell === active ? 0 : -1;
          if (cell.tabIndex !== desired) cell.tabIndex = desired;
        });
        table.setAttribute('aria-label', table.getAttribute('aria-label') ||
          'Data table. Use arrow keys to move between cells and Enter to activate.');
      });
      focusDefault();
    };
    const activate = (cell, focus = true) => {
      cell.closest('table').querySelectorAll('th, td').forEach(item => {
        item.tabIndex = item === cell ? 0 : -1;
      });
      if (focus) cell.focus();
    };
    const onFocus = event => {
      const cell = event.target.closest?.(cellSelector);
      if (cell) activate(cell, false);
    };
    const onKeyDown = event => {
      if (event.defaultPrevented || event.altKey || event.isComposing) return;
      const target = event.target;
      if (target.matches?.('input, select, textarea') || target.isContentEditable) return;
      const main = target.closest?.('[data-keyboard-screen]');
      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (main?.dataset.keyboardScreen === 'generator' && !target.closest('.data-table') && arrows.includes(event.key)) {
        if (event.ctrlKey || event.metaKey || event.shiftKey) return;
        const controls = workflowControls(main);
        const index = controls.indexOf(target.closest('.upload-box, button'));
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const next = controls[index < 0 ? 0 : Math.max(0, Math.min(controls.length - 1, index + direction))];
        if (next) { event.preventDefault(); next.focus(); }
        return;
      }
      const cell = event.target.closest?.(cellSelector);
      if (!cell) {
        if (main?.dataset.keyboardScreen === 'dashboard' && arrows.includes(event.key)) {
          const first = defaultControl(main);
          if (first) { event.preventDefault(); activate(first); }
        }
        return;
      }
      if (event.target !== cell && !arrows.includes(event.key)) return;
      const table = cell.closest('table');
      const rows = [...table.rows];
      const row = cell.parentElement;
      const rowIndex = rows.indexOf(row);
      const colIndex = cell.cellIndex;
      let next;
      switch (event.key) {
        case 'ArrowLeft': next = row.cells[Math.max(0, colIndex - 1)]; break;
        case 'ArrowRight': next = row.cells[Math.min(row.cells.length - 1, colIndex + 1)]; break;
        case 'ArrowUp': next = rows[Math.max(0, rowIndex - 1)]?.cells[colIndex]; break;
        case 'ArrowDown': next = rows[Math.min(rows.length - 1, rowIndex + 1)]?.cells[colIndex]; break;
        case 'Home': next = (event.ctrlKey || event.metaKey ? rows[0] : row).cells[0]; break;
        case 'End': {
          const last = event.ctrlKey || event.metaKey ? rows[rows.length - 1] : row;
          next = last.cells[last.cells.length - 1]; break;
        }
        case 'Enter': {
          const action = cell.querySelector('button:not(:disabled), a[href]');
          if (action) { event.preventDefault(); action.click(); }
          else if (row.classList.contains('client-row')) { event.preventDefault(); row.click(); }
          else { event.preventDefault(); next = rows[Math.min(rows.length - 1, rowIndex + 1)]?.cells[colIndex]; }
          break;
        }
        default: return;
      }
      if (next) {
        event.preventDefault(); activate(next);
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    initialize();
    const observer = new MutationObserver(initialize);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('focusin', onFocus);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
