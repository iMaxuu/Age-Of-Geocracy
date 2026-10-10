import React, { createElement, useEffect, useMemo, useState } from 'react';
import layouts from './layouts.json';
import { pageCssFiles } from './css-map';
import './legacy-fixes.css';

type LegacyNode = string | {
  tag: string;
  props?: Record<string, unknown>;
  children?: LegacyNode[];
};

const originalCSS = import.meta.glob('./styles/*.css', { query: '?raw', import: 'default' });
const TITLE: Record<string, string> = {
  home: 'INICIO', map: 'MAPA', nation: 'NACIÓN', region: 'REGIÓN',
  territory: 'TERRITORIO', party: 'PARTIDO', coalition: 'COALICIÓN',
  nationalparliament: 'PARLAMENTO NACIONAL', regionalparliament: 'PARLAMENTO REGIONAL',
  election: 'ELECCIONES', news: 'NOTICIAS', work: 'TRABAJO', storage: 'ALMACÉN',
  war: 'GUERRA', wars: 'GUERRAS', market: 'MERCADO',
  messages: 'MENSAJES', shop: 'TIENDA', config: 'CONFIGURACIÓN',
};

function normalizedProps(raw: Record<string, unknown>, key: string) {
  const attrs: Record<string, unknown> = { ...raw, key };
  if (typeof attrs.dataLegacyStyle === 'string') {
    const style: Record<string, string> = {};
    for (const statement of attrs.dataLegacyStyle.split(';')) {
      const colon = statement.indexOf(':');
      if (colon < 0) continue;
      const prop = statement.slice(0, colon).trim();
      const val = statement.slice(colon + 1).trim();
      if (prop && val) {
        const name = prop.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        style[name] = val;
      }
    }
    attrs.style = style;
    delete attrs.dataLegacyStyle;
  }
  if (attrs.hidden === true && ['territory-root', 'tp-independent', 'rp-layout','np-layout'].includes(String(attrs.id))) {
    delete attrs.hidden;
  }
  if (attrs.href === '#') attrs.href = undefined;
  // Visual-only controls: don't submit forms or accidentally invoke old JS commands.
  if (attrs.type === 'submit') attrs.type = 'button';
  if (attrs.disabled === '') attrs.disabled = true;
  if (attrs.checked === '') attrs.defaultChecked = true;
  if (typeof attrs.defaultValue === 'string' && attrs.defaultValue.length === 0) attrs.defaultValue = '';
  return attrs;
}

function renderNode(node: LegacyNode, path: string): React.ReactNode {
  if (typeof node === 'string') return node;
  const { tag, props = {}, children = [] } = node;
  const attrs = normalizedProps(props, path);
  const safe = tag === 'input' || tag === 'img' || tag === 'hr' || tag === 'br' || tag === 'source';
  return createElement(tag, attrs, ...(safe ? [] : children.map((child, i) => renderNode(child, `${path}.${i}`))));
}

function LayoutFallback({page}: {page:string}) {
  const title=TITLE[page] || page.toUpperCase();
  return (
    <main className="aog-legacy-empty" role="main">
      <h1>{title}</h1>
      <p>Esta sección todavía no tenía interfaz desarrollada en la versión anterior.</p>
    </main>
  );
}

function EmptyState({title}: {title:string}) {
  return <div className="aog-design-empty">{title}<small>Interfaz migrada · Falta conectar la lógica al servidor</small></div>;
}

export function LegacyVisualPage({page}: {page: string}) {
  const [css, setCss] = useState<string>('');
  const dom = (layouts as Record<string, LegacyNode[]>)[page] || [];
  const cssFiles = (pageCssFiles[page] || []);
  const cssKey = cssFiles.join('|');

  useEffect(() => {
    document.body.dataset.page = page === 'wars' ? 'war' : page;
    document.documentElement.style.setProperty('--header-height', '120px');
    return () => {
      delete document.body.dataset.page;
      document.documentElement.style.removeProperty('--header-height');
    };
  }, [page]);

  useEffect(() => {
    let active=true;
    setCss('');
    Promise.all(cssFiles.map(async (file) => {
      const loader = originalCSS[`./styles/${file}.css`];
      if (!loader) return '';
      const loaded = await loader();
      return String(loaded);
    })).then((items) => {if(active)setCss(items.join('\n'));});
    return () => {active=false;};
  }, [cssKey]);

  const nodes = useMemo(() => dom.map((node, idx) => renderNode(node, `${page}:${idx}`)), [dom,page]);
  const isBlank = ['messages','shop','config','market'].includes(page);

  return <>
    {css && <style data-aog-legacy-css={page}>{css}</style>}
    <div className="aog-legacy-root" data-legacy-screen={page}>
      {isBlank ? <LayoutFallback page={page} /> : nodes}
    </div>
  </>;
}

export const LegacyPageNames = TITLE;
