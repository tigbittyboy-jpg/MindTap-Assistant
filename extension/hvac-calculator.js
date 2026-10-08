// Formula engine: look up actual saturation data, then calculate with correct units.
(() => {
  function kind(prompt) {
    if (!/\b(?:psig|psia|psi|bar|kpa)\b/i.test(prompt)) return null;
    const sub = /\bsub[- ]?cool(?:ing|ed)?\b/i.test(prompt);
    const superheat = /\bsuperheat(?:ing)?\b/i.test(prompt);
    if (sub) return 'subcooling';
    if (superheat) return 'superheat';
    if (/\b(?:saturated|saturation|boil(?:ing)?|condens(?:ing|ation))\b/i.test(prompt) && /\btemperature\b/i.test(prompt)) return 'saturation';
    return null;
  }
  function refrigerant(prompt) {
    const names = [...prompt.replace(/[−–‑]/g, '-').matchAll(/\br\s*-?\s*(c?\d{2,4}[a-z]*(?:\([ez]\))?)(?![a-z0-9(])/gi)].map(match => 'R-' + match[1].toUpperCase());
    const unique = [...new Set(names)];
    return unique.length === 1 ? unique[0] : null;
  }
  function calculateHVAC(question, table) {
    const prompt = question.prompt.replace(/−/g, '-');
    const type = kind(prompt);
    if (!type) return null;
    const fail = message => { throw Error(`${type === 'subcooling' ? 'Subcooling' : type === 'superheat' ? 'Superheat' : 'Saturation'} calculation paused: ${message}`); };
    if (/\b(?:not|except)\b/i.test(prompt) || (/\bsub[- ]?cool/i.test(prompt) && /\bsuperheat/i.test(prompt))) fail('the question needs interpretation beyond one direct calculation.');
    const fluid = refrigerant(prompt);
    if (!fluid || !table.refrigerant) fail('identify one supported refrigerant; no bundled PT data is available for this selection. Review its chart manually.');
    if (type === 'subcooling' && (!/\b(?:condenser|liquid[- ]line)\b/i.test(prompt) || !/\b(?:outlet|liquid[- ]line)\b/i.test(prompt))) fail('identify a condenser outlet or liquid-line temperature.');
    if (type === 'superheat' && !/\b(?:suction|vapor|vapour|gas|evaporator)\b|\b(?:compressor\s+inlet|inlet\s+(?:of\s+)?(?:the\s+)?compressor)\b/i.test(prompt)) fail('identify a measured vapor/suction temperature.');
    const measurements = prompt.replace(/\br\s*-?\s*c?\d{2,4}[a-z]*(?:\([ez]\))?(?![a-z0-9(])/gi, '');
    const pressures = [...measurements.matchAll(/(-?\d+(?:\.\d+)?)\s*(psig|psia|psi|bar|kpa)\b/gi)];
    const temperatures = [...measurements.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?(f(?:ahrenheit)?|c(?:elsius)?)\b/gi)];
    if (pressures.length !== 1 || pressures[0][2].toLowerCase() !== 'psig') fail('supply one gauge pressure in psig; psia and other units are not supported yet.');
    if (type === 'saturation' ? temperatures.length !== 0 : temperatures.length !== 1 || !/^f/i.test(temperatures[0][2])) fail('supply one measured temperature in °F for subcooling/superheat, or none for a pressure-only lookup; multiple temperatures and Celsius need manual review.');
    if ((table.refrigerant !== fluid && !(table.aliases || []).includes(fluid)) || table.pressure_unit !== 'psig' || table.temperature_unit !== 'degF') fail('the pressure–temperature table is invalid; identify one supported refrigerant and its matching table.');
    const pressure = Number(pressures[0][1]);
    function lookup(rows) {
      if (!rows || pressure < rows[0][0] || pressure > rows.at(-1)[0]) fail('pressure is outside the bundled table range.');
      const upper = rows.findIndex(row => row[0] >= pressure);
      const [p2, t2] = rows[upper], [p1, t1] = rows[Math.max(0, upper - 1)];
      return p1 === p2 ? t2 : t1 + (pressure - p1) * (t2 - t1) / (p2 - p1);
    }
    function choiceFor(value) {
      const values = question.choices.map((choice, index) => {
        const match = choice.replace(/−/g, '-').match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?f(?:ahrenheit)?\s*\.?\s*$/i);
        return match ? {index, error: Math.abs(Number(match[1]) - value)} : null;
      });
      if (values.some(value => !value)) fail('answer choices must be temperatures in °F.');
      const matches = values.filter(value => value.error <= .5);
      if (matches.length !== 1) fail('the result does not match exactly one choice within 0.5°F.');
      return matches[0].index;
    }
    let index, explanation;
    if (type === 'saturation') {
      const liquid = /\b(?:liquid|bubble)\b/i.test(prompt), vapor = /\b(?:vapor|vapour|dew)\b/i.test(prompt);
      if (liquid && vapor) fail('specify one liquid/bubble or vapor/dew saturation point.');
      if (liquid || vapor) {
        const saturation = lookup(vapor ? table.dew_points : table.points);
        index = choiceFor(saturation);
        explanation = `${fluid} ${vapor ? 'dew' : 'bubble'}-point saturation ≈ ${saturation.toFixed(1)}°F at ${pressure} psig; matching choice: ${question.choices[index]}.`;
      } else {
        const bubble = lookup(table.points), dew = lookup(table.dew_points);
        index = choiceFor(bubble);
        if (choiceFor(dew) !== index) fail('bubble and dew points select different choices; specify the phase.');
        explanation = `${fluid} at ${pressure} psig: bubble ≈ ${bubble.toFixed(1)}°F, dew ≈ ${dew.toFixed(1)}°F. The matching choice is ${question.choices[index]}; pressure is not a temperature.`;
      }
    } else {
      const measured = Number(temperatures[0][1]);
      const saturation = lookup(type === 'subcooling' ? table.points : table.dew_points);
      const value = type === 'subcooling' ? saturation - measured : measured - saturation;
      if (value < 0) fail(type === 'subcooling' ? 'the measured temperature is above saturation; these inputs do not describe subcooled liquid.' : 'the measured temperature is below saturation; these inputs do not describe superheated vapor.');
      index = choiceFor(value);
      explanation = type === 'subcooling'
        ? `${fluid} saturation ≈ ${saturation.toFixed(1)}°F at ${pressure} psig. Subcooling = ${saturation.toFixed(1)} − ${measured} ≈ ${value.toFixed(1)}°F; closest choice: ${question.choices[index]}.`
        : `${fluid} dew-point saturation ≈ ${saturation.toFixed(1)}°F at ${pressure} psig. Superheat = ${measured} − ${saturation.toFixed(1)} ≈ ${value.toFixed(1)}°F; closest choice: ${question.choices[index]}.`;
    }
    return {index, answer_text: question.choices[index], confidence: 1, calculated: true,
      provider: 'calculator', analysis_mode: 'single_pass', reference_count: (question.references || []).length, cached: false,
      explanation, calculation_source: table.source, calculation_source_url: table.source_url};
  }
  globalThis.hvacCalculator = {kind, refrigerant, calculateHVAC, calculateSubcooling: calculateHVAC};
})();
