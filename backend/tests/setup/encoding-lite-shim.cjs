const util = require("util");

module.exports = {
  TextDecoder: util.TextDecoder,
  TextEncoder: util.TextEncoder,
  TextDecoderStream: globalThis.TextDecoderStream,
  TextEncoderStream: globalThis.TextEncoderStream,
  normalizeEncoding: (enc) => enc,
  getBOMEncoding: () => null,
  labelToName: (label) => label,
  legacyHookDecode: () => null,
  isomorphicDecode: (input) => Buffer.from(input).toString("binary"),
  isomorphicEncode: (input) => Buffer.from(input, "binary"),
};
