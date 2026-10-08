"""Pressure/temperature formula engine using the browser's bundled bubble/dew data."""
import json
import re
from pathlib import Path

TABLE = json.loads((Path(__file__).resolve().parents[1] / 'extension/data/r410a-pt.json').read_text())

TABLES = {name: json.loads((Path(__file__).resolve().parents[1] / f'extension/data/{filename}-pt.json').read_text()) for name, filename in [('R-410A', 'r410a'), ('R-22', 'r22')]}

def calculate_hvac(question):
    prompt = question['prompt'].replace('−', '-')
    def has(pattern):
        return bool(re.search(pattern, prompt, re.I))
    if not has(r'\b(?:psig|psia|psi|bar|kpa)\b'):
        return None
    sub, superheat = has(r'\bsub[- ]?cool(?:ing|ed)?\b'), has(r'\bsuperheat(?:ing)?\b')
    kind = 'subcooling' if sub else 'superheat' if superheat else 'saturation' if has(r'\b(?:saturated|saturation|boil(?:ing)?|condens(?:ing|ation))\b') and has(r'\btemperature\b') else None
    if not kind:
        return None
    def fail(message):
        raise ValueError(kind.capitalize() + ' calculation paused: ' + message)
    if has(r'\b(?:not|except)\b') or (sub and superheat):
        fail('the question needs interpretation beyond one direct calculation.')
    fluids = {'R-' + match.upper() for match in re.findall(r'\br\s*-?\s*(\d{2,4}[a-z]*)\b', re.sub('[−–‑]', '-', prompt), re.I)}
    if len(fluids) != 1 or next(iter(fluids)) not in TABLES:
        fail('the bundled lookup supports R-410A and R-22 only. Identify one supported refrigerant or review the chart manually.')
    fluid = next(iter(fluids))
    table = TABLES[fluid]
    if kind == 'subcooling' and (not has(r'\b(?:condenser|liquid[- ]line)\b') or not has(r'\b(?:outlet|liquid[- ]line)\b')):
        fail('identify a condenser outlet or liquid-line temperature.')
    if kind == 'superheat' and not has(r'\b(?:suction|vapor|vapour|gas|evaporator)\b'):
        fail('identify a measured vapor/suction temperature.')
    pressures = re.findall(r'(-?\d+(?:\.\d+)?)\s*(psig|psia|psi|bar|kpa)\b', prompt, re.I)
    temperatures = re.findall(r'(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?(f(?:ahrenheit)?|c(?:elsius)?)\b', prompt, re.I)
    if len(pressures) != 1 or pressures[0][1].lower() != 'psig':
        fail('supply one gauge pressure in psig; psia and other units are not supported yet.')
    if (len(temperatures) != 0 if kind == 'saturation' else len(temperatures) != 1 or not temperatures[0][1].lower().startswith('f')):
        fail('supply one measured temperature in °F for subcooling/superheat, or none for a pressure-only lookup; multiple temperatures and Celsius need manual review.')
    pressure = float(pressures[0][0])
    def lookup(rows):
        if not rows or not rows[0][0] <= pressure <= rows[-1][0]:
            fail('pressure is outside the bundled table range.')
        upper = next(index for index, row in enumerate(rows) if row[0] >= pressure)
        p2, t2 = rows[upper]
        p1, t1 = rows[max(0, upper - 1)]
        return t2 if p1 == p2 else t1 + (pressure - p1) * (t2 - t1) / (p2 - p1)
    def choice_for(value):
        matches = []
        for index, choice in enumerate(question['choices']):
            match = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?f(?:ahrenheit)?\s*\.?\s*', choice.replace('−', '-'), re.I)
            if not match:
                fail('answer choices must be temperatures in °F.')
            if abs(float(match[1]) - value) <= .5:
                matches.append(index)
        if len(matches) != 1:
            fail('the result does not match exactly one choice within 0.5°F.')
        return matches[0]
    if kind == 'saturation':
        liquid, vapor = has(r'\b(?:liquid|bubble)\b'), has(r'\b(?:vapor|vapour|dew)\b')
        if liquid and vapor:
            fail('specify one liquid/bubble or vapor/dew saturation point.')
        if liquid or vapor:
            saturation = lookup(table.get('dew_points') if vapor else table['points'])
            index = choice_for(saturation)
            phase = 'dew' if vapor else 'bubble'
            explanation = f'{fluid} {phase}-point saturation ≈ {saturation:.1f}°F at {pressure:g} psig; matching choice: {question["choices"][index]}.'
        else:
            bubble, dew = lookup(table['points']), lookup(table.get('dew_points'))
            index = choice_for(bubble)
            if choice_for(dew) != index:
                fail('bubble and dew points select different choices; specify the phase.')
            explanation = f'{fluid} at {pressure:g} psig: bubble ≈ {bubble:.1f}°F, dew ≈ {dew:.1f}°F. The matching choice is {question["choices"][index]}; pressure is not a temperature.'
    else:
        measured = float(temperatures[0][0])
        saturation = lookup(table['points'] if kind == 'subcooling' else table.get('dew_points'))
        value = saturation - measured if kind == 'subcooling' else measured - saturation
        if value < 0:
            fail('the measured temperature is above saturation; these inputs do not describe subcooled liquid.' if kind == 'subcooling' else 'the measured temperature is below saturation; these inputs do not describe superheated vapor.')
        index = choice_for(value)
        if kind == 'subcooling':
            explanation = f'{fluid} saturation ≈ {saturation:.1f}°F at {pressure:g} psig. Subcooling = {saturation:.1f} − {measured:g} ≈ {value:.1f}°F; closest choice: {question["choices"][index]}.'
        else:
            explanation = f'{fluid} dew-point saturation ≈ {saturation:.1f}°F at {pressure:g} psig. Superheat = {measured:g} − {saturation:.1f} ≈ {value:.1f}°F; closest choice: {question["choices"][index]}.'
    return {'index': index, 'answer_text': question['choices'][index], 'confidence': 1,
            'calculated': True, 'provider': 'calculator', 'analysis_mode': 'single_pass',
            'reference_count': len(question.get('references', [])), 'cached': False,
            'explanation': explanation, 'calculation_source': table['source'], 'calculation_source_url': table['source_url']}


calculate_subcooling = calculate_hvac  # Backward-compatible entry point for existing checks.
