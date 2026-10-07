"""Deterministic R-410A subcooling, sharing the browser's bundled EOS table."""
import json
import re
from pathlib import Path

TABLE = json.loads((Path(__file__).resolve().parents[1] / 'extension/data/r410a-pt.json').read_text())


def calculate_subcooling(question):
    prompt = question['prompt'].replace('−', '-')
    if not re.search(r'\bsub[- ]?cool(?:ing|ed)?\b', prompt, re.I) or not re.search(r'\b(?:psig|psia|psi|bar|kpa)\b', prompt, re.I):
        return None
    def fail(message):
        raise ValueError('Subcooling calculation paused: ' + message)
    if re.search(r'\b(?:not|except|superheat)\b', prompt, re.I):
        fail('the question needs interpretation beyond a direct subcooling calculation.')
    if not re.search(r'\br\s*-?\s*410a\b', prompt, re.I) or re.search(r'\br\s*-?\s*(?!410a\b)\d{2,4}[a-z]*\b', prompt, re.I):
        fail('the bundled lookup supports R-410A only. Review the refrigerant chart manually.')
    if not re.search(r'\b(?:condenser|liquid[- ]line)\b', prompt, re.I) or not re.search(r'\b(?:outlet|liquid[- ]line)\b', prompt, re.I):
        fail('identify a condenser outlet or liquid-line temperature.')
    pressures = re.findall(r'(-?\d+(?:\.\d+)?)\s*(psig|psia|psi|bar|kpa)\b', prompt, re.I)
    temperatures = re.findall(r'(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?(f(?:ahrenheit)?|c(?:elsius)?)\b', prompt, re.I)
    if len(pressures) != 1 or pressures[0][1].lower() != 'psig':
        fail('supply one gauge pressure in psig; psia and other units are not supported yet.')
    if len(temperatures) != 1 or not temperatures[0][1].lower().startswith('f'):
        fail('supply one liquid temperature in °F; multiple temperatures and Celsius need manual review.')
    pressure, liquid = float(pressures[0][0]), float(temperatures[0][0])
    rows = TABLE['points']
    if not rows[0][0] <= pressure <= rows[-1][0]:
        fail('pressure is outside the bundled table range.')
    upper = next(index for index, row in enumerate(rows) if row[0] >= pressure)
    p2, t2 = rows[upper]
    p1, t1 = rows[max(0, upper - 1)]
    saturation = t2 if p1 == p2 else t1 + (pressure - p1) * (t2 - t1) / (p2 - p1)
    result = saturation - liquid
    if result < 0:
        fail('the measured temperature is above saturation; these inputs do not describe subcooled liquid.')
    matches = []
    for index, choice in enumerate(question['choices']):
        match = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?f(?:ahrenheit)?\s*', choice.replace('−', '-'), re.I)
        if not match:
            fail('answer choices must be temperatures in °F.')
        if abs(float(match[1]) - result) <= .5:
            matches.append(index)
    if len(matches) != 1:
        fail('the result does not match exactly one choice within 0.5°F.')
    index = matches[0]
    return {'index': index, 'answer_text': question['choices'][index], 'confidence': 1,
            'calculated': True, 'provider': 'calculator', 'analysis_mode': 'single_pass',
            'reference_count': len(question.get('references', [])), 'cached': False,
            'explanation': f'R-410A saturation ≈ {saturation:.1f}°F at {pressure:g} psig. Subcooling = {saturation:.1f} − {liquid:g} ≈ {result:.1f}°F; closest choice: {question["choices"][index]}.',
            'calculation_source': TABLE['source'], 'calculation_source_url': TABLE['source_url']}
