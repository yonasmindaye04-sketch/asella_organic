module.exports = {
  sanitize: (input) => {
    if (typeof input !== "string") return input;
    return input.replace(/<[^>]*>/g, "");
  },
  default: {
    sanitize: (input) => {
      if (typeof input !== "string") return input;
      return input.replace(/<[^>]*>/g, "");
    },
  },
};
