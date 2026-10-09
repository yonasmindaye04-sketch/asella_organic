import {
  describe,
  it,
  expect,
} from "@jest/globals";
import {
  normalizeEthiopianMSISDN,
  tryNormalizeEthiopianMSISDN,
  formatEthiopianMSISDN,
  calculateSmsSegments,
  detectSmsEncoding,
  estimateSmsCostEtb,
  renderTemplate,
  GSM7_SINGLE,
  UCS2_SINGLE,
} from "../../src/lib/smsNormalize.js";

describe("normalizeEthiopianMSISDN", () => {
  it("accepts the international form unchanged", () => {
    expect(normalizeEthiopianMSISDN("251911234567")).toBe("251911234567");
  });

  it("converts a local Safaricom number to international", () => {
    expect(normalizeEthiopianMSISDN("0911234567")).toBe("251911234567");
  });

  it("converts a local Ethio Telecom number to international", () => {
    expect(normalizeEthiopianMSISDN("0711234567")).toBe("251711234567");
  });

  it("strips a leading plus", () => {
    expect(normalizeEthiopianMSISDN("+251911234567")).toBe("251911234567");
  });

  // The stored format that motivated this module: NewOrderPage joins a
  // country-code select to a national number with a space.
  it("handles the '+251 911 234 567' form the storefront actually stores", () => {
    expect(normalizeEthiopianMSISDN("+251 911 234 567")).toBe("251911234567");
  });

  it("strips spaces, dashes, dots and parentheses", () => {
    expect(normalizeEthiopianMSISDN("+251 (911) 234-567")).toBe("251911234567");
    expect(normalizeEthiopianMSISDN("0911 234 567")).toBe("251911234567");
    expect(normalizeEthiopianMSISDN("0711.234.567")).toBe("251711234567");
  });

  it("rejects a landline range", () => {
    expect(() => normalizeEthiopianMSISDN("251111234567")).toThrow(/Invalid/);
  });

  it("rejects wrong lengths", () => {
    expect(() => normalizeEthiopianMSISDN("091123456")).toThrow(/Invalid/);
    expect(() => normalizeEthiopianMSISDN("25191123456789")).toThrow(/Invalid/);
  });

  it("rejects an unsupported country prefix", () => {
    expect(() => normalizeEthiopianMSISDN("254712345678")).toThrow(/Invalid/);
    expect(() => normalizeEthiopianMSISDN("+12025550143")).toThrow(/Invalid/);
  });

  it("rejects empty input", () => {
    expect(() => normalizeEthiopianMSISDN("")).toThrow(/cannot be empty/);
    expect(() => normalizeEthiopianMSISDN("   ")).toThrow(/Invalid/);
  });

  it("does not accept letters or mixed junk", () => {
    expect(() => normalizeEthiopianMSISDN("0911CALLNOW")).toThrow(/Invalid/);
  });

  it("tryNormalize returns null instead of throwing", () => {
    expect(tryNormalizeEthiopianMSISDN("0911234567")).toBe("251911234567");
    expect(tryNormalizeEthiopianMSISDN("nonsense")).toBeNull();
  });

  it("normalizes idempotently", () => {
    const once = normalizeEthiopianMSISDN("+251 911 234 567");
    expect(normalizeEthiopianMSISDN(once)).toBe(once);
  });
});

describe("formatEthiopianMSISDN", () => {
  it("renders the national display form", () => {
    expect(formatEthiopianMSISDN("251911234567")).toBe("0911 234 567");
    expect(formatEthiopianMSISDN("251711234567")).toBe("0711 234 567");
  });

  it("passes through anything it cannot parse", () => {
    expect(formatEthiopianMSISDN("garbage")).toBe("garbage");
  });
});

describe("detectSmsEncoding", () => {
  it("classifies plain ASCII as GSM-7", () => {
    expect(detectSmsEncoding("Your order ORD-1234 is confirmed.")).toBe("GSM-7");
  });

  it("classifies Ethiopic script as UNICODE", () => {
    // Amharic is the case that matters: it forces UCS-2 and halves the
    // per-segment budget.
    expect(detectSmsEncoding("የአሰላ ኦርጋኒክ")).toBe("UNICODE");
  });

  it("classifies emoji as UNICODE", () => {
    expect(detectSmsEncoding("Thanks! 🎉")).toBe("UNICODE");
  });

  // The GSM 03.38 basic set contains a specific handful of accented Latin
  // characters (è é ù ì ò ñ ü à ä ö ...) but NOT others (ï, ë, ø-adjacent
  // cases). A naive /[^\x00-\x7F]/ test would call every one of them GSM-7
  // and under-quote the cost. Both directions are pinned: the in-table ones
  // must stay GSM-7 so ordinary copy is not overcharged, and the out-of-table
  // ones must be UCS-2 so campaign estimates stay honest.
  it("treats in-table accented Latin as GSM-7", () => {
    expect(detectSmsEncoding("caf\u00e9")).toBe("GSM-7");
    expect(detectSmsEncoding("ma\u00f1ana")).toBe("GSM-7");
    expect(detectSmsEncoding("\u00fcber \u00e4\u00f6\u00e4")).toBe("GSM-7");
  });

  it("classifies accented Latin outside the GSM tables as UNICODE", () => {
    expect(detectSmsEncoding("na\u00efve")).toBe("UNICODE");
    expect(detectSmsEncoding("\u017e\u010d\u0165")).toBe("UNICODE");
  });

  it("classifies typographic punctuation as UNICODE", () => {
    expect(detectSmsEncoding("don\u2019t \u2014 it\u2019s fine")).toBe("UNICODE");
  });

  it("accepts the GSM-7 extension characters", () => {
    expect(detectSmsEncoding("Price {50} EUR ~ \u20ac")).toBe("GSM-7");
  });
});

describe("calculateSmsSegments", () => {
  it("counts an empty body as zero segments", () => {
    const result = calculateSmsSegments("");
    expect(result.segmentCount).toBe(0);
    expect(result.characterCount).toBe(0);
  });

  it("bills GSM-7 as one segment up to 160 characters", () => {
    const result = calculateSmsSegments("a".repeat(GSM7_SINGLE));
    expect(result.encoding).toBe("GSM-7");
    expect(result.segmentCount).toBe(1);
    expect(result.charsRemaining).toBe(0);
  });

  it("bills GSM-7 as two segments past 160", () => {
    expect(calculateSmsSegments("a".repeat(161)).segmentCount).toBe(2);
    expect(calculateSmsSegments("a".repeat(306)).segmentCount).toBe(2);
    expect(calculateSmsSegments("a".repeat(307)).segmentCount).toBe(3);
  });

  it("bills Unicode as one segment up to 70 characters", () => {
    const result = calculateSmsSegments("\u1200".repeat(UCS2_SINGLE));
    expect(result.encoding).toBe("UNICODE");
    expect(result.segmentCount).toBe(1);
  });

  it("bills Unicode as two segments past 70", () => {
    expect(calculateSmsSegments("\u1200".repeat(71)).segmentCount).toBe(2);
    expect(calculateSmsSegments("\u1200".repeat(134)).segmentCount).toBe(2);
    expect(calculateSmsSegments("\u1200".repeat(135)).segmentCount).toBe(3);
  });

  // Amharic greetings blow past 70 fast. This is the cost trap: the same
  // content in English is one segment, in Amharic it is three.
  it("shows a 200-character Amharic body costing 3 segments", () => {
    expect(calculateSmsSegments("\u1200".repeat(200)).segmentCount).toBe(3);
    expect(calculateSmsSegments("a".repeat(200)).segmentCount).toBe(2);
  });

  it("reports headroom in the final segment", () => {
    const result = calculateSmsSegments("a".repeat(10));
    expect(result.charsRemaining).toBe(150);
  });

  it("counts astral characters as two UTF-16 code units", () => {
    // An emoji is one grapheme but two code units, and the carrier bills
    // code units — so [...text].length alone under-counts.
    const result = calculateSmsSegments("\u{1F389}".repeat(1));
    expect(result.characterCount).toBe(1);
    expect(result.encodedLength).toBe(2);
  });
});

describe("estimateSmsCostEtb", () => {
  it("quotes a band, not a false point estimate", () => {
    expect(estimateSmsCostEtb(1000)).toEqual({ min: 100, max: 450 });
  });

  it("is zero for zero segments", () => {
    expect(estimateSmsCostEtb(0)).toEqual({ min: 0, max: 0 });
  });

  it("rounds to two decimals", () => {
    const estimate = estimateSmsCostEtb(7);
    expect(estimate.min).toBe(0.7);
    expect(estimate.max).toBe(3.15);
  });
});

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("Hi {{name}} from {{city}}", { name: "Abebe", city: "Addis" }))
      .toBe("Hi Abebe from Addis");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ name }}", { name: "Abebe" })).toBe("Hi Abebe");
  });

  // Literal braces reaching a customer's handset look like a bug.
  it("collapses unknown placeholders to empty rather than leaking braces", () => {
    expect(renderTemplate("Hi {{name}} {{unknown}}", { name: "Abebe" }))
      .toBe("Hi Abebe ");
  });

  it("renders null and undefined as empty", () => {
    expect(renderTemplate("[{{a}}][{{b}}]", { a: null, b: undefined })).toBe("[][]");
  });
});