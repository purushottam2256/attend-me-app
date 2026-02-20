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
            '@types': './src/types',
            '@styles': './src/styles',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
