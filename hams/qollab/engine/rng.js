/**
 * rng.js - Seeded pseudo-random number generator
 * 
 * Uses a simple xorshift128+ algorithm for reproducible random schedules
 * in the search tool and level generation.
 * 
 * No crypto, no external deps.
 */

/**
 * Create a seeded PRNG (xorshift128+).
 * @param {number} seed
 * @returns {{next: () => number, nextInt: (max: number) => number, shuffle: (arr: any[]) => any[]}}
 */
export function createRNG(seed) {
  // Initialize state from seed using splitmix64-like seeder
  let s0 = seed >>> 0;
  let s1 = (seed * 1664525 + 1013904223) >>> 0;
  
  // Warm up
  for (let i = 0; i < 20; i++) {
    s1 ^= s0;
    s0 = ((s0 << 23) | (s0 >>> 9)) ^ s1 ^ (s1 << 17);
    s1 = (s1 << 5) | (s1 >>> 27);
  }
  
  function nextU32() {
    s1 ^= s0;
    s0 = ((s0 << 23) | (s0 >>> 9)) ^ s1 ^ (s1 << 17);
    s1 = (s1 << 5) | (s1 >>> 27);
    return (s0 + s1) >>> 0;
  }
  
  return {
    /** Returns a float in [0, 1). */
    next() {
      return nextU32() / 4294967296;
    },
    
    /** Returns an integer in [0, max). */
    nextInt(max) {
      return nextU32() % max;
    },
    
    /** Fisher-Yates shuffle in-place, returns the array. */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = nextU32() % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    
    /** Pick a random element from an array. */
    pick(arr) {
      return arr[nextU32() % arr.length];
    },
  };
}
