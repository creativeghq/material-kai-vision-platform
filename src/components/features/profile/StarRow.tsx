/** Five stars, filled to a rating. One implementation — the profile's own reviews and the Google
 *  block both render it, and two copies would be two slightly different ambers. */
import React from 'react';
import { Star } from 'lucide-react';

export const StarRow: React.FC<{ rating: number; size?: 'sm' | 'lg' }> = ({ rating, size = 'sm' }) => {
  const px = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          // A pair, not one shade: amber-400 is chosen for plum-black and washes out on the light
          // themes' cream. Written out in full so Tailwind's source scanner emits both.
          className={`${px} ${i <= Math.round(rating)
            ? 'text-amber-600 fill-amber-600 dark:text-amber-400 dark:fill-amber-400'
            : 'text-muted-foreground/30 fill-muted-foreground/10'}`}
        />
      ))}
    </span>
  );
};
