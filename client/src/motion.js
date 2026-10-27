let currentAnimation;

export function animatePage({ subtle = false } = {}) {
  currentAnimation?.cancel();
  const content = document.getElementById('content');
  if (!content?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  currentAnimation = content.animate([
    { opacity: subtle ? 0.55 : 0, transform: 'translateY(6px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: subtle ? 230 : 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
  return currentAnimation;
}
