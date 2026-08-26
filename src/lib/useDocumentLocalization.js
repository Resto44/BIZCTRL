import { useEffect, useRef } from 'react';

const TEXT_NODE = typeof Node === 'undefined' ? 3 : Node.TEXT_NODE;
const ELEMENT_NODE = typeof Node === 'undefined' ? 1 : Node.ELEMENT_NODE;
const LOCALIZABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'value'];

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  return `${leading}${translated}${trailing}`;
}

// React may replace a text node in place when a dynamic value changes. Preserve
// the original source only while the node still contains its expected localized
// value; otherwise adopt the newly rendered value as the source before applying
// localization. This keeps reactive totals from being reset to their first value.
export function resolveTextNodeSource({ textSources, node, current, lang, translateLiteral }) {
  const cachedSource = textSources.get(node);
  if (cachedSource === undefined) {
    textSources.set(node, current);
    return current;
  }

  const expectedLocalizedValue = preserveWhitespace(
    cachedSource,
    lang === 'en' ? cachedSource : translateLiteral(cachedSource),
  );

  if (current !== expectedLocalizedValue) {
    textSources.set(node, current);
    return current;
  }

  return cachedSource;
}

function canTranslateTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  const tag = parent.tagName?.toLowerCase();
  if (['script', 'style', 'code', 'pre', 'textarea', 'option'].includes(tag)) return false;
  if (parent.closest?.('[data-i18n-skip="true"]')) return false;
  return true;
}

function canTranslateAttribute(element, name) {
  if (element.closest?.('[data-i18n-skip="true"]')) return false;
  if (name === 'value' && !['button', 'submit', 'reset'].includes(element.type)) return false;
  return true;
}

export function useDocumentLocalization({ lang, translateLiteral }) {
  const textSources = useRef(new WeakMap());
  const attributeSources = useRef(new WeakMap());

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    let applying = false;

    const localizeTextNode = (node) => {
      if (!node || node.nodeType !== TEXT_NODE || !canTranslateTextNode(node)) return;
      const current = node.nodeValue || '';
      const source = resolveTextNodeSource({
        textSources: textSources.current,
        node,
        current,
        lang,
        translateLiteral,
      });
      const translated = lang === 'en' ? source : translateLiteral(source);
      const next = preserveWhitespace(source, translated);
      if (node.nodeValue !== next) node.nodeValue = next;
    };

    const localizeAttribute = (element, name) => {
      if (!element?.hasAttribute?.(name) || !canTranslateAttribute(element, name)) return;
      let attributes = attributeSources.current.get(element);
      if (!attributes) {
        attributes = new Map();
        attributeSources.current.set(element, attributes);
      }
      if (!attributes.has(name)) attributes.set(name, element.getAttribute(name) || '');
      const source = attributes.get(name);
      const translated = lang === 'en' ? source : translateLiteral(source);
      if (element.getAttribute(name) !== translated) element.setAttribute(name, translated);
    };

    const localizeElement = (element) => {
      if (!element || element.nodeType !== ELEMENT_NODE || element.closest?.('[data-i18n-skip="true"]')) return;
      LOCALIZABLE_ATTRIBUTES.forEach((name) => localizeAttribute(element, name));
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) localizeTextNode(node);
    };

    const localizeNode = (node) => {
      if (!node) return;
      if (node.nodeType === TEXT_NODE) localizeTextNode(node);
      else if (node.nodeType === ELEMENT_NODE) localizeElement(node);
      else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        node.childNodes.forEach(localizeNode);
      }
    };

    const applyLocalization = () => {
      applying = true;
      localizeElement(document.body);
      applying = false;
    };

    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      applying = true;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') localizeTextNode(mutation.target);
        if (mutation.type === 'attributes' && LOCALIZABLE_ATTRIBUTES.includes(mutation.attributeName)) {
          localizeAttribute(mutation.target, mutation.attributeName);
        }
        mutation.addedNodes.forEach(localizeNode);
      }
      applying = false;
    });

    applyLocalization();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: LOCALIZABLE_ATTRIBUTES,
    });

    return () => observer.disconnect();
  }, [lang, translateLiteral]);
}

export default useDocumentLocalization;
