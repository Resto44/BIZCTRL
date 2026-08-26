import { describe, expect, it } from 'vitest';
import { resolveTextNodeSource } from '../src/lib/useDocumentLocalization.js';

describe('document localization dynamic text handling', () => {
  it('adopts a React-rendered dynamic value instead of restoring the first localized value', () => {
    const textSources = new WeakMap();
    const node = {};
    const translateLiteral = (value) => value;

    const initialSource = resolveTextNodeSource({
      textSources,
      node,
      current: '0.00',
      lang: 'ar',
      translateLiteral,
    });
    expect(initialSource).toBe('0.00');

    const updatedSource = resolveTextNodeSource({
      textSources,
      node,
      current: '250.00',
      lang: 'ar',
      translateLiteral,
    });
    expect(updatedSource).toBe('250.00');
    expect(textSources.get(node)).toBe('250.00');
  });

  it('keeps the original source when the observed value is its expected translation', () => {
    const textSources = new WeakMap();
    const node = {};
    const translateLiteral = (value) => value === 'Subtotal' ? 'المجموع الفرعي' : value;

    resolveTextNodeSource({
      textSources,
      node,
      current: 'Subtotal',
      lang: 'ar',
      translateLiteral,
    });

    const source = resolveTextNodeSource({
      textSources,
      node,
      current: 'المجموع الفرعي',
      lang: 'ar',
      translateLiteral,
    });
    expect(source).toBe('Subtotal');
  });
});
