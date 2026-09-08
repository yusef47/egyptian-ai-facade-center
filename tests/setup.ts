import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no IntersectionObserver; Framer Motion's whileInView needs it.
class IntersectionObserverStub {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  disconnect(): void {}
  observe(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(): void {}
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

afterEach(() => {
  cleanup();
});
