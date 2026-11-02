import '@testing-library/jest-dom/vitest'

// jsdom não implementa estas APIs (usadas por recharts e pelos diálogos).
class RO { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
window.scrollTo = () => {}
