module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@assets': './assets',
            '@features': './src/features',
            '@navigation': './src/navigation',
            '@components': './src/components',
            '@services': './src/services',
            '@utils': './src/utils',
            '@contexts': './src/contexts',
            '@constants': './src/constants',
            '@hooks': './src/hooks',
            '@config': './src/config',
            '@shared': './src/shared',
            '@store': './src/store',
            '@types': './src/types',
            '@styles': './src/styles',
          },
        },
      ],
      'react-native-reanimated/plugin',
      // #4 Audit: Strip console.* calls in production builds for performance + security
      ...(process.env.NODE_ENV === 'production' ? ['transform-remove-console'] : []),
    ],
  };
};
