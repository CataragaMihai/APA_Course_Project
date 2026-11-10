import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Progressive loading (Mihai 2026-11-05): mounts its (lazy) children only once the section is within
 * `margin` of the viewport, so a visitor at the top never downloads what sits at the bottom. Until then,
 * and while the chunk loads, a skeleton block holds the space.
 */
export default function Near({ children, minHeight, margin = "600px" }: { children: ReactNode; minHeight: number; margin?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  const skel = <div className="skel-block" style={{ minHeight }} aria-busy="true" />;
  return <div ref={box}>{near ? <Suspense fallback={skel}>{children}</Suspense> : skel}</div>;
}
