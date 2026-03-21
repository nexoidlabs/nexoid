import '@craftzdog/react-native-buffer';
import 'react-native-get-random-values';

// @ts-ignore
global.Buffer = global.Buffer || require('@craftzdog/react-native-buffer').Buffer;
// @ts-ignore
global.process = global.process || {};
// @ts-ignore
global.process.env = global.process.env || {};
// @ts-ignore
global.process.version = 'v16.0.0'; // Some libs check for process.version

// Polyfill for AbortSignal.timeout (not available in React Native)
// This API was added in Node.js 17.3.0 and modern browsers, but React Native doesn't support it
if (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined') {
  // @ts-ignore
  if (!AbortSignal.timeout) {
    // @ts-ignore
    AbortSignal.timeout = function(ms: number): AbortSignal {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, ms);
      
      // Clean up timeout if signal is already aborted
      if (controller.signal.aborted) {
        clearTimeout(timeoutId);
      } else {
        // Ensure timeout is cleared when signal is aborted
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        }, { once: true });
      }
      
      return controller.signal;
    };
  }
}

