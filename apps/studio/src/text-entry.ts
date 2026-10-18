// Source: DataViz packages/web/src/text-entry.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft.

/** Inputs that take no typed text: a shortcut pressed while one has focus is meant for the page. */
const NOT_TEXT = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
]);

/** Whether keys typed into `target` are text: shortcuts and the table's copy and paste leave them alone. */
export const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    (target instanceof HTMLInputElement && !NOT_TEXT.has(target.type)));
