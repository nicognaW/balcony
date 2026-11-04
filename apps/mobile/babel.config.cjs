module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    // oRPC's server and contract builds (the playground's in-process server)
    // destructure rest parameters (`...[input, options]`), which Hermes
    // can't parse; babel-preset-expo leaves parameters alone.
    overrides: [
      {
        plugins: ["@babel/plugin-transform-parameters"],
        // A function: Metro also asks for a config with no file name.
        test: (filename) =>
          filename !== undefined &&
          /node_modules[\\/]@orpc[\\/]/u.test(filename),
      },
    ],
    presets: ["babel-preset-expo"],
  };
};
