// Deterministic textbook calculations. Unsupported numerical inputs never go to AI.
(() => {
  function calculateSubcooling(question, table) {
    const prompt = question.prompt.replace(/−/g, '-');
    if (!/\bsub[- ]?cool(?:ing|ed)?\b/i.test(prompt) || !/\b(?:psig|psia|psi|bar|kpa)\b/i.test(prompt)) return null;
    const fail = message => { throw Error('Subcooling calculation paused: ' + message); };
    if (/\b(?:not|except|superheat)\b/i.test(prompt)) fail('the question needs interpretation beyond a direct subcooling calculation.');
    if (!/\br\s*-?\s*410a\b/i.test(prompt) || /\br\s*-?\s*(?!410a\b)\d{2,4}[a-z]*\b/i.test(prompt)) fail('the bundled lookup supports R-410A only. Review the refrigerant chart manually.');
    if (!/\b(?:condenser|liquid[- ]line)\b/i.test(prompt) || !/\b(?:outlet|liquid[- ]line)\b/i.test(prompt)) fail('identify a condenser outlet or liquid-line temperature.');
    const pressures = [...prompt.matchAll(/(-?\d+(?:\.\d+)?)\s*(psig|psia|psi|bar|kpa)\b/gi)];
    const temperatures = [...prompt.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?(f(?:ahrenheit)?|c(?:elsius)?)\b/gi)];
    if (pressures.length !== 1 || pressures[0][2].toLowerCase() !== 'psig') fail('supply one gauge pressure in psig; psia and other units are not supported yet.');
    if (temperatures.length !== 1 || !/^f/i.test(temperatures[0][2])) fail('supply one liquid temperature in °F; multiple temperatures and Celsius need manual review.');
    if (table.refrigerant !== 'R-410A' || table.pressure_unit !== 'psig' || table.temperature_unit !== 'degF') fail('the pressure–temperature table is invalid.');
    const pressure = Number(pressures[0][1]), liquid = Number(temperatures[0][1]);
    const rows = table.points;
    if (pressure < rows[0][0] || pressure > rows.at(-1)[0]) fail('pressure is outside the bundled table range.');
    const upper = rows.findIndex(row => row[0] >= pressure);
    const [p2, t2] = rows[upper];
    const [p1, t1] = rows[Math.max(0, upper - 1)];
    const saturation = p1 === p2 ? t2 : t1 + (pressure - p1) * (t2 - t1) / (p2 - p1);
    const result = saturation - liquid;
    if (result < 0) fail('the measured temperature is above saturation; these inputs do not describe subcooled liquid.');
    const choices = question.choices.map((choice, index) => {
      const match = choice.replace(/−/g, '-').match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?f(?:ahrenheit)?\s*$/i);
      return match ? {index, error: Math.abs(Number(match[1]) - result)} : null;
    });
    if (choices.some(choice => !choice)) fail('answer choices must be temperatures in °F.');
    const matches = choices.filter(choice => choice.error <= 0.5);
    if (matches.length !== 1) fail('the result does not match exactly one choice within 0.5°F.');
    const index = matches[0].index;
    return {index, answer_text: question.choices[index], confidence: 1, calculated: true,
      provider: 'calculator', analysis_mode: 'single_pass', reference_count: (question.references || []).length, cached: false,
      explanation: `R-410A saturation ≈ ${saturation.toFixed(1)}°F at ${pressure} psig. Subcooling = ${saturation.toFixed(1)} − ${liquid} ≈ ${result.toFixed(1)}°F; closest choice: ${question.choices[index]}.`,
      calculation_source: table.source, calculation_source_url: table.source_url};
  }
  globalThis.hvacCalculator = {calculateSubcooling};
})();
