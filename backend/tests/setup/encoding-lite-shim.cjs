module.exports = {
  encode: (text) => Buffer.from(text),
  decode: (buffer) => buffer.toString(),
};
