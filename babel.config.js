/**
 * Babel configuration used by Metro to compile the app.
 * Uses Expo's preset (JSX, modern JS, React Native transforms). The config
 * is cached because it never changes between builds.
 */
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
