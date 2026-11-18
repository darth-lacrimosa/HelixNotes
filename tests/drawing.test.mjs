import assert from 'node:assert/strict';
import test from 'node:test';
import { excalidrawLanguage, isDrawMessage, isDrawingHref, newDrawingName, svgToBytes } from '../src/lib/draw/drawing.ts';

test('only .excalidraw.svg destinations are editable drawings', () => {
  for (const href of ['a.excalidraw.svg', '.helixnotes/attachments/uuid_drawing-1.excalidraw.svg', 'x/Y.EXCALIDRAW.SVG', 'a.excalidraw.svg?v=3', 'a.excalidraw.svg#top'])
    assert.equal(isDrawingHref(href), true, href);
  for (const href of ['a.svg', 'a.png', 'excalidraw.svg', 'a.excalidraw', 'a.excalidraw.svg.png', 'https://x/y.excalidraw.svg.exe', ''])
    assert.equal(isDrawingHref(href), false, href);
});

test('a new drawing gets a sortable, readable name', () => {
  assert.equal(newDrawingName(new Date(2026, 10, 19, 9, 5)), 'drawing-2026-11-19-0905.excalidraw.svg');
  assert.equal(newDrawingName(new Date(2026, 0, 2, 23, 59)), 'drawing-2026-01-02-2359.excalidraw.svg');
});

test('svg text round-trips to bytes, including non-ASCII', () => {
  const svg = '<svg>é – 日本</svg>';
  assert.equal(new TextDecoder().decode(Uint8Array.from(svgToBytes(svg))), svg);
});

test('app languages map to Excalidraw languages, falling back to English', () => {
  assert.equal(excalidrawLanguage('de'), 'de-DE');
  assert.equal(excalidrawLanguage('pt-BR'), 'pt-BR');
  assert.equal(excalidrawLanguage('ru'), 'ru-RU');
  assert.equal(excalidrawLanguage('en'), 'en');
  assert.equal(excalidrawLanguage('xx'), 'en');
  assert.equal(excalidrawLanguage(null), 'en');
});

test('canvas messages are validated by shape', () => {
  for (const message of [
    { type: 'helix-draw-ready' },
    { type: 'helix-draw-shown' },
    { type: 'helix-draw-init', svg: null, dark: true, language: 'en' },
    { type: 'helix-draw-init', svg: '<svg/>', dark: false, language: 'de' },
    { type: 'helix-draw-export', id: 1 },
    { type: 'helix-draw-exported', id: 1, svg: '<svg/>', empty: false },
    { type: 'helix-draw-error', id: 2, message: 'boom' },
    { type: 'helix-draw-dirty', dirty: true },
  ]) assert.equal(isDrawMessage(message), true, JSON.stringify(message));
  for (const value of [null, 'x', {}, { type: 'other' }, { type: 'helix-draw-init', svg: 3, dark: true, language: 'en' },
    { type: 'helix-draw-export' }, { type: 'helix-draw-exported', id: 1, svg: '<svg/>' }, { type: 'helix-draw-dirty', dirty: 'yes' }])
    assert.equal(isDrawMessage(value), false, JSON.stringify(value));
});
