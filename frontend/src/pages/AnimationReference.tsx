import { useRef } from 'react';
import { useReveal } from '../hooks/useReveal';
import { useTilt } from '../hooks/useTilt';

const FEELING_GUIDE = [
  { feeling: 'Dramatic / Cinematic', animations: 'Slow fade-ins (1–1.5s), large scale transitions (0.9→1), parallax', cues: 'Dark backgrounds, spotlight effects, full-bleed images' },
  { feeling: 'Techy / Futuristic', animations: 'Neon glow (box-shadow), glitch/scramble text, grid reveals', cues: 'Particle systems, grid patterns, monospace, cyan/magenta/electric blue' },
  { feeling: 'Playful / Friendly', animations: 'Bouncy easing (spring), floating/bobbing', cues: 'Rounded corners, pastel/bright colors, hand-drawn elements' },
  { feeling: 'Professional / Corporate', animations: 'Subtle fast (200–300ms), clean slides', cues: 'Navy/slate/charcoal, precise spacing, data viz focus' },
  { feeling: 'Calm / Minimal', animations: 'Very slow subtle motion, gentle fades', cues: 'High whitespace, muted palette, serif typography' },
  { feeling: 'Editorial / Magazine', animations: 'Staggered text reveals, image–text interplay', cues: 'Strong type hierarchy, pull quotes, grid-breaking layouts' },
] as const;

export default function AnimationReference() {
  const sectionRef = useRef<HTMLElement>(null);
  const tiltCardRef = useRef<HTMLDivElement>(null);

  useReveal(sectionRef);
  useTilt(tiltCardRef, { maxDeg: 8 });

  return (
    <section ref={sectionRef} className="view animation-reference" id="view-animation-reference">
      <h2>Animation Patterns Reference</h2>
      <p className="subtitle">
        Match animations to the intended feeling. Use these classes and hooks across the app.
      </p>

      <div className="card reveal">
        <h3>Effect-to-Feeling Guide</h3>
        <div className="overflow-x">
          <table className="data-table">
            <thead>
              <tr>
                <th>Feeling</th>
                <th>Animations</th>
                <th>Visual Cues</th>
              </tr>
            </thead>
            <tbody>
              {FEELING_GUIDE.map((row) => (
                <tr key={row.feeling}>
                  <td><strong>{row.feeling}</strong></td>
                  <td>{row.animations}</td>
                  <td>{row.cues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="reveal">Entrance animations</h3>
      <p className="subtitle muted reveal">
        Add <code>.reveal</code>, <code>.reveal-scale</code>, <code>.reveal-left</code>, or <code>.reveal-blur</code> to elements. Use <code>useReveal(ref)</code> on a parent and add <code>.visible</code> when in view (or toggle <code>.visible</code> yourself).
      </p>
      <div className="animation-demos">
        <div className="card reveal">Fade + slide up (<code>.reveal</code>)</div>
        <div className="card reveal-scale">Scale in (<code>.reveal-scale</code>)</div>
        <div className="card reveal-left">Slide from left (<code>.reveal-left</code>)</div>
        <div className="card reveal-blur">Blur in (<code>.reveal-blur</code>)</div>
      </div>

      <h3 className="reveal">Background effects</h3>
      <div className="animation-demos">
        <div className="card gradient-bg reveal" style={{ minHeight: 100 }}>Gradient mesh (<code>.gradient-bg</code>)</div>
        <div className="card grid-bg reveal" style={{ minHeight: 100 }}>Grid pattern (<code>.grid-bg</code>)</div>
      </div>

      <h3 className="reveal">Interactive: 3D tilt</h3>
      <p className="subtitle muted reveal">
        Use <code>useTilt(ref)</code> on a card or panel for depth on hover.
      </p>
      <div ref={tiltCardRef} className="card tilt-demo reveal">
        <strong>Hover me</strong> — 3D tilt effect
      </div>

      <div className="card reveal">
        <h3>Troubleshooting</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Problem</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Fonts not loading</td><td>Check font URL and names in CSS</td></tr>
            <tr><td>Animations not triggering</td><td>Verify Intersection Observer; ensure <code>.visible</code> is added</td></tr>
            <tr><td>Scroll snap not working</td><td><code>scroll-snap-type: y mandatory</code> on container; <code>scroll-snap-align: start</code> on slides</td></tr>
            <tr><td>Mobile issues</td><td>Disable heavy effects at 768px; reduce particle count</td></tr>
            <tr><td>Performance</td><td>Use <code>will-change</code> sparingly; prefer <code>transform</code>/<code>opacity</code></td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
