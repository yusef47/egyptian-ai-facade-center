"use client";

import { createElement, useEffect, useState, type ElementType, type ReactNode, type SVGProps } from "react";

/**
 * Renders serialized SVG markup WITHOUT dangerouslySetInnerHTML.
 *
 * The markup (produced by lib/architect/export-plan.ts) is parsed with
 * DOMParser and re-emitted as React elements. Attributes are copied
 * verbatim from the parsed tree — keys/roles/className are overwritten —
 * so neither markup nor script can smuggle through an innerHTML path.
 */

function parseSvgRoot(source: string): Element | null {
  if (typeof DOMParser === "undefined" || source === "") return null;
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName === "parsererror" || root.localName !== "svg") return null;
  return root;
}

/**
 * SVG presentation attributes are kebab-case in XML but must be camelCase
 * React props (stroke-width -> strokeWidth). aria-, data-, and namespaced
 * attributes (xlink:href) stay verbatim.
 */
function toReactAttributeName(name: string): string {
  if (name.startsWith("aria-") || name.startsWith("data-") || name.includes(":")) return name;
  return name.replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function attributesToProps(element: Element): Record<string, string> {
  const props: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    props[toReactAttributeName(attribute.name)] = attribute.value;
  }
  return props;
}

function elementToReact(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === 3 /* TEXT_NODE */) return node.textContent ?? "";
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return null;
  const element = node as Element;
  const children = Array.from(element.childNodes).map((child, index) =>
    elementToReact(child, `${key}.${index}`),
  );
  // Deliberate cast: this is the DOM -> React attribute bridge. Attributes
  // are copied from the parsed SVG; key/role/className are overwritten below.
  const props = { ...attributesToProps(element), key } as SVGProps<SVGSVGElement>;
  return createElement(element.tagName as ElementType, props, ...children);
}

export function InlineSvg({ source, label }: { source: string; label: string }) {
  const [root, setRoot] = useState<Element | null>(null);
  // Parsing needs the DOM; render a neutral placeholder until mounted so the
  // server and first client render agree (no hydration mismatch).
  useEffect(() => {
    setRoot(parseSvgRoot(source));
  }, [source]);

  if (!root) {
    return <div aria-hidden="true" className="min-h-40 rounded-lg bg-slate-100" />;
  }
  const children = Array.from(root.childNodes).map((child, index) =>
    elementToReact(child, String(index)),
  );
  const rootProps = {
    ...attributesToProps(root),
    role: "img",
    "aria-label": label,
    className: "block h-[350px] w-full sm:h-[min(55vh,520px)]",
  } as SVGProps<SVGSVGElement>;
  return createElement("svg", rootProps, ...children);
}
